"""Preservar historia, autor y episodio de cada entrada clínica."""
from alembic import op
from app.clinical_integrity_v1 import install, uninstall, validate_existing

revision = "0004"
down_revision = "0003"
branch_labels = depends_on = None


def upgrade():
    connection = op.get_bind()
    if connection.dialect.name == "postgresql":
        # Evita que otra transacción introduzca inconsistencias entre revisión y DDL.
        connection.exec_driver_sql("LOCK TABLE medical_records, appointments, medical_record_entries IN SHARE ROW EXCLUSIVE MODE")
    validate_existing(connection)
    install(connection)


def downgrade():
    uninstall(op.get_bind())
