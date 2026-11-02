"""Add settings JSONB column to workspaces table.

Revision ID: 0006_add_workspace_settings
Revises: 0005_targeted_composite_indexes
Create Date: 2026-11-02 12:40:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0006_add_workspace_settings"
down_revision: Union[str, None] = "0005_targeted_composite_indexes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "workspaces",
        sa.Column(
            "settings",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("workspaces", "settings")

