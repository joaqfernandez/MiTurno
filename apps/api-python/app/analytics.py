"""Números del negocio para el administrador. Solo totales y datos de profesionales: nunca filas de pacientes."""
from collections import Counter
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from .dependencies import admin_user, session
from .models import Appointment, Doctor, Job, Notification, Patient, Specialty, User, now

router = APIRouter(prefix="/api/admin", tags=["Administración"])
# Las semanas y las edades se cuentan con el calendario de Argentina.
ZONE = ZoneInfo("America/Argentina/Buenos_Aires")
WEEKS = 12
AGE_GROUPS = ((0, 17), (18, 29), (30, 44), (45, 59), (60, 74), (75, 200))
NO_DATA = "Sin dato"


def age_group(birth, today):
    if birth is None:
        return NO_DATA
    # La fecha de nacimiento es un día de calendario guardado a medianoche UTC: no se pasa a hora local (correría un día).
    born = birth.astimezone(timezone.utc).date() if birth.tzinfo else birth.date()
    age = today.year - born.year - ((today.month, today.day) < (born.month, born.day))
    for low, high in AGE_GROUPS:
        if low <= age <= high:
            return f"{low} a {high}" if high < 200 else f"{low} o más"
    return NO_DATA


def week_start(moment):
    local = moment.astimezone(ZONE).date()
    return local - timedelta(days=local.weekday())


def counted(counter, order=None):
    keys = order if order is not None else [key for key, _ in sorted(counter.items(), key=lambda item: (-item[1], item[0]))]
    return [{"label": key, "count": counter.get(key, 0)} for key in keys]


@router.get("/analytics")
def analytics(user=Depends(admin_user), db=Depends(session)):
    today = now().astimezone(ZONE).date()
    first_week = week_start(now()) - timedelta(weeks=WEEKS - 1)
    since = datetime.combine(first_week, time.min, ZONE)
    weeks = [first_week + timedelta(weeks=index) for index in range(WEEKS)]
    specialties = {item.id: item.name for item in db.scalars(select(Specialty))}

    doctors = list(db.execute(select(Doctor, User).join(User, User.id == Doctor.userId).order_by(Doctor.createdAt).limit(5000)))
    by_doctor = dict(db.execute(select(Appointment.doctorId, func.count()).group_by(Appointment.doctorId)).all())
    recent_by_doctor = dict(db.execute(select(Appointment.doctorId, func.count()).where(
        Appointment.startAt >= now() - timedelta(days=30), Appointment.startAt <= now()).group_by(Appointment.doctorId)).all())
    doctor_specialties = {doctor.id: [specialties[item] for item in doctor.specialtyIds or [] if item in specialties] for doctor, _ in doctors}
    doctors_by_specialty = Counter(name for doctor, account in doctors if account.status == "ACTIVE"
                                   for name in doctor_specialties[doctor.id] or ["Sin especialidad"])

    ages = Counter(age_group(birth, today) for birth in db.scalars(select(Patient.birthDate)))
    # Texto libre que carga el paciente: se agrupa sin distinguir mayúsculas ni espacios.
    insurance = Counter(" ".join(value.split()).title() if value and value.strip() else NO_DATA
                        for value in db.scalars(select(Patient.healthInsurance)))
    top_insurance = insurance.most_common(10)
    others = sum(insurance.values()) - sum(count for _, count in top_insurance)

    by_status = dict(db.execute(select(Appointment.status, func.count()).group_by(Appointment.status)).all())
    weekly, demand = Counter(), Counter()
    for start, status, doctor_id in db.execute(select(Appointment.startAt, Appointment.status, Appointment.doctorId).where(Appointment.startAt >= since)):
        if week_start(start) in weeks:
            weekly[(week_start(start), "cancelled" if status.startswith("CANCELLED") else "booked")] += 1
        if not status.startswith("CANCELLED"):
            for name in doctor_specialties.get(doctor_id) or ["Sin especialidad"]:
                demand[name] += 1
    signups = Counter()
    for kind, model in (("patients", Patient), ("doctors", Doctor)):
        for created in db.scalars(select(model.createdAt).where(model.createdAt >= since)):
            signups[(week_start(created), kind)] += 1

    return {
        "generatedAt": now(),
        "totals": {
            "patients": db.scalar(select(func.count()).select_from(Patient)),
            "doctorsActive": sum(account.status == "ACTIVE" for _, account in doctors),
            "doctorsPending": sum(account.status == "PENDING_VERIFICATION" for _, account in doctors),
            "doctorsSuspended": sum(account.status == "SUSPENDED" for _, account in doctors),
            "appointments": sum(by_status.values()),
            "appointmentsUpcoming": db.scalar(select(func.count()).select_from(Appointment).where(
                Appointment.status.in_(("CONFIRMED", "PENDING_PAYMENT")), Appointment.startAt > now())),
            "notificationsFailed": db.scalar(select(func.count()).select_from(Notification).where(Notification.status == "FAILED")),
            "jobsFailed": db.scalar(select(func.count()).select_from(Job).where(Job.status == "FAILED")),
        },
        "doctorsBySpecialty": counted(doctors_by_specialty),
        "appointmentsBySpecialty": counted(demand),
        "patientsByAge": counted(ages, [*(f"{low} a {high}" if high < 200 else f"{low} o más" for low, high in AGE_GROUPS), NO_DATA]),
        "patientsByInsurance": [*({"label": label, "count": count} for label, count in top_insurance),
                                *([{"label": "Otras", "count": others}] if others else [])],
        "appointmentsByStatus": counted(Counter(by_status)),
        "weekly": [{"week": week, "booked": weekly[(week, "booked")], "cancelled": weekly[(week, "cancelled")],
                    "patients": signups[(week, "patients")], "doctors": signups[(week, "doctors")]} for week in weeks],
        # Profesionales: datos que el administrador ya ve al aprobarlos, más su actividad.
        "doctors": [{"firstName": doctor.firstName, "lastName": doctor.lastName, "email": account.email,
                     "licenseNumber": doctor.licenseNumber, "status": account.status,
                     "specialties": doctor_specialties[doctor.id], "createdAt": doctor.createdAt,
                     "appointments": by_doctor.get(doctor.id, 0), "appointmentsLast30Days": recent_by_doctor.get(doctor.id, 0)}
                    for doctor, account in doctors],
    }
