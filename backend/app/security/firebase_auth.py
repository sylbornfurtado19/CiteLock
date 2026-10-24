"""Firebase Authentication token verification and identity decoding."""

import json
from typing import Any, Dict, Optional
from fastapi import HTTPException, status
import firebase_admin
from firebase_admin import auth, credentials

from app.config import get_settings

_firebase_app: Optional[firebase_admin.App] = None


def init_firebase_admin() -> Optional[firebase_admin.App]:
    """Initialize Firebase Admin SDK using configured service account credentials."""
    global _firebase_app
    if _firebase_app:
        return _firebase_app

    settings = get_settings()
    if settings.firebase_service_account_json:
        try:
            raw = settings.firebase_service_account_json.strip()
            if raw.startswith("{"):
                cert_data = json.loads(raw)
                cred = credentials.Certificate(cert_data)
            else:
                cred = credentials.Certificate(raw)

            _firebase_app = firebase_admin.initialize_app(cred)
        except Exception:
            _firebase_app = None
    return _firebase_app


def verify_id_token(token: str) -> Dict[str, Any]:
    """
    Verify Firebase ID token server-side and return decoded claims.
    In production, missing or invalid credentials strictly raise HTTP 401 Unauthorized.
    Development authentication is only permitted when explicitly opt-in in development mode.
    """
    settings = get_settings()
    app = init_firebase_admin()

    if app is not None:
        try:
            decoded = auth.verify_id_token(token)
            return decoded
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid or expired authentication token: {str(e)}",
            )

    # If Firebase Admin is not initialized (e.g. offline local development)
    if settings.environment.lower() == "development" and settings.allow_dev_auth:
        return {
            "uid": "dev_user_placeholder_uid",
            "email": "dev@citelock.local",
            "name": "Dev User",
        }

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication service unconfigured and development bypass disabled.",
    )
