"""Abstract storage provider interface defining file persistence, download, and signed URL generation."""

from abc import ABC, abstractmethod


class StorageError(Exception):
    """Base exception for storage provider failures."""
    pass


class StorageProvider(ABC):
    """Abstract interface for object storage operations."""

    @abstractmethod
    def upload(self, object_path: str, data: bytes, content_type: str) -> str:
        """Upload binary data to the storage provider at specified object path."""
        pass

    @abstractmethod
    def get_file_bytes(self, object_path: str) -> bytes:
        """Retrieve binary data from the storage provider for a given object path."""
        pass

    @abstractmethod
    def get_signed_url(self, object_path: str, expires_in_seconds: int = 3600) -> str:
        """Generate a time-limited read-only signed URL for an object."""
        pass

    @abstractmethod
    def delete(self, object_path: str) -> bool:
        """Delete a single object from storage."""
        pass

    @abstractmethod
    def delete_prefix(self, prefix: str) -> int:
        """Delete all objects matching a given prefix (e.g. workspace teardown)."""
        pass
