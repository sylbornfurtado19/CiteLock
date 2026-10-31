"""Pydantic data validation schemas, request/response models, and Verdict enumeration."""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import UUID
from pydantic import BaseModel, Field, ConfigDict, model_validator, field_validator, AliasChoices


class Verdict(str, Enum):
    """Categorical classification of an atomic claim evaluated against retrieved evidence."""

    SUPPORTED = "supported"
    PARTIALLY_SUPPORTED = "partially_supported"
    CONTRADICTED = "contradicted"
    UNSUPPORTED = "unsupported"
    INSUFFICIENT_EVIDENCE = "insufficient_evidence"
    VERIFICATION_ERROR = "verification_error"


# Workspace Schemas
class WorkspaceBase(BaseModel):
    name: str = Field(..., max_length=255)
    description: Optional[str] = None


class WorkspaceCreate(WorkspaceBase):
    pass


class WorkspaceRead(WorkspaceBase):
    id: UUID
    owner_id: UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# Document Schemas
class DocumentStatus(str, Enum):
    UPLOADED = "uploaded"
    PROCESSING = "processing"
    INDEXED = "indexed"
    FAILED = "failed"


class DocumentRead(BaseModel):
    id: UUID
    workspace_id: UUID
    filename: str
    storage_path: str
    checksum: str
    status: str
    file_size_bytes: int
    mime_type: str
    error_message: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = Field(
        default_factory=dict, validation_alias=AliasChoices("metadata_", "metadata"), serialization_alias="metadata"
    )
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class DocumentSignedUrlResponse(BaseModel):
    document_id: UUID
    filename: str
    download_url: str
    expires_in_seconds: int


# Chunk Schemas
class ChunkRead(BaseModel):
    id: UUID
    document_id: UUID
    chunk_index: int
    content: str
    token_count: Optional[int] = None
    metadata: Optional[Dict[str, Any]] = Field(
        default_factory=dict, validation_alias=AliasChoices("metadata_", "metadata"), serialization_alias="metadata"
    )
    created_at: datetime

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class SearchResult(BaseModel):
    chunk_id: UUID
    document_id: UUID
    filename: str
    chunk_index: int
    content: str
    score: float
    metadata: Dict[str, Any] = Field(default_factory=dict)


# Evidence & Claim Schemas
class EvidenceLinkRead(BaseModel):
    id: UUID
    claim_id: UUID
    chunk_id: Optional[UUID] = None
    document_filename: Optional[str] = None
    relevance_score: Optional[float] = None
    exact_quote: Optional[str] = None
    start_char_offset: Optional[int] = None
    end_char_offset: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class ClaimRead(BaseModel):
    id: UUID
    answer_id: UUID
    claim_index: int
    claim_text: str
    verdict: Verdict
    confidence_score: Optional[float] = None
    rationale: Optional[str] = None
    explanation: Optional[str] = None
    evidence_references: List[Any] = Field(default_factory=list)
    cited_chunk_ids: List[Any] = Field(default_factory=list)
    source_excerpts: List[str] = Field(default_factory=list)
    verification_metadata: Optional[Dict[str, Any]] = None
    evidence_links: List[EvidenceLinkRead] = []

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="after")
    def populate_evidence_references(self) -> "ClaimRead":
        if not self.evidence_references and self.evidence_links:
            self.evidence_references = [link.chunk_id for link in self.evidence_links if link.chunk_id]
        if not self.cited_chunk_ids and self.evidence_links:
            self.cited_chunk_ids = [link.chunk_id for link in self.evidence_links if link.chunk_id]
        if not self.source_excerpts and self.evidence_links:
            self.source_excerpts = [link.exact_quote for link in self.evidence_links if link.exact_quote]
        return self


# Query & Answer Schemas
class QueryCreate(BaseModel):
    prompt: str = Field(..., min_length=1)
    top_k: int = Field(default=5, ge=1, le=20)
    strictness: str = Field(default="high")

    @field_validator("prompt")
    @classmethod
    def validate_prompt(cls, v: str) -> str:
        if isinstance(v, str):
            v = v.strip()
        if not v:
            raise ValueError("Prompt cannot be empty or whitespace only.")
        return v


class AnswerRead(BaseModel):
    id: UUID
    query_id: UUID
    draft_text: str
    final_text: str
    correction_rounds: int
    is_abstained: bool
    claims: List[ClaimRead] = []
    correction_history: List[Dict[str, Any]] = Field(default_factory=list)
    verification_status: Optional[str] = None
    execution_metadata: Optional[Dict[str, Any]] = Field(default_factory=dict)
    metrics: Optional[Dict[str, Any]] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def extract_from_model_config(cls, data: Any) -> Any:
        cfg = getattr(data, "model_config_data", None)
        if not isinstance(cfg, dict) and isinstance(data, dict):
            cfg = data.get("model_config_data") or data.get("model_config") or {}
        if isinstance(cfg, dict):
            if isinstance(data, dict):
                if not data.get("correction_history") and "correction_history" in cfg:
                    data["correction_history"] = cfg["correction_history"]
                if not data.get("verification_status") and "verification_status" in cfg:
                    data["verification_status"] = cfg["verification_status"]
                if not data.get("execution_metadata") and "execution_metadata" in cfg:
                    data["execution_metadata"] = cfg["execution_metadata"]
        return data


class QueryResponse(BaseModel):
    query_id: UUID
    workspace_id: UUID
    prompt: str
    answer: AnswerRead
    verification_status: Optional[str] = None
    execution_metadata: Optional[Dict[str, Any]] = Field(default_factory=dict)


# Audit & Export Schemas
class AnswerAuditResponse(BaseModel):
    answer_id: UUID
    query_id: UUID
    prompt: str
    draft_text: str
    final_text: str
    correction_rounds: int
    is_abstained: bool
    claims: List[ClaimRead]
    hallucination_rate: float
    correction_history: List[Dict[str, Any]] = Field(default_factory=list)
    verification_status: Optional[str] = None
    execution_metadata: Optional[Dict[str, Any]] = Field(default_factory=dict)
    created_at: datetime


class AnalyticsSummary(BaseModel):
    total_queries: int
    total_documents: int
    overall_hallucination_rate: float
    grounding_rate: float = 1.0
    verdict_distribution: Dict[str, int]
    avg_latency_ms: float


class AuditListItem(BaseModel):
    answer_id: UUID
    prompt: str
    verification_status: Optional[str] = None
    claim_count: int
    claims_count: Optional[int] = None
    hallucination_rate: float
    correction_rounds: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="after")
    def sync_claims_count(self) -> "AuditListItem":
        if self.claims_count is None:
            self.claims_count = self.claim_count
        return self


class AuditEventRead(BaseModel):
    id: UUID
    workspace_id: UUID
    event_type: str
    actor: str
    description: Optional[str] = None
    payload: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# Verification API Schemas
class VerifyRequest(BaseModel):
    statement: str = Field(..., min_length=1, max_length=1000)
    context_passages: List[str] = Field(..., min_length=1, max_length=20)

    @field_validator("context_passages")
    @classmethod
    def validate_passages(cls, passages: List[str]) -> List[str]:
        max_passage_len = 5000
        for idx, passage in enumerate(passages):
            if len(passage) > max_passage_len:
                raise ValueError(
                    f"Context passage at index {idx} exceeds maximum allowed length of {max_passage_len} characters."
                )
        return passages


class VerifyResponse(BaseModel):
    statement: str
    verdict: Verdict
    confidence_score: float
    rationale: str
    supporting_quotes: List[str] = []

# TODO: Add schema validation for streaming SSE audit tokens
