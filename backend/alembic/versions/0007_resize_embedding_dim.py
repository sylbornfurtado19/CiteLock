"""Resize embedding vector column from 1536 to 768 dimensions for Gemini provider.

Revision ID: 0007_resize_embedding_dim
Revises: 0006_add_workspace_settings
Create Date: 2026-11-02 13:12:00.000000

"""
from typing import Sequence, Union
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0007_resize_embedding_dim"
down_revision: Union[str, None] = "0006_add_workspace_settings"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop the HNSW index first (it's dimension-bound)
    op.execute("DROP INDEX IF EXISTS ix_chunks_embedding_hnsw;")

    # Wipe existing embeddings (they were 1536-dim OpenAI vectors, incompatible with 768-dim Gemini)
    op.execute("UPDATE chunks SET embedding = NULL;")

    # Resize the vector column to 768 dimensions
    op.execute("ALTER TABLE chunks ALTER COLUMN embedding TYPE vector(768);")

    # Recreate the HNSW index for 768-dim vectors
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_chunks_embedding_hnsw "
        "ON chunks USING hnsw (embedding vector_cosine_ops);"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_chunks_embedding_hnsw;")
    op.execute("UPDATE chunks SET embedding = NULL;")
    op.execute("ALTER TABLE chunks ALTER COLUMN embedding TYPE vector(1536);")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_chunks_embedding_hnsw "
        "ON chunks USING hnsw (embedding vector_cosine_ops);"
    )
