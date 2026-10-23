"""End-to-end RAG orchestrator executing retrieval, generation, decomposition, verification, correction, and persistence."""

from typing import Dict, Any
from uuid import UUID
from sqlalchemy.orm import Session

from app.services.retrieval.hybrid import retrieve_hybrid
from app.services.generation.answer import generate_draft_answer
from app.services.generation.claim_extractor import extract_atomic_claims
from app.services.verification.engine import verify_claims
from app.services.correction.controller import execute_correction_loop


def run_pipeline(db: Session, workspace_id: UUID, prompt: str, top_k: int = 5) -> Dict[str, Any]:
    """Execute complete audited pipeline: retrieve -> generate -> decompose -> verify -> correct -> persist."""
    # TODO: Implement complete persistence of query, answer, claims, and evidence links to database
    # 1. Retrieve
    passages = retrieve_hybrid(db, workspace_id, prompt, top_k=top_k)

    # 2. Generate Draft
    draft_answer = generate_draft_answer(prompt, passages)

    # 3. Decompose Claims
    raw_claims = extract_atomic_claims(draft_answer)

    # 4. Verify Claims
    verification_result = verify_claims(raw_claims, passages)

    # 5. Self-Correction Loop
    final_text, rounds, is_abstained = execute_correction_loop(
        prompt, draft_answer, verification_result["claims"], passages
    )

    # 6. Persistence placeholder
    return {
        "prompt": prompt,
        "draft_text": draft_answer,
        "final_text": final_text,
        "correction_rounds": rounds,
        "is_abstained": is_abstained,
        "claims": verification_result["claims"],
        "metrics": verification_result["metrics"],
    }
