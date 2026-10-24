import io
import pytest
import docx
from tests.conftest import create_sample_pdf, create_scanned_pdf, create_sample_docx
from app.security.file_validation import validate_file_upload, sanitize_filename, compute_checksum
from app.services.ingestion.parser import (
    parse_document,
    parse_pdf,
    parse_docx,
    parse_txt,
    EmptyDocumentError,
    ScannedDocumentError,
    UnsupportedFileTypeError,
)
from app.services.ingestion.chunker import chunk_document, split_text_into_chunks


# --- File Validation Tests ---

def test_validate_file_upload_valid_pdf():
    pdf_bytes = create_sample_pdf("Valid PDF test content")
    is_valid, mime, msg = validate_file_upload("report.pdf", "application/pdf", pdf_bytes)
    assert is_valid is True
    assert mime == "application/pdf"
    assert msg == "Valid"


def test_validate_file_upload_valid_docx():
    docx_bytes = create_sample_docx(["Valid docx body paragraph"])
    is_valid, mime, msg = validate_file_upload("spec.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", docx_bytes)
    assert is_valid is True
    assert "wordprocessingml" in mime


def test_validate_file_upload_empty_bytes():
    is_valid, _, msg = validate_file_upload("empty.txt", "text/plain", b"")
    assert is_valid is False
    assert "empty" in msg.lower()


def test_validate_file_upload_oversized():
    huge_bytes = b"X" * (26 * 1024 * 1024)
    is_valid, _, msg = validate_file_upload("huge.txt", "text/plain", huge_bytes)
    assert is_valid is False
    assert "exceeds" in msg.lower()


def test_validate_file_upload_unsupported_extension():
    is_valid, _, msg = validate_file_upload("script.sh", "application/x-sh", b"echo hello")
    assert is_valid is False
    assert "unsupported" in msg.lower()


def test_validate_file_upload_corrupt_pdf_magic_bytes():
    fake_pdf = b"NOT_A_REAL_PDF_HEADER"
    is_valid, _, msg = validate_file_upload("fake.pdf", "application/pdf", fake_pdf)
    assert is_valid is False
    assert "%PDF-" in msg


def test_validate_file_upload_corrupt_docx_magic_bytes():
    fake_docx = b"NOT_A_ZIP_HEADER"
    is_valid, _, msg = validate_file_upload("fake.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", fake_docx)
    assert is_valid is False
    assert "ZIP" in msg


def test_sanitize_filename_prevents_traversal():
    assert sanitize_filename("../../../etc/passwd") == "passwd"
    assert sanitize_filename("..\\..\\secret.pdf") == "secret.pdf"
    assert sanitize_filename("safe_name.pdf") == "safe_name.pdf"


def test_compute_checksum():
    chk1 = compute_checksum(b"hello world")
    chk2 = compute_checksum(b"hello world")
    chk3 = compute_checksum(b"different content")
    assert chk1 == chk2
    assert chk1 != chk3


# --- Document Parser Tests ---

def test_parse_pdf_extracts_pages_and_offsets():
    pdf_bytes = create_sample_pdf("Architecture document details.", pages=2)
    res = parse_pdf(pdf_bytes, "test.pdf")

    assert res.total_pages == 2
    assert len(res.sections) == 2
    assert res.sections[0].page_number == 1
    assert res.sections[1].page_number == 2
    assert res.sections[0].start_char_offset == 0
    assert res.sections[0].end_char_offset > 0
    assert "Architecture" in res.sections[0].text


def test_parse_pdf_detects_scanned_image_pdf():
    scanned_bytes = create_scanned_pdf()
    with pytest.raises(ScannedDocumentError) as exc_info:
        parse_pdf(scanned_bytes, "scan.pdf")
    assert "scanned" in str(exc_info.value).lower()


def test_parse_docx_extracts_headings_and_tables():
    docx_bytes = create_sample_docx(["Paragraph one for RAG indexing.", "Paragraph two with citations."])
    res = parse_docx(docx_bytes, "manual.docx")

    assert len(res.sections) >= 3  # heading + 2 paragraphs
    assert any("Architecture" in s.text for s in res.sections)
    assert any("Paragraph one" in s.text for s in res.sections)


def test_parse_docx_empty_raises_error():
    empty_doc = docx.Document()
    io_buf = io.BytesIO()
    empty_doc.save(io_buf)
    with pytest.raises(EmptyDocumentError):
        parse_docx(io_buf.getvalue(), "empty.docx")


def test_parse_txt_multi_encoding():
    utf8_text = "Standard UTF-8 text with symbols: © CiteLock 2026."
    res = parse_txt(utf8_text.encode("utf-8"), "notes.txt")
    assert res.total_characters == len(utf8_text)
    assert "CiteLock" in res.full_text

    latin1_bytes = "Café au lait".encode("latin-1")
    res_latin = parse_txt(latin1_bytes, "french.txt")
    assert "Café" in res_latin.full_text


def test_parse_txt_empty_raises_error():
    with pytest.raises(EmptyDocumentError):
        parse_txt(b"   \n\n  ", "blank.txt")


def test_parse_document_dispatch_unsupported():
    with pytest.raises(UnsupportedFileTypeError):
        parse_document(b"binary", "image/png", "photo.png")


# --- Text Chunker Tests ---

def test_split_text_into_chunks_preserves_content():
    sample_text = (
        "CiteLock is an AI auditing framework. "
        "It breaks answers into atomic claims. "
        "Each claim is independently verified against retrieved passages. "
        "When contradictions occur, self-correction triggers bounded retries."
    )
    chunks = split_text_into_chunks(sample_text, chunk_size=80, chunk_overlap=20)
    assert len(chunks) > 1
    # Check that reconstructed words are all present
    all_chunk_text = " ".join(c["text"] for c in chunks)
    assert "CiteLock" in all_chunk_text
    assert "retries" in all_chunk_text


def test_chunk_document_preserves_metadata():
    pdf_bytes = create_sample_pdf("Page content with important metrics.", pages=2)
    parsed = parse_pdf(pdf_bytes, "metrics.pdf")
    chunks = chunk_document(parsed, chunk_size=100, chunk_overlap=20)

    assert len(chunks) >= 2
    assert chunks[0]["chunk_index"] == 0
    assert chunks[0]["metadata"]["page_number"] == 1
    assert chunks[0]["metadata"]["source_filename"] == "metrics.pdf"
    assert chunks[0]["metadata"]["start_char_offset"] >= 0
    assert chunks[0]["metadata"]["end_char_offset"] > chunks[0]["metadata"]["start_char_offset"]
