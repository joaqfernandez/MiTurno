"""Google login identities and single-use requests."""
from alembic import op
import sqlalchemy as sa
revision = "0002"
down_revision = "0001"
branch_labels = depends_on = None


def upgrade():
    op.add_column("users", sa.Column("googleSubject", sa.String(255), nullable=True))
    op.create_index("ix_users_googleSubject", "users", ["googleSubject"], unique=True)
    op.create_table("oauth_requests",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("createdAt", sa.DateTime(timezone=True), nullable=False),
        sa.Column("tokenHash", sa.String(64), nullable=False, unique=True),
        sa.Column("bindingHash", sa.String(64), nullable=False),
        sa.Column("purpose", sa.String(16), nullable=False),
        sa.Column("userId", sa.String(64), sa.ForeignKey("users.id")),
        sa.Column("nonce", sa.String(128), nullable=False),
        sa.Column("expiresAt", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_oauth_requests_expiresAt", "oauth_requests", ["expiresAt"])


def downgrade():
    op.drop_table("oauth_requests")
    op.drop_index("ix_users_googleSubject", table_name="users")
    op.drop_column("users", "googleSubject")
