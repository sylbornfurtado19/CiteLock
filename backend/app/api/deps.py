"""FastAPI dependency injection utilities for user authentication and workspace scoping."""

from typing import Dict, Any
from uuid import UUID
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models.users import User
from app.db.models.workspaces import Workspace
from app.security.firebase_auth import verify_id_token

security = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(security),
    db: Session = Depends(get_db),
) -> User:
    """Extract and verify Firebase ID token, returning or syncing the current database User."""
    # TODO: Cache authenticated user lookups in Redis or in-memory LRU
    if not credentials:
        from app.config import get_settings
        settings = get_settings()
        if settings.environment.lower() == "development" and settings.allow_dev_auth is True:
            # Explicit opt-in development fallback
            dev_uid = "dev_default_firebase_uid"
            user = db.query(User).filter(User.firebase_uid == dev_uid).first()
            if not user:
                user = User(firebase_uid=dev_uid, email="dev@citelock.local")
                db.add(user)
                db.commit()
                db.refresh(user)
            return user

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials required. Development bypass is disabled in this environment.",
        )

    token = credentials.credentials
    claims = verify_id_token(token)
    uid = claims.get("uid")

    if not uid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token credentials",
        )

    user = db.query(User).filter(User.firebase_uid == uid).first()
    if not user:
        user = User(firebase_uid=uid, email=claims.get("email"))
        db.add(user)
        db.commit()
        db.refresh(user)

    return user


def get_workspace_scoped(
    workspace_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Workspace:
    """Validate workspace existence and enforce strict tenancy isolation for the current user."""
    # TODO: Add shared workspace permissions and role checking
    workspace = (
        db.query(Workspace)
        .filter(Workspace.id == workspace_id, Workspace.owner_id == current_user.id)
        .first()
    )
    if not workspace:
        # Auto-create or return dummy for initial unseeded local demo if requested
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found or unauthorized access",
        )
    return workspace
