"""Persist the LangGraph execution trace and failure reason on queries.

Completed answers already carried their trace in answers.model_config; failed runs had nowhere to store one.
This adds queries.execution_trace (JSONB) and queries.error_message so every query, successful or failed,
can restore its real execution graph. Existing traces are copied over; nothing is reconstructed.

Revision ID: 0008_query_execution_trace
Revises: 0007_resize_embedding_dim
Create Date: 2026-11-03 10:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0008_query_execution_trace"
down_revision: Union[str, None] = "0007_resize_embedding_dim"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "queries",
        sa.Column(
            "execution_trace",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.add_column("queries", sa.Column("error_message", sa.Text(), nullable=True))

    # Carry over traces recorded on answers before this migration (only where a trace really exists).
    op.execute(
        """
        UPDATE queries AS q
        SET execution_trace = a.model_config -> 'execution_trace'
        FROM answers AS a
        WHERE a.query_id = q.id
          AND jsonb_typeof(a.model_config -> 'execution_trace') = 'array'
        """
    )
    # Recover the failure reason for runs that failed before error_message existed.
    op.execute(
        """
        UPDATE queries
        SET error_message = query_parameters ->> 'error_summary'
        WHERE status = 'failed' AND query_parameters ? 'error_summary'
        """
    )


def downgrade() -> None:
    op.drop_column("queries", "error_message")
    op.drop_column("queries", "execution_trace")
