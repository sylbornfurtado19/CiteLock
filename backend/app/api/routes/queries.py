"""Query submission and audited RAG execution endpoints."""

from uuid import uuid4
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models.workspaces import Workspace
from app.db.models.queries import Query
from app.api.deps import get_workspace_scoped
from app.schemas import QueryCreate, QueryResponse, AnswerRead
from app.pipeline.orchestrator import run_pipeline
from app.security.injection_guard import check_prompt_injection

router = APIRouter(prefix="/workspaces/{workspace_id}/queries", tags=["Queries"])


@router.post("", response_model=QueryResponse, status_code=status.HTTP_201_CREATED)
def execute_query(
    payload: QueryCreate,
    workspace: Workspace = Depends(get_workspace_scoped),
    db: Session = Depends(get_db),
):
    """Run audited RAG pipeline with verification and self-correction."""
    # TODO: Add streaming response mode via Server-Sent Events (SSE)
    is_suspicious, msg = check_prompt_injection(payload.prompt)
    pipeline_result = run_pipeline(db, workspace.id, payload.prompt, top_k=payload.top_k)

    query_id = uuid4()
    answer_id = uuid4()

    return {
        "query_id": query_id,
        "workspace_id": workspace.id,
        "prompt": payload.prompt,
        "answer": {
            "id": answer_id,
            "query_id": query_id,
            "draft_text": pipeline_result["draft_text"],
            "final_text": pipeline_result["final_text"],
            "correction_rounds": pipeline_result["correction_rounds"],
            "is_abstained": pipeline_result["is_abstained"],
            "claims": [],
            "created_at": "2026-10-23T12:00:00Z",
        },
    }
