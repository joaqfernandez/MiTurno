"""Versionar sesiones para que la reactivación no restaure accesos revocados."""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = depends_on = None


def upgrade():
    op.add_column("users", sa.Column("sessionVersion", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("oauth_requests", sa.Column("sessionVersion", sa.Integer(), nullable=True))
    # Los tickets anteriores no acreditan una versión: deben volver a autenticarse.
    op.execute(sa.text("DELETE FROM oauth_requests"))
    op.execute(sa.text('UPDATE refresh_tokens SET "revokedAt" = CURRENT_TIMESTAMP WHERE "revokedAt" IS NULL'))


def downgrade():
    op.drop_column("oauth_requests", "sessionVersion")
    op.drop_column("users", "sessionVersion")
