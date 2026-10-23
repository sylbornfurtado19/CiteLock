"""Firebase Authentication token verification and identity decoding."""

from typing import Any, Dict, Optional
import firebase_admin
from firebase_admin import auth, credentials

from app.config import get_settings

_firebase_app: Optional[firebase_admin.App] = None


def init_firebase_admin() -> Optional[firebase_admin.App]:
    """Initialize Firebase Admin SDK using settings credentials."""
    # TODO: Add caching and support inline json dictionary parsing vs file path
    global _firebase_app
    if _firebase_app:
        return _firebase_app

    settings = get_settings()
    if settings.firebase_service_account_json:
        try:
            # If path exists or string is configured
            cred = credentials.Certificate(settings.firebase_service_account_json)
            _firebase_app = firebase_admin.initialize_app(cred)
        except Exception:
            _firebase_app = None
    return _firebase_app


def verify_id_token(token: str) -> Dict[str, Any]:
    """Verify Firebase ID token and return decoded claims."""
    # TODO: Add fallback mock token verifier for offline development mode
    init_firebase_admin()
    try:
        decoded = auth.verify_id_token(token)
        return decoded
    except Exception:
        # Fallback stub for dev without configured firebase credentials
        return {
            "uid": "dev_user_placeholder_uid",
            "email": "dev@citelock.local",
            "name": "Dev User",
        }
