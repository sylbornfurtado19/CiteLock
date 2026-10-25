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
        if settings.allow_dev_auth is True or settings.environment.lower() == "development":
            # Explicit opt-in development/demo fallback
            dev_uid = "dev_default_firebase_uid"
            user = db.query(User).filter(User.firebase_uid == dev_uid).first()
            if not user:
                try:
                    user = User(firebase_uid=dev_uid, email="dev@citelock.local")
                    db.add(user)
                    db.commit()
                    db.refresh(user)
                except Exception:
                    db.rollback()
                    user = db.query(User).filter(User.firebase_uid == dev_uid).first()
            return user

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials required. Development bypass is disabled in this environment.",
        )

    token = credentials.credentials
    claims = verify_id_token(token)
    uid = claims.get("uid") or claims.get("user_id") or claims.get("sub")

    if not uid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token credentials",
        )

    user = db.query(User).filter(User.firebase_uid == uid).first()
    if not user:
        try:
            user = User(firebase_uid=uid, email=claims.get("email") or f"{uid}@citelock.user")
            db.add(user)
            db.commit()
            db.refresh(user)
        except Exception:
            db.rollback()
            user = db.query(User).filter(User.firebase_uid == uid).first()
            if not user:
                raise

    return user


def get_workspace_scoped(
    workspace_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Workspace:
    """Validate workspace existence and enforce strict tenancy isolation for the current user."""
    import uuid

    # Check if a specific valid UUID was supplied
    try:
        parsed_uuid = uuid.UUID(str(workspace_id))
        workspace = (
            db.query(Workspace)
            .filter(Workspace.id == parsed_uuid, Workspace.owner_id == current_user.id)
            .first()
        )
        if workspace:
            return workspace
    except (ValueError, TypeError):
        pass

    # If caller requested default workspace slug or has no workspace yet
    if str(workspace_id) in ("default-workspace-001", "default", "default-workspace"):
        workspace = (
            db.query(Workspace)
            .filter(Workspace.owner_id == current_user.id)
            .order_by(Workspace.created_at.asc())
            .first()
        )
        if not workspace:
            workspace = Workspace(
                name="Default Workspace",
                description="Default workspace auto-provisioned for user",
                owner_id=current_user.id,
            )
            db.add(workspace)
            db.commit()
            db.refresh(workspace)
        return workspace

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Workspace not found or unauthorized access",
    )
