"""Deterministic pipeline response caching and concurrency coordination service.

Provides:
1. Thread-safe in-memory TTL LRU cache with configurable capacity and TTL (default 10 min).
2. Deterministic SHA-256 cache key derivation incorporating workspace ID, normalized prompt,
   active document set version/content fingerprint, and model/retrieval configuration.
3. SingleFlight coordinator preventing cache stampedes (thundering herd) during concurrent identical queries.
4. Granular cache invalidation on document upload, indexing, reindexing, and deletion.
5. Telemetry metrics for hits, misses, expirations, invalidations, and evictions.
6. Safety verification filters preventing incomplete or failed verification runs from caching.
"""

import hashlib
import json
import logging
import re
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Tuple
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models.documents import Document

logger = logging.getLogger(__name__)


@dataclass
class CacheEntry:
    key: str
    workspace_id: str
    data: Dict[str, Any]
    created_at: float
    expires_at: float
    cached_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class CacheMetrics:
    hits: int = 0
    misses: int = 0
    expirations: int = 0
    invalidations: int = 0
    evictions: int = 0

    @property
    def total_requests(self) -> int:
        return self.hits + self.misses

    @property
    def hit_rate(self) -> float:
        total = self.total_requests
        return round(self.hits / total, 4) if total > 0 else 0.0

    @property
    def miss_rate(self) -> float:
        total = self.total_requests
        return round(self.misses / total, 4) if total > 0 else 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "hits": self.hits,
            "misses": self.misses,
            "expirations": self.expirations,
            "invalidations": self.invalidations,
            "evictions": self.evictions,
            "total_requests": self.total_requests,
            "hit_rate": self.hit_rate,
            "miss_rate": self.miss_rate,
        }


class _SingleFlightCall:
    def __init__(self):
        self.event = threading.Event()
        self.result: Any = None
        self.error: Optional[Exception] = None


class SingleFlightCoordinator:
    """Coordinates simultaneous duplicate requests so only one executes while others wait and reuse."""

    def __init__(self):
        self._mutex = threading.Lock()
        self._calls: Dict[str, _SingleFlightCall] = {}

    def do(self, key: str, fn: Callable[[], Any]) -> Tuple[Any, bool]:
        """
        Execute fn once for key. Concurrent callers with identical key wait for the leader's result.
        Returns: (result, is_leader: bool)
        """
        with self._mutex:
            if key in self._calls:
                call = self._calls[key]
                is_leader = False
            else:
                call = _SingleFlightCall()
                self._calls[key] = call
                is_leader = True

        if not is_leader:
            call.event.wait()
            if call.error is not None:
                raise call.error
            return call.result, False

        try:
            call.result = fn()
            return call.result, True
        except Exception as exc:
            call.error = exc
            raise
        finally:
            with self._mutex:
                self._calls.pop(key, None)
            call.event.set()


class InMemoryTTLCache:
    """Thread-safe LRU cache with per-item TTL expiration and workspace-scoped invalidation."""

    def __init__(self, max_entries: int = 1000):
        self._max_entries = max_entries
        self._entries: OrderedDict[str, CacheEntry] = OrderedDict()
        self._workspace_keys: Dict[str, set] = {}
        self._lock = threading.RLock()
        self._metrics = CacheMetrics()

    def get(self, key: str, workspace_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        now = time.time()
        with self._lock:
            if key not in self._entries:
                self._metrics.misses += 1
                return None

            entry = self._entries[key]

            # Cross-workspace isolation safeguard
            if workspace_id and entry.workspace_id != str(workspace_id):
                logger.warning("Cache access denied: key workspace %s != requested %s", entry.workspace_id, workspace_id)
                self._metrics.misses += 1
                return None

            # TTL expiration check
            if now > entry.expires_at:
                self._metrics.expirations += 1
                self._metrics.misses += 1
                self._remove_key_locked(key)
                return None

            # Cache hit: promote to most recently used
            self._entries.move_to_end(key)
            self._metrics.hits += 1
            return dict(entry.data)

    def set(self, key: str, workspace_id: str, data: Dict[str, Any], ttl_seconds: int = 600) -> None:
        now = time.time()
        expires_at = now + ttl_seconds
        ws_str = str(workspace_id)
        entry = CacheEntry(
            key=key,
            workspace_id=ws_str,
            data=dict(data),
            created_at=now,
            expires_at=expires_at,
        )

        with self._lock:
            if key in self._entries:
                self._remove_key_locked(key)

            # Evict least recently used entries if at capacity
            while len(self._entries) >= self._max_entries:
                oldest_key, _ = self._entries.popitem(last=False)
                self._metrics.evictions += 1
                self._remove_workspace_index_locked(oldest_key)

            self._entries[key] = entry
            if ws_str not in self._workspace_keys:
                self._workspace_keys[ws_str] = set()
            self._workspace_keys[ws_str].add(key)

    def invalidate_workspace(self, workspace_id: str) -> int:
        ws_str = str(workspace_id)
        with self._lock:
            keys = self._workspace_keys.pop(ws_str, set())
            count = len(keys)
            for k in keys:
                self._entries.pop(k, None)
            self._metrics.invalidations += count
            if count > 0:
                logger.info("Invalidated %d cache entries for workspace %s", count, ws_str)
            return count

    def clear(self) -> int:
        with self._lock:
            count = len(self._entries)
            self._entries.clear()
            self._workspace_keys.clear()
            self._metrics.invalidations += count
            return count

    def get_metrics(self) -> Dict[str, Any]:
        with self._lock:
            m = self._metrics.to_dict()
            m["size"] = len(self._entries)
            m["max_entries"] = self._max_entries
            m["workspace_count"] = len(self._workspace_keys)
            return m

    def reset_metrics(self) -> None:
        with self._lock:
            self._metrics = CacheMetrics()

    def _remove_key_locked(self, key: str) -> None:
        entry = self._entries.pop(key, None)
        if entry:
            self._remove_workspace_index_locked(key, entry.workspace_id)

    def _remove_workspace_index_locked(self, key: str, workspace_id: Optional[str] = None) -> None:
        if workspace_id and workspace_id in self._workspace_keys:
            self._workspace_keys[workspace_id].discard(key)
            if not self._workspace_keys[workspace_id]:
                self._workspace_keys.pop(workspace_id, None)
        else:
            for ws_id, keys in list(self._workspace_keys.items()):
                keys.discard(key)
                if not keys:
                    self._workspace_keys.pop(ws_id, None)


def compute_workspace_document_fingerprint(db: Session, workspace_id: UUID) -> str:
    """
    Compute deterministic content fingerprint for active indexed documents in workspace.
    Incorporates count, highest updated_at/created_at timestamp, and checksum aggregation.
    """
    rows = (
        db.query(Document.id, Document.checksum, Document.updated_at, Document.created_at)
        .filter(Document.workspace_id == workspace_id, Document.status == "indexed")
        .order_by(Document.id.asc())
        .all()
    )
    if not rows:
        return "empty"

    h = hashlib.sha256()
    for doc_id, checksum, updated_at, created_at in rows:
        ts = (updated_at or created_at).isoformat() if (updated_at or created_at) else ""
        h.update(f"{doc_id}:{checksum}:{ts}".encode("utf-8"))
    return h.hexdigest()[:16]


def normalize_prompt(prompt: str) -> str:
    """Canonicalize prompt by stripping leading/trailing spaces and collapsing internal whitespace."""
    if not prompt:
        return ""
    return re.sub(r"\s+", " ", prompt).strip()


def compute_pipeline_cache_key(
    db: Session,
    workspace_id: UUID,
    prompt: str,
    top_k: int = 5,
    extra_config: Optional[Dict[str, Any]] = None,
) -> str:
    """
    Generate deterministic SHA-256 cache key composed of:
    1. Workspace UUID (strict multi-tenant isolation)
    2. Normalized prompt
    3. Active indexed document set fingerprint (count + checksums + timestamps)
    4. Retrieval and verification configuration versions (top_k, LLM provider, models, policies)
    """
    settings = get_settings()

    # 1. Workspace scope
    ws_str = str(workspace_id)

    # 2. Canonical prompt hash
    clean_p = normalize_prompt(prompt)
    prompt_hash = hashlib.sha256(clean_p.encode("utf-8")).hexdigest()

    # 3. Document set fingerprint
    doc_fingerprint = compute_workspace_document_fingerprint(db, workspace_id)

    # 4. Configuration fingerprint
    cfg_data = {
        "top_k": top_k,
        "llm_provider": settings.llm_provider,
        "llm_model": settings.openai_llm_model if settings.llm_provider == "openai" else settings.gemini_llm_model,
        "embedding_provider": settings.embedding_provider,
        "embedding_model": settings.openai_embedding_model if settings.embedding_provider == "openai" else settings.gemini_embedding_model,
        "max_retries": settings.max_correction_retries,
        **(extra_config or {}),
    }
    cfg_str = json.dumps(cfg_data, sort_keys=True)
    cfg_hash = hashlib.sha256(cfg_str.encode("utf-8")).hexdigest()[:16]

    raw_key = f"ws:{ws_str}:doc:{doc_fingerprint}:cfg:{cfg_hash}:p:{prompt_hash}"
    return f"citelock:q:{hashlib.sha256(raw_key.encode('utf-8')).hexdigest()}"


def is_safe_to_cache(pipeline_result: Dict[str, Any]) -> bool:
    """
    Verify whether pipeline output represents a complete, successful verification pass.
    Disallows caching for failed providers, verification errors, or unverified errors.
    """
    verification_status = pipeline_result.get("verification_status")
    if verification_status not in ("verified", "partially_verified", "abstained"):
        return False

    claims = pipeline_result.get("claims", [])
    if any(c.get("verdict") == "verification_error" for c in claims):
        return False

    query_obj = pipeline_result.get("query")
    if query_obj and getattr(query_obj, "status", None) != "completed":
        return False

    return True


class PipelineCacheService:
    """Global singleton managing deterministic query and retrieval caching."""

    def __init__(self):
        settings = get_settings()
        self._cache = InMemoryTTLCache(max_entries=settings.pipeline_cache_max_entries)
        self._single_flight = SingleFlightCoordinator()

    @property
    def is_enabled(self) -> bool:
        return get_settings().pipeline_cache_enabled

    def get(self, key: str, workspace_id: Optional[UUID] = None) -> Optional[Dict[str, Any]]:
        if not self.is_enabled:
            return None
        return self._cache.get(key, str(workspace_id) if workspace_id else None)

    def set(
        self,
        key: str,
        workspace_id: UUID,
        data: Dict[str, Any],
        ttl_seconds: Optional[int] = None,
    ) -> None:
        if not self.is_enabled:
            return
        ttl = ttl_seconds or get_settings().pipeline_cache_ttl_seconds
        self._cache.set(key, str(workspace_id), data, ttl_seconds=ttl)

    def invalidate_workspace(self, workspace_id: UUID) -> int:
        return self._cache.invalidate_workspace(str(workspace_id))

    def clear(self) -> int:
        return self._cache.clear()

    def get_metrics(self) -> Dict[str, Any]:
        return self._cache.get_metrics()

    def reset_metrics(self) -> None:
        self._cache.reset_metrics()

    @property
    def single_flight(self) -> SingleFlightCoordinator:
        return self._single_flight


# Global singleton instance
pipeline_cache_service = PipelineCacheService()
