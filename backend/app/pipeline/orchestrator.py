"""End-to-end RAG orchestrator executing retrieval, generation, decomposition, verification, correction, and persistence."""

import logging
import time
import uuid
from typing import Dict, Any
from uuid import UUID

logger = logging.getLogger(__name__)
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models.queries import Query
from app.db.models.answers import Answer
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
import app.providers.base as providers_base


def run_pipeline(db: Session, workspace_id: UUID, prompt: str, top_k: int = 5) -> Dict[str, Any]:
    """
    Execute complete audited RAG pipeline:
    1. Hybrid retrieval (vector + keyword)
    2. Grounded draft answer synthesis
    3. Atomic claim decomposition
    4. Evidence verification across judge, numeric checks, and provenance
    5. Targeted iterative self-correction loop
    6. Relational PostgreSQL persistence with full claim and evidence linkage
    """
    start_time = time.time()

    try:
        # 1. Retrieve evidence
        passages = retrieve_hybrid(db, workspace_id, prompt, top_k=top_k)

        # 2. Generate Draft Answer
        draft_answer = generate_draft_answer(prompt, passages)

        # 3. Decompose Atomic Claims
        raw_claims = extract_atomic_claims(draft_answer)

        # 4. Verify Claims against Evidence
        verification_result = verify_claims(raw_claims, passages)

        verification_errors = [c for c in verification_result["claims"] if c.get("verdict") == "verification_error"]
        if verification_errors:
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

        # 5. Targeted Self-Correction Loop
        final_text, rounds, is_abstained, final_claims, correction_history = execute_correction_loop(
            prompt,
            draft_answer,
            verification_result["claims"],
            passages,
            db=db,
            workspace_id=workspace_id,
        )

        final_errors = [c for c in final_claims if c.get("verdict") == "verification_error"]
        if final_errors:
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
    except providers_base.ProviderError as e:
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
    }

    # 6. Database Persistence with atomic transaction rollback
    try:
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

        valid_db_chunk_ids = set()
        if candidate_chunk_ids:
            from app.db.models.chunks import Chunk
            from app.db.models.documents import Document
            valid_db_chunk_ids = {
                row[0]
                for row in db.query(Chunk.id)
                .join(Document, Chunk.document_id == Document.id)
                .filter(Document.workspace_id == workspace_id, Chunk.id.in_(candidate_chunk_ids))
                .all()
            }

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
                        if c_uuid in valid_db_chunk_ids:
                            ev_link = EvidenceLink(
                                id=uuid.uuid4(),
                                claim_id=claim_record.id,
                                chunk_id=c_uuid,
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

        run_record = VerificationRun(
            id=uuid.uuid4(),
            answer_id=answer_record.id,
            round_number=max(1, rounds),
            judge_model=get_settings().llm_provider,
            hallucination_rate=metrics["hallucination_rate"],
            verification_summary=metrics,
            latency_ms=latency_ms,
        )
        db.add(run_record)

        db.commit()
        db.refresh(query_record)
        db.refresh(answer_record)
        answer_record.claims = persisted_claim_objs
    except Exception as e:
        db.rollback()
        logger.exception("Pipeline persistence failed for query in workspace %s: %s", workspace_id, e)
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
