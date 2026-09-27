"""Link propio de cada médico: nombre actual en doctor_profiles.slug e historial de nombres en doctor_links."""
import re
import unicodedata
from datetime import datetime, timezone
from uuid import uuid4
from alembic import op
import sqlalchemy as sa

revision = "0007"
down_revision = "0006"
branch_labels = depends_on = None

# Copia congelada de app/doctor_links.py al 2026-09-27: una migración no debe cambiar si cambia la app.
PATTERN = re.compile(r"^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){2,49}$")
RESERVED = frozenset("""
    admin api app auth ayuda blog buscar configuracion contacto cuenta demo doctores inicio legal login logout
    medico medicos mi-historia mis-turnos miturno miturnos nosotros pacientes panel perfil precios privacidad
    recuperar-contrasena registro restablecer-contrasena salud soporte staging terminos test turnos verificar-email www
""".split())


def clean(text):
    plain = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", plain.lower())


def upgrade():
    op.create_table("doctor_links",
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.Column("doctorId", sa.String(length=64), nullable=False),
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("createdAt", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["doctorId"], ["doctor_profiles.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_index(op.f("ix_doctor_links_doctorId"), "doctor_links", ["doctorId"], unique=False)
    # Sin batch_alter_table: en SQLite recrearía la tabla y perdería sus CHECK sin nombre.
    op.add_column("doctor_profiles", sa.Column("slug", sa.String(length=50), nullable=True))
    op.create_index(op.f("ix_doctor_profiles_slug"), "doctor_profiles", ["slug"], unique=True)

    # Médicos existentes: mismo criterio que el registro. Los que chocan quedan sin link para el administrador.
    connection = op.get_bind()
    specialties = dict(connection.execute(sa.text("SELECT id, slug FROM specialties")).all())
    doctors = sa.table("doctor_profiles", sa.column("id"), sa.column("firstName"), sa.column("lastName"), sa.column("specialtyIds", sa.JSON()), sa.column("createdAt"), sa.column("slug"))
    links = sa.table("doctor_links", sa.column("id"), sa.column("name"), sa.column("doctorId"), sa.column("createdAt", sa.DateTime(timezone=True)))
    used = set()
    for doctor in connection.execute(sa.select(doctors).order_by(doctors.c.createdAt, doctors.c.id)).mappings().all():
        base = clean(doctor["firstName"]) + clean(doctor["lastName"])
        extra = sorted(specialties[item] for item in (doctor["specialtyIds"] or []) if item in specialties)
        for name in [base, *(f"{base}-{item}" for item in extra)]:
            if PATTERN.match(name) and name not in RESERVED and name not in used:
                used.add(name)
                connection.execute(links.insert().values(id=str(uuid4()), name=name, doctorId=doctor["id"], createdAt=datetime.now(timezone.utc)))
                connection.execute(doctors.update().where(doctors.c.id == doctor["id"]).values(slug=name))
                break


def downgrade():
    op.drop_index(op.f("ix_doctor_profiles_slug"), table_name="doctor_profiles")
    op.drop_column("doctor_profiles", "slug")
    op.drop_index(op.f("ix_doctor_links_doctorId"), table_name="doctor_links")
    op.drop_table("doctor_links")
