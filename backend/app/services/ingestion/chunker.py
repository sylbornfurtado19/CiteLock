"""Text chunking service creating semantically bounded passages with overlap and metadata."""

from typing import List, Dict, Any


def chunk_text(text: str, chunk_size: int = 500, chunk_overlap: int = 50) -> List[Dict[str, Any]]:
    """Split extracted text into overlapping chunks preserving sentence and paragraph integrity."""
    # TODO: Implement token-based sliding window chunking with paragraph boundary heuristics
    return [
        {
            "chunk_index": 0,
            "content": text[:chunk_size] if text else "",
            "token_count": len(text.split()) if text else 0,
            "metadata": {"char_start": 0, "char_end": min(len(text), chunk_size)},
        }
    ]
