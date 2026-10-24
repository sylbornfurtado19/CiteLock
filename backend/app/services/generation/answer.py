"""Draft answer generation service synthesizing retrieved passages into grounded response."""

from typing import List, Dict, Any

import app.providers.base as providers_base


def generate_draft_answer(query: str, retrieved_passages: List[Dict[str, Any]]) -> str:
    """Generate grounded draft answer synthesizing retrieved passages with source citations."""
    if not retrieved_passages or not any(p.get("content", "").strip() for p in retrieved_passages):
        return "Based on the provided documentation in this workspace, no relevant reference evidence was found to answer this query."

    llm = providers_base.get_llm_provider()

    formatted_passages = []
    for idx, p in enumerate(retrieved_passages, start=1):
        chunk_id = p.get("id") or p.get("chunk_id", f"chunk-{idx}")
        filename = p.get("filename", "document")
        content = p.get("content", "").strip()
        formatted_passages.append(f"[Passage {idx}] (Source: {filename}, Chunk: {chunk_id}):\n{content}")

    passages_block = "\n\n".join(formatted_passages)

    system_prompt = (
        "You are CiteLock's grounded RAG synthesis engine. Synthesize an objective, strictly factual answer "
        "to the user query based ONLY on the provided reference passages.\n"
        "Rules:\n"
        "1. Never assert facts, numbers, dates, or conclusions that are not directly confirmed by the text.\n"
        "2. Avoid vague speculation. If the passages are incomplete or do not mention specific details, say so clearly.\n"
        "3. Maintain concise, direct paragraphs."
    )

    user_prompt = (
        f"Passages:\n{passages_block}\n\n"
        f"User Query: {query.strip()}\n\n"
        f"Synthesized Grounded Answer:"
    )

    return llm.complete(user_prompt, system_prompt=system_prompt, temperature=0.0)
