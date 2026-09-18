from decimal import Decimal
from sqlalchemy import inspect, select
from .models import Doctor, Patient, Payment, Specialty, Location


def row(entity, exclude=()):
    return {prop.key: float(value) if isinstance(value, Decimal) else value
            for prop in inspect(type(entity)).column_attrs
            if prop.key not in exclude
            for value in [getattr(entity, prop.key)]}


def doctor(db, entity):
    result = row(entity, ("icsFeedToken", "userId", "specialtyIds"))
    result["specialties"] = [row(item) for item in db.scalars(select(Specialty).where(Specialty.id.in_(entity.specialtyIds)))]
    result["locations"] = [row(item, ("doctorId",)) for item in db.scalars(select(Location).where(Location.doctorId == entity.id))]
    return result


def appointment(db, entity):
    result = row(entity, ("notes",))
    physician = db.get(Doctor, entity.doctorId)
    patient = db.get(Patient, entity.patientId)
    result["doctor"] = {key: value for key, value in doctor(db, physician).items() if key in ("id", "firstName", "lastName", "specialties")}
    result["patient"] = {key: getattr(patient, key) for key in ("id", "firstName", "lastName")}
    payment = db.scalar(select(Payment).where(Payment.appointmentId == entity.id))
    if payment:
        result["payment"] = {"id": payment.id, "status": payment.status, "amount": float(payment.amount)}
        if entity.status == "PENDING_PAYMENT":
            result["checkoutUrl"] = payment.checkoutUrl
    return result
