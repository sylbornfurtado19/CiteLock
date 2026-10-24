"""In-memory and local mock storage provider for testing and offline development."""

from typing import Dict
from app.providers.storage_base import StorageProvider, StorageError


class NoneStorageProvider(StorageProvider):
    """In-memory storage provider storing uploaded objects in a dictionary."""

    def __init__(self, simulate_failure: bool = False):
        self._storage: Dict[str, bytes] = {}
        self.simulate_failure = simulate_failure

    def upload(self, object_path: str, data: bytes, content_type: str) -> str:
        """Store bytes in memory or simulate error."""
        if self.simulate_failure:
            raise StorageError("Simulated storage write error.")
        self._storage[object_path] = data
        return object_path

    def get_file_bytes(self, object_path: str) -> bytes:
        """Retrieve stored file bytes."""
        if object_path not in self._storage:
            raise StorageError(f"Object '{object_path}' not found in mock storage.")
        return self._storage[object_path]

    def get_signed_url(self, object_path: str, expires_in_seconds: int = 3600) -> str:
        """Return local preview signed URL placeholder."""
        return f"http://localhost:8000/mock-storage/{object_path}"

    def delete(self, object_path: str) -> bool:
        """Delete object from in-memory storage."""
        if object_path in self._storage:
            del self._storage[object_path]
            return True
        return False

    def delete_prefix(self, prefix: str) -> int:
        """Delete all objects matching a prefix."""
        to_delete = [k for k in self._storage.keys() if k.startswith(prefix)]
        for k in to_delete:
            del self._storage[k]
        return len(to_delete)
