"""Cola transaccional PostgreSQL: reclamar con SKIP LOCKED y reintentar con backoff."""
import argparse
from datetime import timedelta
import logging
import time
from sqlalchemy import select, or_
from .appointments import expire_holds
from .calendar import GoogleCalendar
from .config import Settings
from .database import Database
from .models import Job, Appointment, Patient, Notification, now
from .notifications import send
from .outbox import notify
from .payments import MercadoPago, refund_job

logger = logging.getLogger("miturno.worker")


def scheduled(db):
    expire_holds(db)
    items = db.scalars(select(Appointment).where(Appointment.status == "CONFIRMED", Appointment.startAt >= now() + timedelta(hours=24), Appointment.startAt < now() + timedelta(hours=25)).with_for_update(skip_locked=True))
    for item in items:
        notify(db, db.get(Patient, item.patientId).userId, "reminder_24h", item.id)


def run_one(database, settings, payments, calendar, transport=None):
    with database.transaction() as db:
        job = db.scalar(select(Job).where(or_(
            (Job.status == "PENDING") & (Job.availableAt <= now()),
            (Job.status == "RUNNING") & (Job.lockedAt < now() - timedelta(minutes=10)),
        )).order_by(Job.createdAt).with_for_update(skip_locked=True).limit(1))
        if not job:
            return False
        job.status, job.lockedAt = "RUNNING", now()
        job.attempts += 1
        job_id = job.id
    try:
        with database.transaction() as db:
            job = db.scalar(select(Job).where(Job.id == job_id).with_for_update())
            if job.kind == "notification":
                send(db, job.entityId, settings, transport)
            elif job.kind == "refund":
                refund_job(db, job.entityId, payments)
            elif job.kind == "calendar":
                calendar.sync(db, job.entityId)
            else:
                raise ValueError("Tipo de trabajo desconocido")
            job.status, job.error = "DONE", None
    except Exception as error:
        # No registrar payloads clínicos, tokens ni respuestas completas de proveedores.
        with database.transaction() as db:
            job = db.get(Job, job_id)
            job.error = type(error).__name__
            job.status = "FAILED" if job.attempts >= 8 else "PENDING"
            job.availableAt = now() + timedelta(seconds=min(3600, 5 * 2**job.attempts))
            if job.kind == "notification":
                item = db.get(Notification, job.entityId)
                item.status, item.error = "FAILED", job.error
        logger.warning("job_failed id=%s type=%s", job_id, type(error).__name__)
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    settings = Settings.load()
    database, payments, calendar = Database(settings.database_url), MercadoPago(settings), GoogleCalendar(settings)
    while True:
        with database.transaction() as db:
            scheduled(db)
        processed = run_one(database, settings, payments, calendar)
        if args.once:
            break
        if not processed:
            time.sleep(5)


if __name__ == "__main__":
    main()
