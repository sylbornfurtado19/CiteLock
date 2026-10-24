"""Draft answer generation service synthesizing retrieved passages into grounded response."""

from typing import List, Dict, Any
import app.providers.base as providers_base
from app.providers.base import ProviderError


class GenerationError(Exception):
    """Exception raised when grounded answer generation fails."""
    pass


def generate_draft_answer(query: str, retrieved_passages: List[Dict[str, Any]]) -> str:
    """
    Generate grounded draft answer synthesizing retrieved passages with source citations.
    Validates provider responses and never silently substitutes a fabricated answer.
    """
    if not query or not query.strip():
        raise GenerationError("Query cannot be empty.")

    if not retrieved_passages or not any(p.get("content", "").strip() for p in retrieved_passages):
        return "Based on the provided documentation in this workspace, no relevant reference evidence was found to answer this query."

    llm = providers_base.get_llm_provider()

    formatted_passages = []
    for idx, p in enumerate(retrieved_passages, start=1):
        chunk_id = p.get("id") or p.get("chunk_id", f"chunk-{idx}")
        filename = p.get("filename", "document")
        content = p.get("content", "").strip()
        formatted_passages.append(
            f"[Passage {idx}] (Document: {filename}, Chunk ID: {chunk_id}):\n{content}"
        )

    passages_block = "\n\n".join(formatted_passages)

    system_prompt = (
        "You are CiteLock's grounded RAG synthesis engine. Synthesize an objective, strictly factual answer "
        "to the user query based ONLY on the provided reference passages.\n"
        "Requirements:\n"
        "1. Never assert facts, quantities, dates, or conclusions that are not directly confirmed by the text.\n"
        "2. Include valid source identifiers in brackets (e.g. [Passage 1] or [Chunk ID: <id>]) following statements derived from them.\n"
        "3. If the reference passages do not contain sufficient information to answer aspects of the query, explicitly state that the documentation does not provide that information.\n"
        "4. Do not invent citations, passages, or external knowledge."
    )

    user_prompt = (
        f"Reference Evidence Passages:\n{passages_block}\n\n"
        f"User Query: {query.strip()}\n\n"
        f"Synthesized Grounded Answer:"
    )

    try:
        completion = llm.complete(user_prompt, system_prompt=system_prompt, temperature=0.0)
    except ProviderError as e:
        raise GenerationError(f"Model provider failed during answer generation: {str(e)}") from e
    except Exception as e:
        raise GenerationError(f"Unexpected generation failure: {str(e)}") from e

    if not completion or not completion.strip():
        raise GenerationError("Model provider returned empty response for draft answer.")

    return completion.strip()
