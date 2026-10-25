from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models.workspaces import Workspace
from app.api.deps import get_workspace_scoped
from app.schemas import QueryCreate, QueryResponse
from app.pipeline.orchestrator import run_pipeline
from app.security.injection_guard import check_prompt_injection

router = APIRouter(prefix="/workspaces/{workspace_id}/queries", tags=["Queries"])


@router.post("", response_model=QueryResponse, status_code=status.HTTP_201_CREATED)
def execute_query(
    payload: QueryCreate,
    workspace: Workspace = Depends(get_workspace_scoped),
    db: Session = Depends(get_db),
):
    """Run audited RAG pipeline with verification, self-correction, and full database persistence."""
    is_suspicious, msg = check_prompt_injection(payload.prompt)
    if is_suspicious:
        try:
            from app.db.models.audit_events import AuditEvent
            event = AuditEvent(
                workspace_id=workspace.id,
                event_type="security_prompt_injection_blocked",
                actor="user",
                description=msg,
                payload={"flagged_prompt": payload.prompt[:500]},
            )
            db.add(event)
            db.commit()
        except Exception:
            db.rollback()

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Query rejected by Prompt Injection Guard: {msg}",
        )

    try:
        pipeline_result = run_pipeline(db, workspace.id, payload.prompt, top_k=payload.top_k)
    except Exception as e:
        import logging
        logging.getLogger(__name__).exception("Pipeline execution failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"RAG Pipeline execution error: {str(e)}",
        )

    query_obj = pipeline_result["query"]
    answer_obj = pipeline_result["answer"]

    return QueryResponse(
        query_id=query_obj.id,
        workspace_id=workspace.id,
        prompt=query_obj.prompt,
        answer=answer_obj,
        verification_status=pipeline_result.get("verification_status"),
        execution_metadata=pipeline_result.get("execution_metadata", {}),
    )
