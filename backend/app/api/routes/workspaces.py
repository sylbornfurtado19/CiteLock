"""Workspace management endpoints for creating, listing, and inspecting tenant environments."""

from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models.users import User
from app.db.models.workspaces import Workspace
from app.api.deps import get_current_user, get_workspace_scoped
from app.schemas import WorkspaceCreate, WorkspaceRead

router = APIRouter(prefix="/workspaces", tags=["Workspaces"])


@router.get("", response_model=List[WorkspaceRead])
def list_workspaces(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all workspaces owned by or shared with current user."""
    # TODO: Implement pagination and sorting
    return db.query(Workspace).filter(Workspace.owner_id == current_user.id).all()


@router.post("", response_model=WorkspaceRead, status_code=status.HTTP_201_CREATED)
def create_workspace(
    payload: WorkspaceCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new isolated workspace."""
    # TODO: Add workspace quota limits per user tier
    workspace = Workspace(
        name=payload.name,
        description=payload.description,
        owner_id=current_user.id,
    )
    db.add(workspace)
    db.commit()
    db.refresh(workspace)
    return workspace


@router.get("/{workspace_id}", response_model=WorkspaceRead)
def get_workspace(
    workspace: Workspace = Depends(get_workspace_scoped),
):
    """Retrieve details for a specific workspace."""
    # TODO: Return aggregated stats (doc count, query count)
    return workspace
