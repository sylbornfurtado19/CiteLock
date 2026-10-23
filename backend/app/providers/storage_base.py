"""Abstract storage provider interface defining file persistence and signed URL generation."""

from abc import ABC, abstractmethod


class StorageProvider(ABC):
    """Abstract interface for object storage operations."""

    @abstractmethod
    def upload(self, object_path: str, data: bytes, content_type: str) -> str:
        """Upload binary data to the storage provider at specified object path."""
        # TODO: Support streaming uploads for large payloads
        pass

    @abstractmethod
    def get_signed_url(self, object_path: str, expires_in_seconds: int = 3600) -> str:
        """Generate a time-limited read-only signed URL for an object."""
        # TODO: Add dynamic expiration overrides based on client role
        pass

    @abstractmethod
    def delete(self, object_path: str) -> bool:
        """Delete a single object from storage."""
        # TODO: Add soft delete option
        pass

    @abstractmethod
    def delete_prefix(self, prefix: str) -> int:
        """Delete all objects matching a given prefix (e.g. workspace teardown)."""
        # TODO: Implement batch deletion pagination
        pass
