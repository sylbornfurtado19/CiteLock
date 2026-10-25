"""Firebase Cloud Storage provider implementation for private bucket object storage."""

from datetime import timedelta
import firebase_admin
from firebase_admin import storage

from app.config import get_settings
from app.providers.storage_base import StorageProvider, StorageError
from app.security.firebase_auth import init_firebase_admin


class FirebaseStorageProvider(StorageProvider):
    """Firebase Cloud Storage provider accessing private bucket via Admin SDK."""

    def __init__(self):
        init_firebase_admin()
        settings = get_settings()
        self.bucket_name = settings.firebase_storage_bucket
        if self.bucket_name and self.bucket_name.startswith("gs://"):
            self.bucket_name = self.bucket_name.replace("gs://", "").rstrip("/")

    def _get_bucket(self):
        """Retrieve bucket instance, raising StorageError if unconfigured."""
        if not self.bucket_name:
            raise StorageError("FIREBASE_STORAGE_BUCKET is not configured.")
        try:
            return storage.bucket(self.bucket_name)
        except Exception as e:
            raise StorageError(f"Failed to access Firebase storage bucket: {e}")

    def upload(self, object_path: str, data: bytes, content_type: str) -> str:
        """Upload binary data to private Firebase Storage bucket."""
        try:
            bucket = self._get_bucket()
            blob = bucket.blob(object_path)
            blob.upload_from_string(data, content_type=content_type)
            return object_path
        except StorageError:
            raise
        except Exception as e:
            raise StorageError(f"Firebase Storage upload failed: {e}")

    def get_file_bytes(self, object_path: str) -> bytes:
        """Download binary data from private Firebase Storage bucket."""
        try:
            bucket = self._get_bucket()
            blob = bucket.blob(object_path)
            if not blob.exists():
                raise StorageError(f"Object '{object_path}' does not exist in Firebase Storage.")
            return blob.download_as_bytes()
        except StorageError:
            raise
        except Exception as e:
            raise StorageError(f"Firebase Storage download failed: {e}")

    def get_signed_url(self, object_path: str, expires_in_seconds: int = 3600) -> str:
        """Generate temporary v4 signed URL for secure download/viewing."""
        try:
            bucket = self._get_bucket()
            blob = bucket.blob(object_path)
            return blob.generate_signed_url(
                version="v4",
                expiration=timedelta(seconds=expires_in_seconds),
                method="GET",
            )
        except Exception as e:
            raise StorageError(f"Failed to generate signed URL: {e}")

    def delete(self, object_path: str) -> bool:
        """Delete object from Firebase Storage."""
        try:
            bucket = self._get_bucket()
            blob = bucket.blob(object_path)
            if blob.exists():
                blob.delete()
                return True
            return False
        except Exception as e:
            raise StorageError(f"Firebase Storage delete failed: {e}")

    def delete_prefix(self, prefix: str) -> int:
        """Delete all blobs matching prefix."""
        try:
            bucket = self._get_bucket()
            blobs = bucket.list_blobs(prefix=prefix)
            count = 0
            for blob in blobs:
                blob.delete()
                count += 1
            return count
        except Exception as e:
            raise StorageError(f"Firebase Storage delete_prefix failed: {e}")
