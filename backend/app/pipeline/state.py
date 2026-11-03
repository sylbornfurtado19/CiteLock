"""Typed shared state flowing through the CiteLock LangGraph execution graph."""

import operator
from typing import Annotated, Any, Dict, List, Optional, TypedDict
from uuid import UUID

# Absolute ceiling on correction rounds, regardless of workspace or environment configuration.
HARD_MAX_CORRECTION_ROUNDS = 10

class PipelineTimeoutError(Exception):
    """Raised when a run exceeds the configured overall pipeline time budget."""


class PipelineCancelledError(Exception):
    """Raised when the client that requested a run disconnected, so remaining work is abandoned."""


# Execution statuses
STATUS_PENDING = "pending"
STATUS_RUNNING = "running"
STATUS_COMPLETED = "completed"
STATUS_FAILED = "failed"

# Router decisions
ROUTE_FINALIZE = "finalize"
ROUTE_CORRECT = "correct"
ROUTE_ABSTAIN = "abstain"
ROUTE_ERROR = "error"


class PipelineError(TypedDict, total=False):
    """Structured, serializable error information captured by a failing node."""

    stage: str
    kind: str  # "provider" | "verification" | "internal"
    message: str


class PipelineState(TypedDict, total=False):
    """Shared state for the audited RAG graph. Every node returns a partial update of these keys."""

    # Inputs
    prompt: str
    workspace_id: UUID
    top_k: int

    # Workspace policy resolved by the query-input node
    max_correction_rounds: int
    abstention_policy: str
    preferred_llm_provider: Optional[str]

    # Evidence and generation
    passages: List[Dict[str, Any]]
    retrieved_passages_count: int
    draft_answer: str
    raw_claims: List[Dict[str, Any]]

    # Verification
    claims: List[Dict[str, Any]]
    initial_verification: Dict[str, Any]
    metrics: Dict[str, Any]

    # Correction
    current_text: str
    correction_round: int
    correction_history: List[Dict[str, Any]]
    seen_revisions: List[str]
    correction_stalled: bool
    revision: Dict[str, Any]
    route: str
    route_reason: str

    # Result
    final_text: str
    is_abstained: bool
    verification_status: str
    execution_metadata: Dict[str, Any]
    persisted: Dict[str, Any]

    # Execution tracking
    status: str
    started_at: float
    trace: Annotated[List[str], operator.add]
    node_events: Annotated[List[Dict[str, Any]], operator.add]
    error: Optional[PipelineError]
    error_exception: Optional[BaseException]
