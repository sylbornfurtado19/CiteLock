"""Uploaded file security validation, MIME type checks, and content inspection."""

import hashlib
import os
import re
from typing import Tuple

ALLOWED_EXTENSIONS = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt": "text/plain",
    ".md": "text/markdown",
}

ALLOWED_MIME_TYPES = {
    "application/pdf": [".pdf"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    "text/plain": [".txt", ".md"],
    "text/markdown": [".md"],
    "application/octet-stream": [".pdf", ".docx", ".txt", ".md"],
}

MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024  # 25 MB


def sanitize_filename(filename: str) -> str:
    """Sanitize filename to prevent path traversal and shell injection."""
    clean = os.path.basename(filename or "unnamed_document")
    clean = re.sub(r'[\x00-\x1f\\/:"*?<>|]', "_", clean)
    clean = clean.strip()
    return clean or "unnamed_document"


def validate_file_upload(filename: str, content_type: str, file_bytes: bytes) -> Tuple[bool, str, str]:
    """
    Validate file size, extension, MIME type, and magic byte signatures.
    Returns (is_valid, resolved_mime_type, reason_or_status).
    """
    if not file_bytes or len(file_bytes) == 0:
        return False, content_type, "File is empty (0 bytes)."

    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        return False, content_type, f"File size exceeds maximum allowable limit ({MAX_FILE_SIZE_BYTES // (1024 * 1024)}MB)."

    ext = os.path.splitext(filename.lower())[1]
    if ext not in ALLOWED_EXTENSIONS:
        return False, content_type, f"Unsupported file extension '{ext}'. Allowed extensions: {', '.join(ALLOWED_EXTENSIONS.keys())}."

    expected_mime = ALLOWED_EXTENSIONS[ext]
    normalized_content_type = content_type.lower().split(";")[0].strip()

    # Allow fallback if browser sent application/octet-stream or generic text/plain
    if normalized_content_type in ALLOWED_MIME_TYPES:
        allowed_exts = ALLOWED_MIME_TYPES[normalized_content_type]
        if ext not in allowed_exts:
            return False, content_type, f"MIME type '{normalized_content_type}' does not match file extension '{ext}'."
    else:
        # Default to expected MIME if extension is strictly known
        normalized_content_type = expected_mime

    # Magic byte signature checks
    if ext == ".pdf":
        if not file_bytes.startswith(b"%PDF-") and b"%PDF-" not in file_bytes[:1024]:
            return False, normalized_content_type, "Invalid PDF: missing '%PDF-' header signature."

    if ext == ".docx":
        # OOXML documents are ZIP archives starting with PK\x03\x04
        if not file_bytes.startswith(b"PK\x03\x04"):
            return False, normalized_content_type, "Invalid DOCX: missing ZIP archive header signature."

    return True, expected_mime, "Valid"


def compute_checksum(file_bytes: bytes) -> str:
    """Compute cryptographic SHA-256 checksum of raw file bytes."""
    return hashlib.sha256(file_bytes).hexdigest()
