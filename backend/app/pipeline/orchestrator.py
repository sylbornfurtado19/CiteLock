"""End-to-end RAG orchestrator executing retrieval, generation, decomposition, verification, correction, and persistence."""

import logging
import time
import uuid
from datetime import datetime
from typing import Dict, Any, Callable, Optional
from uuid import UUID

logger = logging.getLogger(__name__)
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models.queries import Query
from app.db.models.answers import Answer
from app.db.models.workspaces import Workspace
from app.db.models.claims import Claim
from app.db.models.evidence_links import EvidenceLink
from app.db.models.verification_runs import VerificationRun
from app.services.retrieval.hybrid import retrieve_hybrid
from app.services.generation.answer import generate_draft_answer
from app.services.generation.claim_extractor import extract_atomic_claims
from app.services.verification.engine import verify_claims
from app.services.verification.judge import VerificationProviderError
from app.services.verification.scoring import compute_verification_metrics
from app.services.correction.controller import execute_correction_loop
from app.services.cache import (
    pipeline_cache_service,
    compute_pipeline_cache_key,
    is_safe_to_cache,
)
import app.providers.base as providers_base


def run_pipeline(
    db: Session,
    workspace_id: UUID,
    prompt: str,
    top_k: int = 5,
    on_event: Optional[Callable[[Dict[str, Any]], None]] = None,
    use_cache: bool = True,
) -> Dict[str, Any]:
    """
    Execute complete audited RAG pipeline with deterministic response caching and concurrency coordination:
    0. Deterministic cache lookup (workspace, document fingerprint, prompt, and model config)
    1. Hybrid retrieval (vector + keyword)
    2. Grounded draft answer synthesis
    3. Atomic claim decomposition
    4. Evidence verification across judge, numeric checks, and provenance
    5. Targeted iterative self-correction loop
    6. Relational PostgreSQL persistence with full claim and evidence linkage
    7. Safe cache population with configurable TTL and stampede prevention
    """
    start_time = time.time()
    settings = get_settings()

    def emit(stage: str, status: str, message: str, data: Optional[Dict[str, Any]] = None):
        if on_event:
            try:
                on_event({
                    "stage": stage,
                    "status": status,
                    "message": message,
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                    "data": data or {},
                })
            except Exception as evt_err:
                logger.warning("Error invoking on_event callback: %s", evt_err)

    # Resolve workspace settings for cache key and pipeline parameters
    ws_settings = {}
    if workspace_id and db:
        try:
            ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
            if ws and ws.settings_:
                ws_settings = ws.settings_
        except Exception as ws_err:
            logger.warning("Could not read workspace settings for %s: %s", workspace_id, ws_err)

    cache_key = None
    if use_cache and pipeline_cache_service.is_enabled:
        try:
            cache_key = compute_pipeline_cache_key(
                db=db,
                workspace_id=workspace_id,
                prompt=prompt,
                top_k=top_k,
                extra_config=ws_settings,
            )
            cached_data = pipeline_cache_service.get(cache_key, workspace_id=workspace_id)
            if cached_data:
                cached_query = db.query(Query).filter(Query.id == UUID(cached_data["query_id"])).first()
                cached_answer = db.query(Answer).filter(Answer.id == UUID(cached_data["answer_id"])).first()
                if cached_query and cached_answer:
                    cached_latency = int((time.time() - start_time) * 1000)
                    cached_metadata = dict(cached_data.get("execution_metadata", {}))
                    cached_metadata["cache_hit"] = True
                    cached_metadata["latency_ms"] = cached_latency

                    emit("cache", "completed", "Loaded verified answer from deterministic pipeline cache.", {
                        "cache_hit": True,
                        "answer_id": str(cached_answer.id),
                    })

                    try:
                        from app.services.audit.recorder import record_audit_event
                        record_audit_event(
                            db=db,
                            workspace_id=workspace_id,
                            event_type="query_executed",
                            actor="user",
                            description=f"Query executed (cache hit): {prompt[:100]}",
                            payload={
                                "query_id": str(cached_query.id),
                                "answer_id": str(cached_answer.id),
                                "cache_hit": True,
                                "verification_status": cached_data.get("verification_status"),
                            },
                        )
                    except Exception as audit_err:
                        logger.warning("Failed recording cache hit audit event: %s", audit_err)

                    return {
                        "query": cached_query,
                        "answer": cached_answer,
                        "query_id": cached_query.id,
                        "answer_id": cached_answer.id,
                        "workspace_id": workspace_id,
                        "prompt": prompt,
                        "draft_text": cached_data["draft_text"],
                        "final_text": cached_data["final_text"],
                        "correction_rounds": cached_data["correction_rounds"],
                        "is_abstained": cached_data["is_abstained"],
                        "claims": cached_data["claims"],
                        "correction_history": cached_data.get("correction_history", []),
                        "verification_status": cached_data["verification_status"],
                        "execution_metadata": cached_metadata,
                        "metrics": cached_data.get("metrics", {}),
                        "latency_ms": cached_latency,
                    }
        except Exception as cache_err:
            logger.warning("Pipeline cache lookup failed: %s; proceeding with fresh execution", cache_err)

    def _execute_pipeline():
        return _run_pipeline_execution(
            db=db,
            workspace_id=workspace_id,
            prompt=prompt,
            top_k=top_k,
            ws_settings=ws_settings,
            emit=emit,
            start_time=start_time,
        )

    # Concurrency control: prevent cache stampedes for simultaneous identical requests
    if cache_key:
        pipeline_output, is_leader = pipeline_cache_service.single_flight.do(cache_key, _execute_pipeline)
        if not is_leader:
            logger.info("Cache stampede avoided: follower reused concurrent leader result for key %s", cache_key[:16])
            follower_result = dict(pipeline_output)
            follower_meta = dict(follower_result.get("execution_metadata", {}))
            follower_meta["cache_hit"] = True
            follower_result["execution_metadata"] = follower_meta
            return follower_result
    else:
        pipeline_output = _execute_pipeline()

    # Safely populate cache for successful verification runs
    if cache_key and is_safe_to_cache(pipeline_output):
        try:
            cache_payload = {
                "query_id": str(pipeline_output["query_id"]),
                "answer_id": str(pipeline_output["answer_id"]),
                "workspace_id": str(workspace_id),
                "prompt": prompt,
                "draft_text": pipeline_output["draft_text"],
                "final_text": pipeline_output["final_text"],
                "correction_rounds": pipeline_output["correction_rounds"],
                "is_abstained": pipeline_output["is_abstained"],
                "claims": pipeline_output["claims"],
                "correction_history": pipeline_output["correction_history"],
                "verification_status": pipeline_output["verification_status"],
                "execution_metadata": pipeline_output["execution_metadata"],
                "metrics": pipeline_output.get("metrics", {}),
                "latency_ms": pipeline_output["latency_ms"],
            }
            pipeline_cache_service.set(
                key=cache_key,
                workspace_id=workspace_id,
                data=cache_payload,
                ttl_seconds=settings.pipeline_cache_ttl_seconds,
            )
        except Exception as set_err:
            logger.warning("Failed storing result in pipeline cache: %s", set_err)

    return pipeline_output


def _run_pipeline_execution(
    db: Session,
    workspace_id: UUID,
    prompt: str,
    top_k: int,
    ws_settings: Dict[str, Any],
    emit: Callable,
    start_time: float,
) -> Dict[str, Any]:
    """Execute raw pipeline stages from retrieval through PostgreSQL persistence."""

    try:
        # 1. Retrieve evidence
        emit("retrieval", "running", "Retrieving relevant reference passages from vector and keyword index...", {"top_k": top_k})
        passages = retrieve_hybrid(db, workspace_id, prompt, top_k=top_k)
        emit("retrieval", "completed", f"Retrieved {len(passages)} reference passage(s) across dense vector and lexical indices.", {"passages_count": len(passages)})

        # 2. Generate Draft Answer
        emit("generation", "running", "Synthesizing grounded draft answer from retrieved passages...")
        draft_answer = generate_draft_answer(prompt, passages)
        emit("generation", "completed", "Synthesized grounded draft answer with source citations.")

        # 3. Decompose Atomic Claims
        emit("decomposition", "running", "Decomposing answer into atomic, verifiable factual claims...")
        raw_claims = extract_atomic_claims(draft_answer)
        emit("decomposition", "completed", f"Decomposed answer into {len(raw_claims)} atomic factual claim(s).", {"claim_count": len(raw_claims)})

        # 4. Verify Claims against Evidence
        emit("verification", "running", "Auditing atomic claims across structured judge, numeric checks, and citation provenance...")
        verification_result = verify_claims(raw_claims, passages)

        verification_errors = [c for c in verification_result["claims"] if c.get("verdict") == "verification_error"]
        if verification_errors:
            emit("verification", "failed", "Verification error encountered during claim audit pass.")
            error_summary = f"{len(verification_errors)} claim(s) failed with verification_error: " + "; ".join(c.get("rationale", "") for c in verification_errors)
            logger.error(error_summary)
            try:
                failed_query = Query(
                    id=uuid.uuid4(),
                    workspace_id=workspace_id,
                    prompt=prompt,
                    query_parameters={"top_k": top_k, "error_summary": error_summary[:500]},
                    status="failed",
                )
                db.add(failed_query)
                db.commit()
            except Exception as db_err:
                db.rollback()
                logger.error("Failed persisting failed query record: %s", db_err)
            raise VerificationProviderError(error_summary)

        emit("verification", "completed", f"Audited {len(verification_result['claims'])} claim(s) against retrieved evidence.", {"claims_count": len(verification_result["claims"])})

        # 5. Targeted Self-Correction Loop
        emit("correction", "running", "Evaluating verification verdicts and executing self-correction if required...")
        # Read workspace policy overrides if configured
        ws_settings = {}
        if workspace_id and db:
            try:
                ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
                if ws and ws.settings_:
                    ws_settings = ws.settings_
            except Exception as ws_err:
                logger.warning("Could not read workspace settings for %s: %s", workspace_id, ws_err)

        max_retries = ws_settings.get("max_correction_retries")
        abstention_policy = ws_settings.get("abstention_policy", "strict")
        preferred_llm = ws_settings.get("preferred_llm_provider")

        final_text, rounds, is_abstained, final_claims, correction_history = execute_correction_loop(
            prompt,
            draft_answer,
            verification_result["claims"],
            passages,
            max_retries=max_retries,
            db=db,
            workspace_id=workspace_id,
            abstention_policy=abstention_policy,
            llm_provider=preferred_llm,
        )

        final_errors = [c for c in final_claims if c.get("verdict") == "verification_error"]
        if final_errors:
            emit("correction", "failed", "Verification error encountered during self-correction loop.")
            error_summary = f"{len(final_errors)} claim(s) failed with verification_error: " + "; ".join(c.get("rationale", "") for c in final_errors)
            logger.error(error_summary)
            try:
                failed_query = Query(
                    id=uuid.uuid4(),
                    workspace_id=workspace_id,
                    prompt=prompt,
                    query_parameters={"top_k": top_k, "error_summary": error_summary[:500]},
                    status="failed",
                )
                db.add(failed_query)
                db.commit()
            except Exception as db_err:
                db.rollback()
                logger.error("Failed persisting failed query record: %s", db_err)
            raise VerificationProviderError(error_summary)

        if is_abstained:
            corr_msg = "Pipeline abstained due to insufficient or ungrounded evidence."
        elif rounds > 0:
            corr_msg = f"Self-correction concluded after {rounds} revision round(s)."
        else:
            corr_msg = "All factual claims fully supported; no correction required."
        emit("correction", "completed", corr_msg, {"rounds": rounds, "is_abstained": is_abstained, "final_claims_count": len(final_claims)})
    except providers_base.ProviderError as e:
        emit("execution", "failed", f"Provider outage during pipeline execution: {str(e)}")
        logger.error("Provider outage during pipeline execution: %s", e, exc_info=True)
        try:
            failed_query = Query(
                id=uuid.uuid4(),
                workspace_id=workspace_id,
                prompt=prompt,
                query_parameters={"top_k": top_k, "error_summary": str(e)[:500]},
                status="failed",
            )
            db.add(failed_query)
            db.commit()
        except Exception as db_err:
            db.rollback()
            logger.error("Failed persisting failed query record: %s", db_err)
        raise

    metrics = compute_verification_metrics(final_claims)
    latency_ms = int((time.time() - start_time) * 1000)

    # Compute verification status
    if is_abstained:
        verification_status = "abstained"
    elif metrics.get("hallucination_rate", 0.0) == 0.0 and len(final_claims) > 0:
        verification_status = "verified"
    elif any(c.get("verdict") in ["supported", "partially_supported"] for c in final_claims):
        verification_status = "partially_verified"
    else:
        verification_status = "unresolved"

    execution_metadata = {
        "latency_ms": latency_ms,
        "top_k": top_k,
        "retrieved_passages_count": len(passages),
        "initial_claim_count": len(raw_claims),
        "final_claim_count": len(final_claims),
        "llm_provider": get_settings().llm_provider,
        "correction_rounds": rounds,
        "hallucination_rate": metrics.get("hallucination_rate", 0.0),
        "grounding_rate": metrics.get("grounding_rate", 1.0),
        "cache_hit": False,
    }

    # 6. Database Persistence with atomic transaction rollback
    try:
        emit("finalizing", "running", "Persisting verified answer, claim relations, and audit trail ledger...")
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
            draft_text=draft_answer,
            final_text=final_text,
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
                            ev_link = EvidenceLink(
                                id=uuid.uuid4(),
                                claim_id=claim_record.id,
                                chunk_id=c_uuid,
                                document_filename=doc_fn,
                                relevance_score=ev.get("relevance_score"),
                                exact_quote=ev.get("exact_quote"),
                                start_char_offset=ev.get("start_char_offset"),
                                end_char_offset=ev.get("end_char_offset"),
                            )
                            db.add(ev_link)
                        else:
                            logger.warning(
                                "Evidence chunk %s does not exist in workspace %s; omitting link for claim %s",
                                c_uuid, workspace_id, claim_record.id,
                            )
                    except (ValueError, TypeError) as err:
                        logger.warning("Failed parsing evidence chunk_id '%s': %s", raw_chunk_id, err)

            persisted_claim_objs.append(claim_record)

        # Write one VerificationRun per round (initial verification + each correction round)
        initial_metrics = verification_result.get("metrics") or compute_verification_metrics(verification_result["claims"])
        initial_run = VerificationRun(
            id=uuid.uuid4(),
            answer_id=answer_record.id,
            round_number=1,
            judge_model=get_settings().llm_provider,
            hallucination_rate=initial_metrics.get("hallucination_rate", 0.0),
            verification_summary=initial_metrics,
            latency_ms=latency_ms if rounds == 0 else None,
        )
        db.add(initial_run)

        for item in correction_history:
            round_num = item.get("round", 1) + 1
            round_metrics = item.get("metrics") or metrics
            c_run = VerificationRun(
                id=uuid.uuid4(),
                answer_id=answer_record.id,
                round_number=round_num,
                judge_model=get_settings().llm_provider,
                hallucination_rate=round_metrics.get("hallucination_rate", 0.0),
                verification_summary=round_metrics,
                latency_ms=latency_ms if round_num == (len(correction_history) + 1) else None,
            )
            db.add(c_run)

        # Record audit trail events
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
        emit("finalizing", "completed", "Pipeline persistence and audit ledger finalized.", {"answer_id": str(answer_record.id), "verification_status": verification_status})
    except Exception as e:
        db.rollback()
        logger.exception("Pipeline persistence failed for query in workspace %s: %s", workspace_id, e)
        emit("finalizing", "failed", f"Persistence failure: {str(e)}")
        raise

    return {
        "query": query_record,
        "answer": answer_record,
        "query_id": query_record.id,
        "answer_id": answer_record.id,
        "workspace_id": workspace_id,
        "prompt": prompt,
        "draft_text": draft_answer,
        "final_text": final_text,
        "correction_rounds": rounds,
        "is_abstained": is_abstained,
        "claims": final_claims,
        "correction_history": correction_history,
        "verification_status": verification_status,
        "execution_metadata": execution_metadata,
        "metrics": metrics,
        "latency_ms": latency_ms,
    }
