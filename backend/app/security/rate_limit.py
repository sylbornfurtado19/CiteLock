"""Per-user sliding-window rate limiting for the query endpoints.

Every query spends model-provider quota, so each user is limited per minute and per hour. State is in process
memory: correct for a single backend instance (the Render deployment runs one worker). Running several
instances would multiply the effective limit; move the counters to Redis if that ever becomes necessary.
"""

import threading
import time
from collections import deque
from typing import Deque, Dict, Iterable, Optional, Tuple

from fastapi import Depends, HTTPException, status

from app.api.deps import get_current_user
from app.config import get_settings
from app.db.models.users import User

Rule = Tuple[int, float]  # (max requests, window seconds)


class SlidingWindowLimiter:
    """Thread-safe sliding-window counter keyed by an arbitrary string (here, the user id)."""

    _SWEEP_THRESHOLD = 5000

    def __init__(self) -> None:
        self._hits: Dict[str, Deque[float]] = {}
        self._lock = threading.Lock()

    def acquire(self, key: str, rules: Iterable[Rule], now: Optional[float] = None) -> Optional[float]:
        """Record a request unless a rule is exceeded. Returns None when allowed, else seconds until retry."""
        active = [(limit, window) for limit, window in rules if limit > 0]
        if not active:
            return None
        now = time.monotonic() if now is None else now
        longest = max(window for _, window in active)

        with self._lock:
            hits = self._hits.setdefault(key, deque())
            while hits and hits[0] <= now - longest:
                hits.popleft()

            retry_after = 0.0
            for limit, window in active:
                in_window = [t for t in hits if t > now - window]
                if len(in_window) >= limit:
                    retry_after = max(retry_after, in_window[0] + window - now)
            if retry_after > 0:
                return retry_after

            hits.append(now)
            if len(self._hits) > self._SWEEP_THRESHOLD:
                self._sweep(now, longest)
            return None

    def _sweep(self, now: float, longest: float) -> None:
        for k in [k for k, d in self._hits.items() if not d or d[-1] <= now - longest]:
            del self._hits[k]

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


query_rate_limiter = SlidingWindowLimiter()


def enforce_query_rate_limit(current_user: User = Depends(get_current_user)) -> None:
    """FastAPI dependency: reject with 429 and a Retry-After header when the user is over their query budget."""
    settings = get_settings()
    retry_after = query_rate_limiter.acquire(
        str(current_user.id),
        [(settings.query_rate_limit_per_minute, 60.0), (settings.query_rate_limit_per_hour, 3600.0)],
    )
    if retry_after is not None:
        seconds = max(1, int(retry_after) + 1)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many queries. Please wait {seconds} second{'s' if seconds != 1 else ''} before asking again.",
            headers={"Retry-After": str(seconds)},
        )
