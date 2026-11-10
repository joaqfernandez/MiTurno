"""Aceptación de términos y consentimiento para datos de salud, por cuenta, con versión y fecha."""
from alembic import op
import sqlalchemy as sa

revision = "0008"
down_revision = "0007"
branch_labels = depends_on = None


def upgrade():
    # Las cuentas existentes quedan sin aceptación: nadie aceptó nada todavía y se les pide al ingresar.
    op.add_column("users", sa.Column("termsVersion", sa.String(length=32), nullable=True))
    op.add_column("users", sa.Column("termsAcceptedAt", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("healthDataConsentAt", sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column("users", "healthDataConsentAt")
    op.drop_column("users", "termsAcceptedAt")
    op.drop_column("users", "termsVersion")
