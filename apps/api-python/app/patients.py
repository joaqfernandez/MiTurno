"""Contrato de entrada: acá se ve qué puede cambiar un paciente."""

from datetime import date
import re

from pydantic import BaseModel, ConfigDict, Field, field_validator


class UpdatePatient(BaseModel):
    # Rechaza campos desconocidos y evita convertir números/objetos a strings.
    model_config = ConfigDict(extra="forbid", strict=True)

    firstName: str | None = Field(default=None, min_length=1)
    lastName: str | None = Field(default=None, min_length=1)
    documentId: str | None = None
    birthDate: str | None = None
    healthInsurance: str | None = None
    insuranceNumber: str | None = None

    @field_validator("*", mode="before")
    @classmethod
    def reject_explicit_null(cls, value):
        # Omitir un campo lo conserva; enviarlo como null es un error.
        if value is None:
            raise ValueError("No se admite null; omití el campo para conservarlo")
        return value

    @field_validator("birthDate")
    @classmethod
    def validate_birth_date(cls, value):
        if not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", value):
            raise ValueError("Usá YYYY-MM-DD")
        date.fromisoformat(value)  # También rechaza fechas imposibles, como 2025-02-30.
        return value


from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy import select
from .dependencies import session, patient_user, doctor_user, current_user
from .database import EDITABLE_FIELDS
from .models import Patient, User, Appointment
from .serializers import row
from .auth import user_payload

router = APIRouter(prefix="/api", tags=["Pacientes y usuarios"])


@router.get("/users/me")
def me(user=Depends(current_user), db=Depends(session)):
    return {**user_payload(db, user.user), "patientProfile": row(user.patient) if user.patient else None,
            "doctorProfile": row(user.doctor, ("icsFeedToken",)) if user.doctor else None}


@router.get("/patients/me")
def my_profile(user=Depends(patient_user)):
    return row(user.patient)


@router.patch("/patients/me")
def update_me(body: UpdatePatient, user=Depends(patient_user), db=Depends(session)):
    update_patient(user.patient, body.model_dump(exclude_unset=True))
    db.flush()
    return row(user.patient)


def update_patient(patient, changes):
    # Defensa en servicio, además del DTO: nunca propagar relaciones o roles.
    for field in EDITABLE_FIELDS:
        if field in changes:
            value = changes[field]
            if field == "birthDate":
                value = datetime.combine(date.fromisoformat(value), datetime.min.time(), timezone.utc)
            setattr(patient, field, value)


@router.get("/patients/of-my-practice")
def practice(user=Depends(doctor_user), db=Depends(session)):
    patients = db.scalars(select(Patient).where(Patient.id.in_(select(Appointment.patientId).where(Appointment.doctorId == user.doctor.id, Appointment.status.in_(["CONFIRMED", "COMPLETED", "NO_SHOW"])))).order_by(Patient.lastName).limit(500))
    result = []
    for patient in patients:
        appointments = list(db.scalars(select(Appointment).where(Appointment.patientId == patient.id, Appointment.doctorId == user.doctor.id).order_by(Appointment.startAt.desc())))
        result.append({**row(patient), "phone": db.get(User, patient.userId).phone, "visitCount": len(appointments),
                       "lastVisit": appointments[0].startAt if appointments else None,
                       "appointments": [row(item, ("notes",)) for item in appointments[:5]]})
    return result
