"""Efectos durables escritos en la misma transacción que el cambio de dominio."""
from sqlalchemy import select
from sqlalchemy.orm import Session
from .models import Appointment, Job, Notification, Patient, Doctor


def enqueue(db, kind, entity_id, key):
    if db.scalar(select(Job.id).where(Job.dedupeKey == key)):
        return
    db.add(Job(kind=kind, entityId=entity_id, dedupeKey=key))


def notify(db, user_id, template, appointment_id):
    key = f"{template}:{appointment_id}:{user_id}"
    if db.scalar(select(Notification.id).where(Notification.dedupeKey == key)):
        return
    item = Notification(userId=user_id, template=template, payload={"appointmentId": appointment_id}, dedupeKey=key)
    db.add(item)
    db.flush()
    enqueue(db, "notification", item.id, f"notification:{item.id}")


def appointment_effects(db: Session, appointment: Appointment, cancelled: bool = False) -> None:
    patient = db.get(Patient, appointment.patientId)
    doctor = db.get(Doctor, appointment.doctorId)
    if patient is None or doctor is None:
        raise ValueError("El turno debe tener un paciente y un médico existentes")
    template = "appointment_cancelled" if cancelled else "appointment_confirmed"
    notify(db, patient.userId, template, appointment.id)
    notify(db, doctor.userId, template, appointment.id)
    enqueue(db, "calendar", appointment.id, f"calendar:{appointment.id}:{appointment.status}")
