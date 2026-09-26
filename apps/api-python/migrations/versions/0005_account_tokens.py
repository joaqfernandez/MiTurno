"""Verificación de email y links de un solo uso (recuperar contraseña, verificar email)."""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = depends_on = None


def upgrade():
    op.add_column("users", sa.Column("emailVerifiedAt", sa.DateTime(timezone=True), nullable=True))
    # Las cuentas previas ya operaban sin verificación: no se las deja afuera.
    op.execute(sa.text('UPDATE users SET "emailVerifiedAt" = CURRENT_TIMESTAMP'))
    op.create_table("account_tokens",
        sa.Column("userId", sa.String(length=64), nullable=False),
        sa.Column("purpose", sa.String(length=32), nullable=False),
        sa.Column("tokenHash", sa.String(length=64), nullable=False),
        sa.Column("sessionVersion", sa.Integer(), nullable=False),
        sa.Column("expiresAt", sa.DateTime(timezone=True), nullable=False),
        sa.Column("usedAt", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("createdAt", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["userId"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tokenHash"),
    )
    op.create_index(op.f("ix_account_tokens_userId"), "account_tokens", ["userId"], unique=False)


def downgrade():
    op.drop_index(op.f("ix_account_tokens_userId"), table_name="account_tokens")
    op.drop_table("account_tokens")
    op.drop_column("users", "emailVerifiedAt")
