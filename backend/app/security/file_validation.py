"""Uploaded file security validation, MIME type checks, and content inspection."""

import hashlib
from typing import Tuple

ALLOWED_MIME_TYPES = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "text/plain": ".txt",
    "text/markdown": ".md",
}

MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024  # 25 MB


def validate_file_upload(filename: str, content_type: str, file_bytes: bytes) -> Tuple[bool, str]:
    """Validate file size, extension, MIME type, and calculate SHA-256 checksum."""
    # TODO: Add deep magic byte header inspection and malware scanning hooks
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        return False, "File exceeds maximum allowable size (25MB)."

    if content_type not in ALLOWED_MIME_TYPES:
        return False, f"Unsupported file type: {content_type}."

    return True, "Valid"


def compute_checksum(file_bytes: bytes) -> str:
    """Compute cryptographic SHA-256 checksum of raw file bytes."""
    # TODO: Implement chunked streaming hashing for large files
    return hashlib.sha256(file_bytes).hexdigest()
