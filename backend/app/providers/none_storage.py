"""No-op local storage provider for lightweight testing without cloud credentials."""

from app.providers.storage_base import StorageProvider


class NoneStorageProvider(StorageProvider):
    """In-memory or mock storage provider for local testing and CI/CD runs."""

    def upload(self, object_path: str, data: bytes, content_type: str) -> str:
        """Mock upload returning destination object path."""
        # TODO: Implement local filesystem mirroring if needed for dev inspection
        return object_path

    def get_signed_url(self, object_path: str, expires_in_seconds: int = 3600) -> str:
        """Mock signed URL."""
        # TODO: Return local static file server URL
        return f"http://localhost:8000/mock-storage/{object_path}"

    def delete(self, object_path: str) -> bool:
        """Mock delete operation."""
        # TODO: Add local mock registry tracking
        return True

    def delete_prefix(self, prefix: str) -> int:
        """Mock prefix deletion."""
        # TODO: Clear mock storage records matching prefix
        return 1
