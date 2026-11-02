"""Executable LangGraph nodes for the audited RAG pipeline.

Each node receives the shared PipelineState plus a RunnableConfig whose ``configurable`` mapping carries the
non-serializable runtime dependencies (database session, SSE emit callback, workspace settings, start time).
Nodes return partial state updates and delegate the real work to the existing service layer.
"""

import logging
import time
import uuid
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional, Tuple
from uuid import UUID

from langchain_core.runnables import RunnableConfig

import app.providers.base as providers_base
from app.config import get_settings
from app.db.models.answers import Answer
from app.db.models.claims import Claim
from app.db.models.evidence_links import EvidenceLink
from app.db.models.queries import Query
from app.db.models.verification_runs import VerificationRun
from app.db.models.workspaces import Workspace
from app.pipeline.state import (
    HARD_MAX_CORRECTION_ROUNDS,
    ROUTE_ABSTAIN,
    ROUTE_CORRECT,
    ROUTE_ERROR,
    ROUTE_FINALIZE,
    STATUS_COMPLETED,
    STATUS_FAILED,
    STATUS_RUNNING,
    PipelineError,
    PipelineState,
)
from app.services.correction.controller import (
    ABSTENTION_TEXT,
    retrieve_targeted_evidence,
    revise_answer,
    select_failed_claims,
    should_abstain,
)
from app.services.generation.answer import GenerationError, generate_draft_answer
from app.services.generation.claim_extractor import extract_atomic_claims
from app.services.retrieval.hybrid import retrieve_hybrid
from app.services.verification.engine import verify_claims
from app.services.verification.judge import VerificationProviderError
from app.services.verification.scoring import compute_verification_metrics

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Runtime helpers
# ---------------------------------------------------------------------------


def _runtime(config: RunnableConfig) -> Dict[str, Any]:
    return (config or {}).get("configurable", {}) or {}


def _emit(config: RunnableConfig, stage: str, status: str, message: str, data: Optional[Dict[str, Any]] = None) -> None:
    """Forward a progress event to the SSE callback without ever letting it break the pipeline."""
    emit: Optional[Callable] = _runtime(config).get("emit")
    if not emit:
        return
    try:
        emit(stage, status, message, data)
    except Exception as evt_err:
        logger.warning("Error invoking pipeline emit callback: %s", evt_err)


def _classify_error(exc: BaseException) -> str:
    """Map an exception to a coarse error kind used for routing and failed-query bookkeeping."""
    if isinstance(exc, VerificationProviderError):
        return "verification"
    if isinstance(exc, providers_base.ProviderError):
        return "provider"
    if isinstance(exc, GenerationError) and isinstance(exc.__cause__, providers_base.ProviderError):
        return "provider"
    return "internal"


def _failure(stage: str, exc: BaseException) -> Dict[str, Any]:
    """Build the partial state update recorded when a node fails."""
    error: PipelineError = {"stage": stage, "kind": _classify_error(exc), "message": str(exc)}
    return {"error": error, "error_exception": exc, "status": STATUS_FAILED, "trace": [stage]}


def _verification_error_summary(claims: List[Dict[str, Any]]) -> Optional[str]:
    errors = [c for c in claims if c.get("verdict") == "verification_error"]
    if not errors:
        return None
    return f"{len(errors)} claim(s) failed with verification_error: " + "; ".join(c.get("rationale", "") for c in errors)


# ---------------------------------------------------------------------------
# Routing policy
# ---------------------------------------------------------------------------


def decide_route(state: PipelineState) -> Tuple[str, str]:
    """
    Decide where verified claims go next. Returns (route, reason).

    - provider/verification failure                      -> error
    - every claim supported                               -> finalize
    - failed claims (unsupported, contradicted, partial,
      insufficient evidence), retries remain, progress made -> correct (targeted retrieval may add evidence)
    - failed claims, retries exhausted or correction stalled -> abstain or finalize per workspace policy
      (strict: abstain when at least half the claims remain unresolved; soft: only when all claims fail)
    """
    if state.get("error"):
        return ROUTE_ERROR, "A node reported an error."

    claims = state.get("claims") or []
    if any(c.get("verdict") == "verification_error" for c in claims):
        return ROUTE_ERROR, "A claim could not be verified because the verification provider failed."

    failed = select_failed_claims(claims)
    if not failed:
        return ROUTE_FINALIZE, "All claims are supported by the retrieved evidence."

    policy = state.get("abstention_policy", "strict")
    rounds_used = state.get("correction_round", 0)
    max_rounds = min(state.get("max_correction_rounds", 0), HARD_MAX_CORRECTION_ROUNDS)

    if state.get("correction_stalled"):
        reason = "Correction made no further progress."
    elif rounds_used >= max_rounds:
        reason = f"Retry limit of {max_rounds} correction round(s) reached."
    else:
        return ROUTE_CORRECT, f"{len(failed)} claim(s) need correction; round {rounds_used + 1} of {max_rounds}."

    if should_abstain(failed, claims, policy):
        return ROUTE_ABSTAIN, f"{reason} Abstaining under the '{policy}' policy."
    return ROUTE_FINALIZE, f"{reason} Returning the best answer with unresolved verdicts preserved."


# ---------------------------------------------------------------------------
# 1. Query input
# ---------------------------------------------------------------------------


def query_input(state: PipelineState, config: RunnableConfig) -> Dict[str, Any]:
    """Validate the request and resolve workspace policy (retry limit, abstention, preferred provider)."""
    runtime = _runtime(config)
    prompt = (state.get("prompt") or "").strip()
    if not prompt:
        return _failure("query_input", ValueError("Prompt cannot be empty."))

    ws_settings: Optional[Dict[str, Any]] = runtime.get("ws_settings")
    db = runtime.get("db")
    if ws_settings is None:
        ws_settings = {}
        if db is not None and state.get("workspace_id"):
            try:
                ws = db.query(Workspace).filter(Workspace.id == state["workspace_id"]).first()
                if ws and ws.settings_:
                    ws_settings = ws.settings_
            except Exception as ws_err:
                logger.warning("Could not read workspace settings for %s: %s", state.get("workspace_id"), ws_err)

    configured_rounds = ws_settings.get("max_correction_retries")
    if configured_rounds is None:
        configured_rounds = get_settings().max_correction_retries
    try:
        max_rounds = max(0, min(int(configured_rounds), HARD_MAX_CORRECTION_ROUNDS))
    except (TypeError, ValueError):
        max_rounds = get_settings().max_correction_retries

    return {
        "prompt": prompt,
        "max_correction_rounds": max_rounds,
        "abstention_policy": ws_settings.get("abstention_policy", "strict"),
        "preferred_llm_provider": ws_settings.get("preferred_llm_provider"),
        "correction_round": 0,
        "correction_history": [],
        "seen_revisions": [],
        "correction_stalled": False,
        "is_abstained": False,
        "status": STATUS_RUNNING,
        "started_at": runtime.get("start_time", time.time()),
        "error": None,
        "error_exception": None,
        "trace": ["query_input"],
    }


# ---------------------------------------------------------------------------
# 2. Evidence retrieval
# ---------------------------------------------------------------------------


def evidence_retrieval(state: PipelineState, config: RunnableConfig) -> Dict[str, Any]:
    """Hybrid (vector + lexical) retrieval scoped to the workspace."""
    db = _runtime(config).get("db")
    top_k = state.get("top_k", 5)
    _emit(config, "retrieval", "running", "Retrieving relevant reference passages from vector and keyword index...", {"top_k": top_k})
    try:
        passages = retrieve_hybrid(db, state["workspace_id"], state["prompt"], top_k=top_k)
    except Exception as exc:
        return _failure("evidence_retrieval", exc)
    _emit(config, "retrieval", "completed", f"Retrieved {len(passages)} reference passage(s) across dense vector and lexical indices.", {"passages_count": len(passages)})
    return {"passages": passages, "retrieved_passages_count": len(passages), "trace": ["evidence_retrieval"]}


# ---------------------------------------------------------------------------
# 3. Answer generation
# ---------------------------------------------------------------------------


def answer_generation(state: PipelineState, config: RunnableConfig) -> Dict[str, Any]:
    """Draft an answer grounded strictly in the retrieved passages."""
    _emit(config, "generation", "running", "Synthesizing grounded draft answer from retrieved passages...")
    try:
        draft = generate_draft_answer(state["prompt"], state.get("passages", []))
    except Exception as exc:
        return _failure("answer_generation", exc)
    _emit(config, "generation", "completed", "Synthesized grounded draft answer with source citations.")
    return {"draft_answer": draft, "current_text": draft, "seen_revisions": [draft.strip()], "trace": ["answer_generation"]}


# ---------------------------------------------------------------------------
# 4. Atomic claim decomposition
# ---------------------------------------------------------------------------


def claim_decomposition(state: PipelineState, config: RunnableConfig) -> Dict[str, Any]:
    """Split the draft into atomic, independently verifiable claims."""
    _emit(config, "decomposition", "running", "Decomposing answer into atomic, verifiable factual claims...")
    try:
        raw_claims = extract_atomic_claims(state["draft_answer"])
    except Exception as exc:
        return _failure("claim_decomposition", exc)
    _emit(config, "decomposition", "completed", f"Decomposed answer into {len(raw_claims)} atomic factual claim(s).", {"claim_count": len(raw_claims)})
    return {"raw_claims": raw_claims, "trace": ["claim_decomposition"]}


# ---------------------------------------------------------------------------
# 5. Claim verification
# ---------------------------------------------------------------------------


def claim_verification(state: PipelineState, config: RunnableConfig) -> Dict[str, Any]:
    """Audit every claim across the structured judge, numeric checks and provenance tracing."""
    _emit(config, "verification", "running", "Auditing atomic claims across structured judge, numeric checks, and citation provenance...")
    try:
        result = verify_claims(state.get("raw_claims", []), state.get("passages", []))
    except Exception as exc:
        return _failure("claim_verification", exc)

    claims = result["claims"]
    summary = _verification_error_summary(claims)
    if summary:
        _emit(config, "verification", "failed", "Verification error encountered during claim audit pass.")
        logger.error(summary)
        update = _failure("claim_verification", VerificationProviderError(summary))
        update.update({"claims": claims, "initial_verification": result})
        return update

    _emit(config, "verification", "completed", f"Audited {len(claims)} claim(s) against retrieved evidence.", {"claims_count": len(claims)})
    return {
        "claims": claims,
        "initial_verification": result,
        "metrics": result.get("metrics") or compute_verification_metrics(claims),
        "trace": ["claim_verification"],
    }


# ---------------------------------------------------------------------------
# 6. Conditional verification router
# ---------------------------------------------------------------------------


def verification_router(state: PipelineState, config: RunnableConfig) -> Dict[str, Any]:
    """Evaluate verdicts against workspace policy and record the routing decision; edges branch on it."""
    _emit(config, "correction", "running", "Evaluating verification verdicts and executing self-correction if required...")
    route, reason = decide_route(state)
    logger.info("Verification router decision: %s (%s)", route, reason)
    return {"route": route, "route_reason": reason, "trace": [f"verification_router:{route}"]}


# ---------------------------------------------------------------------------
# 7. Self-correction
# ---------------------------------------------------------------------------


def self_correction(state: PipelineState, config: RunnableConfig) -> Dict[str, Any]:
    """Run one bounded correction round: targeted retrieval, then a surgical revision of the draft."""
    runtime = _runtime(config)
    db = runtime.get("db")
    round_number = state.get("correction_round", 0) + 1
    _emit(config, "correction", "running", f"Self-correction round {round_number} of {state.get('max_correction_rounds', 0)}...", {"round": round_number})

    failed = select_failed_claims(state.get("claims", []))
    passages = list(state.get("passages", []))
    try:
        newly_retrieved = retrieve_targeted_evidence(db, state["workspace_id"], failed, passages)
        passages.extend(newly_retrieved)

        preferred = state.get("preferred_llm_provider")
        llm = providers_base.get_llm_provider(preferred) if preferred else providers_base.get_llm_provider()
        revised = revise_answer(llm, state["prompt"], state.get("current_text", ""), failed, passages)
    except Exception as exc:
        return _failure("self_correction", exc)

    seen = list(state.get("seen_revisions", []))
    update: Dict[str, Any] = {
        "correction_round": round_number,
        "passages": passages,
        "revision": {
            "round": round_number,
            "draft_before": state.get("current_text", ""),
            "revised_text": revised,
            "targeted_claims": [c.get("claim_text") for c in failed],
            "failed_count_before": len(failed),
            "new_evidence_chunks": [str(p.get("id") or p.get("chunk_id")) for p in newly_retrieved],
        },
        "trace": ["self_correction"],
    }
    if not revised or revised in seen:
        update["correction_stalled"] = True
    else:
        update["seen_revisions"] = seen + [revised]
    return update


# ---------------------------------------------------------------------------
# 8. Re-verification
# ---------------------------------------------------------------------------


def re_verification(state: PipelineState, config: RunnableConfig) -> Dict[str, Any]:
    """Re-extract and re-verify every claim in the revised answer, then route again."""
    if state.get("correction_stalled"):
        route, reason = decide_route(state)
        return {"route": route, "route_reason": reason, "trace": [f"re_verification:{route}"]}

    revision = state.get("revision", {})
    revised_text = revision.get("revised_text", "")
    passages = state.get("passages", [])
    try:
        new_claims = extract_atomic_claims(revised_text)
        verification = verify_claims(new_claims, passages)
    except Exception as exc:
        return _failure("re_verification", exc)

    claims = verification["claims"]
    summary = _verification_error_summary(claims)
    if summary:
        _emit(config, "correction", "failed", "Verification error encountered during self-correction loop.")
        logger.error(summary)
        update = _failure("re_verification", VerificationProviderError(summary))
        update.update({"claims": claims, "current_text": revised_text})
        return update

    failures_after = select_failed_claims(claims)
    history = list(state.get("correction_history", []))
    history.append({
        **revision,
        "failed_count_after": len(failures_after),
        "metrics": verification.get("metrics"),
    })

    next_state: Dict[str, Any] = {
        "claims": claims,
        "current_text": revised_text,
        "correction_history": history,
        "metrics": verification.get("metrics") or compute_verification_metrics(claims),
    }
    route, reason = decide_route({**state, **next_state})
    return {**next_state, "route": route, "route_reason": reason, "trace": [f"re_verification:{route}"]}


# ---------------------------------------------------------------------------
# Abstention (policy outcome feeding final answer generation)
# ---------------------------------------------------------------------------


def abstention(state: PipelineState, config: RunnableConfig) -> Dict[str, Any]:
    """Replace the answer with an explicit abstention when the evidence cannot support it."""
    return {"final_text": ABSTENTION_TEXT, "is_abstained": True, "trace": ["abstention"]}


# ---------------------------------------------------------------------------
# 9. Final answer generation
# ---------------------------------------------------------------------------


def final_answer_generation(state: PipelineState, config: RunnableConfig) -> Dict[str, Any]:
    """Assemble the final text, verification status and execution metadata."""
    claims = state.get("claims", [])
    is_abstained = bool(state.get("is_abstained"))
    rounds = state.get("correction_round", 0)
    final_text = state.get("final_text") if is_abstained else state.get("current_text", state.get("draft_answer", ""))

    metrics = compute_verification_metrics(claims)
    latency_ms = int((time.time() - state.get("started_at", time.time())) * 1000)

    if is_abstained:
        verification_status = "abstained"
    elif metrics.get("hallucination_rate", 0.0) == 0.0 and len(claims) > 0:
        verification_status = "verified"
    elif any(c.get("verdict") in ["supported", "partially_supported"] for c in claims):
        verification_status = "partially_verified"
    else:
        verification_status = "unresolved"

    if is_abstained:
        corr_msg = "Pipeline abstained due to insufficient or ungrounded evidence."
    elif rounds > 0:
        corr_msg = f"Self-correction concluded after {rounds} revision round(s)."
    else:
        corr_msg = "All factual claims fully supported; no correction required."
    _emit(config, "correction", "completed", corr_msg, {"rounds": rounds, "is_abstained": is_abstained, "final_claims_count": len(claims)})

    execution_metadata = {
        "latency_ms": latency_ms,
        "top_k": state.get("top_k", 5),
        "retrieved_passages_count": state.get("retrieved_passages_count", len(state.get("passages", []))),
        "initial_claim_count": len(state.get("raw_claims", [])),
        "final_claim_count": len(claims),
        "llm_provider": get_settings().llm_provider,
        "correction_rounds": rounds,
        "hallucination_rate": metrics.get("hallucination_rate", 0.0),
        "grounding_rate": metrics.get("grounding_rate", 1.0),
        "cache_hit": False,
        "orchestrator": "langgraph",
        "router_decision": state.get("route"),
        "router_reason": state.get("route_reason"),
    }
    return {
        "final_text": final_text,
        "metrics": metrics,
        "verification_status": verification_status,
        "execution_metadata": execution_metadata,
        "trace": ["final_answer_generation"],
    }


# ---------------------------------------------------------------------------
# 10. Database persistence
# ---------------------------------------------------------------------------


def database_persistence(state: PipelineState, config: RunnableConfig) -> Dict[str, Any]:
    """Persist the query, answer, claims, evidence links, verification runs and audit trail atomically."""
    db = _runtime(config).get("db")
    workspace_id = state["workspace_id"]
    prompt = state["prompt"]
    top_k = state.get("top_k", 5)
    final_claims = state.get("claims", [])
    correction_history = state.get("correction_history", [])
    execution_metadata = state.get("execution_metadata", {})
    metrics = state.get("metrics", {})
    rounds = state.get("correction_round", 0)
    is_abstained = bool(state.get("is_abstained"))
    verification_status = state.get("verification_status", "unresolved")
    latency_ms = execution_metadata.get("latency_ms")
    initial_verification = state.get("initial_verification") or {}

    try:
        _emit(config, "finalizing", "running", "Persisting verified answer, claim relations, and audit trail ledger...")
        query_record = Query(
            id=uuid.uuid4(),
            workspace_id=workspace_id,
            prompt=prompt,
            query_parameters={"top_k": top_k},
            status="completed",
        )
        db.add(query_record)
        db.flush()

        answer_record = Answer(
            id=uuid.uuid4(),
            query_id=query_record.id,
            draft_text=state.get("draft_answer", ""),
            final_text=state.get("final_text", ""),
            correction_rounds=rounds,
            is_abstained=is_abstained,
            model_config_data={
                "top_k": top_k,
                "llm_provider": get_settings().llm_provider,
                "correction_history": correction_history,
                "verification_status": verification_status,
                "execution_metadata": execution_metadata,
            },
        )
        db.add(answer_record)
        db.flush()

        # Validate candidate chunk IDs against database to prevent FK constraint violations
        candidate_chunk_ids = set()
        for c in final_claims:
            for ev in c.get("evidence_links", []):
                raw_cid = ev.get("chunk_id")
                if raw_cid:
                    try:
                        candidate_chunk_ids.add(UUID(str(raw_cid)))
                    except (ValueError, TypeError) as err:
                        logger.warning("Invalid UUID for evidence chunk_id '%s': %s", raw_cid, err)

        valid_db_chunks = {}
        if candidate_chunk_ids:
            from app.db.models.chunks import Chunk
            from app.db.models.documents import Document
            rows = (
                db.query(Chunk.id, Document.filename)
                .join(Document, Chunk.document_id == Document.id)
                .filter(Document.workspace_id == workspace_id, Chunk.id.in_(candidate_chunk_ids))
                .all()
            )
            valid_db_chunks = {row[0]: row[1] for row in rows}

        persisted_claim_objs = []
        for idx, c in enumerate(final_claims):
            claim_record = Claim(
                id=uuid.uuid4(),
                answer_id=answer_record.id,
                claim_index=c.get("claim_index", idx),
                claim_text=c.get("claim_text", ""),
                verdict=c.get("verdict", "unsupported"),
                confidence_score=c.get("confidence_score"),
                rationale=c.get("rationale") or c.get("explanation"),
            )
            db.add(claim_record)
            db.flush()

            for ev in c.get("evidence_links", []):
                raw_chunk_id = ev.get("chunk_id")
                if raw_chunk_id:
                    try:
                        c_uuid = UUID(str(raw_chunk_id))
                        if c_uuid in valid_db_chunks:
                            doc_fn = ev.get("document_filename") or valid_db_chunks.get(c_uuid)
                            db.add(EvidenceLink(
                                id=uuid.uuid4(),
                                claim_id=claim_record.id,
                                chunk_id=c_uuid,
                                document_filename=doc_fn,
                                relevance_score=ev.get("relevance_score"),
                                exact_quote=ev.get("exact_quote"),
                                start_char_offset=ev.get("start_char_offset"),
                                end_char_offset=ev.get("end_char_offset"),
                            ))
                        else:
                            logger.warning(
                                "Evidence chunk %s does not exist in workspace %s; omitting link for claim %s",
                                c_uuid, workspace_id, claim_record.id,
                            )
                    except (ValueError, TypeError) as err:
                        logger.warning("Failed parsing evidence chunk_id '%s': %s", raw_chunk_id, err)

            persisted_claim_objs.append(claim_record)

        # One VerificationRun per round (initial verification + each correction round)
        initial_metrics = initial_verification.get("metrics") or compute_verification_metrics(initial_verification.get("claims", []))
        db.add(VerificationRun(
            id=uuid.uuid4(),
            answer_id=answer_record.id,
            round_number=1,
            judge_model=get_settings().llm_provider,
            hallucination_rate=initial_metrics.get("hallucination_rate", 0.0),
            verification_summary=initial_metrics,
            latency_ms=latency_ms if rounds == 0 else None,
        ))

        for item in correction_history:
            round_num = item.get("round", 1) + 1
            round_metrics = item.get("metrics") or metrics
            db.add(VerificationRun(
                id=uuid.uuid4(),
                answer_id=answer_record.id,
                round_number=round_num,
                judge_model=get_settings().llm_provider,
                hallucination_rate=round_metrics.get("hallucination_rate", 0.0),
                verification_summary=round_metrics,
                latency_ms=latency_ms if round_num == (len(correction_history) + 1) else None,
            ))

        # Audit trail events
        from app.services.audit.recorder import record_audit_event
        record_audit_event(
            db=db,
            workspace_id=workspace_id,
            event_type="query_executed",
            actor="user",
            description=f"Query executed: {prompt[:100]}",
            payload={"query_id": str(query_record.id), "answer_id": str(answer_record.id), "verification_status": verification_status},
        )

        for item in correction_history:
            record_audit_event(
                db=db,
                workspace_id=workspace_id,
                event_type="correction_round",
                actor="system",
                description=f"Correction round {item.get('round')} executed",
                payload={
                    "query_id": str(query_record.id),
                    "answer_id": str(answer_record.id),
                    "round": item.get("round"),
                    "failed_count_before": item.get("failed_count_before"),
                    "failed_count_after": item.get("failed_count_after"),
                },
            )

        if is_abstained:
            record_audit_event(
                db=db,
                workspace_id=workspace_id,
                event_type="abstention",
                actor="system",
                description="Pipeline abstained due to insufficient or ungrounded evidence",
                payload={"query_id": str(query_record.id), "answer_id": str(answer_record.id)},
            )

        db.commit()
        db.refresh(query_record)
        db.refresh(answer_record)
        answer_record.claims = persisted_claim_objs
        _emit(config, "finalizing", "completed", "Pipeline persistence and audit ledger finalized.", {"answer_id": str(answer_record.id), "verification_status": verification_status})
    except Exception as exc:
        db.rollback()
        logger.exception("Pipeline persistence failed for query in workspace %s: %s", workspace_id, exc)
        _emit(config, "finalizing", "failed", f"Persistence failure: {str(exc)}")
        return _failure("database_persistence", exc)

    return {
        "persisted": {"query": query_record, "answer": answer_record},
        "status": STATUS_COMPLETED,
        "trace": ["database_persistence"],
    }


# ---------------------------------------------------------------------------
# Error handling
# ---------------------------------------------------------------------------


def error_handler(state: PipelineState, config: RunnableConfig) -> Dict[str, Any]:
    """Record provider and verification failures as failed queries; the caller re-raises the original error."""
    error: PipelineError = state.get("error") or {"stage": "unknown", "kind": "internal", "message": "Unknown pipeline failure."}
    db = _runtime(config).get("db")
    kind = error.get("kind")

    if kind == "provider":
        _emit(config, "execution", "failed", f"Provider outage during pipeline execution: {error.get('message')}")
        logger.error("Provider outage during pipeline execution: %s", error.get("message"))

    if kind in ("provider", "verification") and db is not None:
        try:
            db.add(Query(
                id=uuid.uuid4(),
                workspace_id=state["workspace_id"],
                prompt=state.get("prompt", ""),
                query_parameters={"top_k": state.get("top_k", 5), "error_summary": str(error.get("message", ""))[:500]},
                status="failed",
            ))
            db.commit()
        except Exception as db_err:
            db.rollback()
            logger.error("Failed persisting failed query record: %s", db_err)

    return {"status": STATUS_FAILED, "trace": ["error_handler"]}
