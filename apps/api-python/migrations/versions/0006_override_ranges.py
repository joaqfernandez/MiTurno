"""Excepciones de agenda por rango de fechas (vacaciones) en lugar de un solo día."""
from datetime import timedelta
from uuid import uuid4
from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = depends_on = None


def upgrade():
    op.add_column("schedule_overrides", sa.Column("endDate", sa.Date(), nullable=True))
    op.execute(sa.text('UPDATE schedule_overrides SET "endDate" = "date"'))
    with op.batch_alter_table("schedule_overrides") as batch:
        batch.alter_column("endDate", existing_type=sa.Date(), nullable=False)
        batch.create_check_constraint("ck_schedule_overrides_date_range", '"endDate" >= "date"')


def downgrade():
    # Un rango se divide en una excepción por día: volver atrás no puede liberar días bloqueados.
    connection = op.get_bind()
    table = sa.table("schedule_overrides", sa.column("date", sa.Date()), sa.column("endDate", sa.Date()),
                     *(sa.column(name) for name in ("id", "doctorId", "type", "startTime", "endTime", "reason", "createdAt")))
    for item in connection.execute(sa.select(table).where(table.c.endDate > table.c.date)).mappings().all():
        day = item["date"] + timedelta(days=1)
        while day <= item["endDate"]:
            connection.execute(table.insert().values({**item, "id": str(uuid4()), "date": day, "endDate": day}))
            day += timedelta(days=1)
    with op.batch_alter_table("schedule_overrides") as batch:
        batch.drop_constraint("ck_schedule_overrides_date_range", type_="check")
        batch.drop_column("endDate")
