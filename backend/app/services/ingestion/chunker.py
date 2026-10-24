"""Text chunking service creating semantically bounded passages with overlap and metadata."""

import re
from typing import Any, Dict, List, Optional
from uuid import UUID

from app.services.ingestion.parser import ParseResult, ParsedSection


def split_text_into_chunks(
    text: str,
    chunk_size: int = 500,
    chunk_overlap: int = 50,
) -> List[Dict[str, Any]]:
    """
    Split text into overlapping chunks respecting paragraph, newline, and sentence boundaries.
    Returns list of dicts with chunk text, start_offset_in_text, and end_offset_in_text.
    """
    if not text:
        return []

    if len(text) <= chunk_size:
        return [{"text": text, "start_offset": 0, "end_offset": len(text)}]

    chunks = []
    start = 0
    text_length = len(text)

    while start < text_length:
        end = min(start + chunk_size, text_length)

        if end < text_length:
            # Look for suitable split point (paragraphs -> lines -> sentences -> whitespace)
            split_candidates = [
                text.rfind("\n\n", start, end),
                text.rfind("\n", start, end),
                text.rfind(". ", start, end),
                text.rfind("? ", start, end),
                text.rfind("! ", start, end),
                text.rfind("; ", start, end),
                text.rfind(" ", start, end),
            ]

            best_split = -1
            for cand in split_candidates:
                # Only accept split if it gives at least half of chunk_size to avoid degenerate tiny chunks
                if cand != -1 and (cand - start) >= (chunk_size // 2):
                    best_split = cand
                    # For punctuation, include the punctuation character
                    if text[cand:cand + 2] in [". ", "? ", "! ", "; "]:
                        best_split += 1
                    break

            if best_split != -1:
                end = best_split

        chunk_content = text[start:end].strip()
        if chunk_content:
            chunks.append({
                "text": chunk_content,
                "start_offset": start,
                "end_offset": end,
            })

        if end >= text_length:
            break

        # Move forward, backing up by overlap
        step = max(1, (end - start) - chunk_overlap)
        start += step

    return chunks


def chunk_document(
    parse_result: ParseResult,
    chunk_size: int = 500,
    chunk_overlap: int = 50,
    document_id: Optional[UUID] = None,
    filename: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Generate structured chunks from parsed sections, preserving source offsets, page numbers, and metadata.
    """
    all_chunks: List[Dict[str, Any]] = []
    global_chunk_idx = 0
    doc_filename = filename or parse_result.filename

    for section in parse_result.sections:
        section_chunks = split_text_into_chunks(
            section.text,
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
        )

        for sc in section_chunks:
            # Compute document-level character offsets
            doc_start_offset = section.start_char_offset + sc["start_offset"]
            doc_end_offset = section.start_char_offset + sc["end_offset"]
            content = sc["text"]
            token_count = len(re.findall(r"\w+", content))

            chunk_meta = {
                "page_number": section.page_number,
                "section_title": section.section_title,
                "start_char_offset": doc_start_offset,
                "end_char_offset": doc_end_offset,
                "source_filename": doc_filename,
                **section.metadata,
            }
            if document_id:
                chunk_meta["document_id"] = str(document_id)

            all_chunks.append({
                "chunk_index": global_chunk_idx,
                "content": content,
                "token_count": token_count,
                "metadata": chunk_meta,
            })
            global_chunk_idx += 1

    return all_chunks


def chunk_text(text: str, chunk_size: int = 500, chunk_overlap: int = 50) -> List[Dict[str, Any]]:
    """Legacy helper for plain text chunking."""
    from app.services.ingestion.parser import ParsedSection, ParseResult
    dummy_section = ParsedSection(text=text, start_char_offset=0, end_char_offset=len(text))
    dummy_parse = ParseResult(
        filename="inline.txt",
        mime_type="text/plain",
        total_pages=1,
        total_characters=len(text),
        sections=[dummy_section],
    )
    return chunk_document(dummy_parse, chunk_size=chunk_size, chunk_overlap=chunk_overlap)
