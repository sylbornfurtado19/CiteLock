"""Pydantic data validation schemas, request/response models, and Verdict enumeration."""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import UUID
from pydantic import BaseModel, Field


class Verdict(str, Enum):
    """Categorical classification of an atomic claim evaluated against retrieved evidence."""

    SUPPORTED = "supported"
    PARTIALLY_SUPPORTED = "partially_supported"
    CONTRADICTED = "contradicted"
    UNSUPPORTED = "unsupported"
    INSUFFICIENT_EVIDENCE = "insufficient_evidence"


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

    class Config:
        from_attributes = True


# Document Schemas
class DocumentRead(BaseModel):
    id: UUID
    workspace_id: UUID
    filename: str
    storage_path: str
    checksum: str
    status: str
    file_size_bytes: int
    mime_type: str
    created_at: datetime

    class Config:
        from_attributes = True


class DocumentSignedUrlResponse(BaseModel):
    document_id: UUID
    filename: str
    download_url: str
    expires_in_seconds: int


# Evidence & Claim Schemas
class EvidenceLinkRead(BaseModel):
    id: UUID
    claim_id: UUID
    chunk_id: UUID
    relevance_score: Optional[float] = None
    exact_quote: Optional[str] = None
    start_char_offset: Optional[int] = None
    end_char_offset: Optional[int] = None

    class Config:
        from_attributes = True


class ClaimRead(BaseModel):
    id: UUID
    answer_id: UUID
    claim_index: int
    claim_text: str
    verdict: Verdict
    confidence_score: Optional[float] = None
    rationale: Optional[str] = None
    evidence_links: List[EvidenceLinkRead] = []

    class Config:
        from_attributes = True


# Query & Answer Schemas
class QueryCreate(BaseModel):
    prompt: str = Field(..., min_length=1)
    top_k: int = Field(default=5, ge=1, le=20)
    strictness: str = Field(default="high")


class AnswerRead(BaseModel):
    id: UUID
    query_id: UUID
    draft_text: str
    final_text: str
    correction_rounds: int
    is_abstained: bool
    claims: List[ClaimRead] = []
    created_at: datetime

    class Config:
        from_attributes = True


class QueryResponse(BaseModel):
    query_id: UUID
    workspace_id: UUID
    prompt: str
    answer: AnswerRead


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
    created_at: datetime


class AnalyticsSummary(BaseModel):
    total_queries: int
    total_documents: int
    overall_hallucination_rate: float
    verdict_distribution: Dict[str, int]
    avg_latency_ms: float


# Verification API Schemas
class VerifyRequest(BaseModel):
    statement: str = Field(..., min_length=1)
    context_passages: List[str] = Field(..., min_items=1)


class VerifyResponse(BaseModel):
    statement: str
    verdict: Verdict
    confidence_score: float
    rationale: str
    supporting_quotes: List[str] = []

# TODO: Add schema validation for streaming SSE audit tokens
