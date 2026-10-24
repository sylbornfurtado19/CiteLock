"""Document parsing service extracting text and metadata from PDF, DOCX, and text formats."""

import io
from typing import Any, Dict, List, Optional
import fitz  # PyMuPDF
import docx  # python-docx


class IngestionError(Exception):
    """Base exception for document ingestion failures."""
    pass


class UnsupportedFileTypeError(IngestionError):
    """Raised when file format is not supported."""
    pass


class EmptyDocumentError(IngestionError):
    """Raised when extracted document text is empty."""
    pass


class ScannedDocumentError(IngestionError):
    """Raised when a PDF is detected as a scanned image without an OCR/text layer."""
    pass


class ParsedSection:
    """A granular structural section of extracted text preserving source location."""

    def __init__(
        self,
        text: str,
        start_char_offset: int,
        end_char_offset: int,
        page_number: Optional[int] = None,
        section_title: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        self.text = text
        self.start_char_offset = start_char_offset
        self.end_char_offset = end_char_offset
        self.page_number = page_number
        self.section_title = section_title
        self.metadata = metadata or {}

    def to_dict(self) -> Dict[str, Any]:
        return {
            "text": self.text,
            "start_char_offset": self.start_char_offset,
            "end_char_offset": self.end_char_offset,
            "page_number": self.page_number,
            "section_title": self.section_title,
            "metadata": self.metadata,
        }


class ParseResult:
    """Aggregate result from parsing a document."""

    def __init__(
        self,
        filename: str,
        mime_type: str,
        total_pages: Optional[int],
        total_characters: int,
        sections: List[ParsedSection],
        metadata: Optional[Dict[str, Any]] = None,
    ):
        self.filename = filename
        self.mime_type = mime_type
        self.total_pages = total_pages
        self.total_characters = total_characters
        self.sections = sections
        self.metadata = metadata or {}

    @property
    def full_text(self) -> str:
        return "\n\n".join(s.text for s in self.sections if s.text.strip())


def parse_pdf(file_bytes: bytes, filename: str) -> ParseResult:
    """Parse PDF document using PyMuPDF page-by-page, detecting scanned documents honestly."""
    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
    except Exception as e:
        raise IngestionError(f"Corrupted or invalid PDF file: {e}")

    total_pages = len(doc)
    if total_pages == 0:
        raise EmptyDocumentError("PDF file has 0 pages.")

    sections: List[ParsedSection] = []
    total_chars = 0
    total_images_found = 0
    cumulative_offset = 0

    for page_idx in range(total_pages):
        page = doc[page_idx]
        page_num = page_idx + 1
        page_text = page.get_text("text").strip()
        image_list = page.get_images()
        total_images_found += len(image_list)

        if page_text:
            start_offset = cumulative_offset
            end_offset = start_offset + len(page_text)
            sections.append(
                ParsedSection(
                    text=page_text,
                    start_char_offset=start_offset,
                    end_char_offset=end_offset,
                    page_number=page_num,
                    metadata={"page_number": page_num, "image_count": len(image_list)},
                )
            )
            cumulative_offset = end_offset + 2  # account for separator
            total_chars += len(page_text)

    # Scanned document detection: if there are pages and images, but negligible or 0 text
    if total_chars < 20:
        if total_images_found > 0 or total_pages > 0:
            raise ScannedDocumentError(
                "Scanned or image-only PDF detected. The document contains visual elements but no embedded text layer. OCR processing is required."
            )
        raise EmptyDocumentError("PDF contains no readable text content.")

    return ParseResult(
        filename=filename,
        mime_type="application/pdf",
        total_pages=total_pages,
        total_characters=total_chars,
        sections=sections,
        metadata={"page_count": total_pages, "image_count": total_images_found},
    )


def parse_docx(file_bytes: bytes, filename: str) -> ParseResult:
    """Parse DOCX document using python-docx extracting paragraphs, headings, and tables."""
    try:
        doc = docx.Document(io.BytesIO(file_bytes))
    except Exception as e:
        raise IngestionError(f"Corrupted or invalid DOCX file: {e}")

    sections: List[ParsedSection] = []
    cumulative_offset = 0
    total_chars = 0
    current_heading = "Introduction"

    # 1. Process paragraphs
    for p_idx, p in enumerate(doc.paragraphs):
        text = p.text.strip()
        if not text:
            continue

        style_name = getattr(p.style, "name", "")
        if "heading" in style_name.lower():
            current_heading = text

        start_offset = cumulative_offset
        end_offset = start_offset + len(text)
        sections.append(
            ParsedSection(
                text=text,
                start_char_offset=start_offset,
                end_char_offset=end_offset,
                section_title=current_heading,
                metadata={"paragraph_index": p_idx, "style": style_name},
            )
        )
        cumulative_offset = end_offset + 2
        total_chars += len(text)

    # 2. Process tables
    for t_idx, table in enumerate(doc.tables):
        table_rows = []
        for row in table.rows:
            row_text = " | ".join(cell.text.strip() for cell in row.cells if cell.text.strip())
            if row_text:
                table_rows.append(row_text)

        if table_rows:
            table_content = "\n".join(table_rows)
            start_offset = cumulative_offset
            end_offset = start_offset + len(table_content)
            sections.append(
                ParsedSection(
                    text=table_content,
                    start_char_offset=start_offset,
                    end_char_offset=end_offset,
                    section_title=f"{current_heading} (Table {t_idx + 1})",
                    metadata={"table_index": t_idx, "is_table": True},
                )
            )
            cumulative_offset = end_offset + 2
            total_chars += len(table_content)

    if total_chars == 0:
        raise EmptyDocumentError("DOCX document contains no readable text content.")

    return ParseResult(
        filename=filename,
        mime_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        total_pages=None,
        total_characters=total_chars,
        sections=sections,
        metadata={"paragraph_count": len(doc.paragraphs), "table_count": len(doc.tables)},
    )


def parse_txt(file_bytes: bytes, filename: str, mime_type: str = "text/plain") -> ParseResult:
    """Parse plain text or markdown file with multi-encoding fallback."""
    raw_text = None
    for encoding in ["utf-8", "utf-8-sig", "latin-1", "cp1252"]:
        try:
            raw_text = file_bytes.decode(encoding)
            break
        except UnicodeDecodeError:
            continue

    if raw_text is None:
        raise IngestionError("Unable to decode text file using supported encodings (UTF-8, Latin-1).")

    cleaned = raw_text.strip()
    if not cleaned:
        raise EmptyDocumentError("Text file is empty or contains only whitespace.")

    # Split into paragraphs to preserve offsets
    paragraphs = [p.strip() for p in cleaned.split("\n\n") if p.strip()]
    if not paragraphs:
        paragraphs = [cleaned]

    sections: List[ParsedSection] = []
    cumulative_offset = 0
    total_chars = 0

    for idx, para in enumerate(paragraphs):
        start_offset = cumulative_offset
        end_offset = start_offset + len(para)
        sections.append(
            ParsedSection(
                text=para,
                start_char_offset=start_offset,
                end_char_offset=end_offset,
                section_title=f"Paragraph {idx + 1}",
                metadata={"paragraph_index": idx},
            )
        )
        cumulative_offset = end_offset + 2
        total_chars += len(para)

    return ParseResult(
        filename=filename,
        mime_type=mime_type,
        total_pages=1,
        total_characters=total_chars,
        sections=sections,
        metadata={"paragraph_count": len(paragraphs)},
    )


def parse_document(file_bytes: bytes, mime_type: str, filename: str) -> ParseResult:
    """
    Unified document parsing dispatch for PDF, DOCX, and text formats.
    Extracts text, page numbers, character offsets, and structural metadata.
    """
    lower_filename = filename.lower()

    if mime_type == "application/pdf" or lower_filename.endswith(".pdf"):
        return parse_pdf(file_bytes, filename)
    elif (
        mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        or lower_filename.endswith(".docx")
    ):
        return parse_docx(file_bytes, filename)
    elif (
        mime_type in ["text/plain", "text/markdown"]
        or lower_filename.endswith(".txt")
        or lower_filename.endswith(".md")
    ):
        return parse_txt(file_bytes, filename, mime_type=mime_type)
    else:
        raise UnsupportedFileTypeError(f"Unsupported file format '{mime_type}' for '{filename}'.")
