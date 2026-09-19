from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import AwareDatetime
from sqlalchemy import select, or_
from .dependencies import session, current_user, patient_user, doctor_user
from .models import Appointment, Doctor, User, Payment, now
from .schemas import Book, Cancel, AppointmentState
from .availability import slots, validate_range, ACTIVE
from .serializers import appointment as serialize
from .outbox import appointment_effects, enqueue

router = APIRouter(prefix="/api/appointments", tags=["Turnos"])


@router.get("/availability/{doctor_id}")
def availability(doctor_id: str, start: AwareDatetime = Query(alias="from"), end: AwareDatetime = Query(alias="to"), db=Depends(session)):
    doctor = db.scalar(select(Doctor).join(User).where(Doctor.id == doctor_id, User.status == "ACTIVE"))
    if not doctor:
        raise HTTPException(404, "Médico no encontrado")
    return slots(db, doctor, start, end)


@router.post("", status_code=201)
def book(body: Book, request: Request, user=Depends(patient_user), db=Depends(session)):
    # Serializa las reservas y cambios de horario del mismo médico en PostgreSQL.
    doctor = db.scalar(select(Doctor).where(Doctor.id == body.doctorId).with_for_update())
    if not doctor or db.get(User, doctor.userId).status != "ACTIVE":
        raise HTTPException(404, "Médico no encontrado")
    offered = slots(db, doctor, body.startAt, body.startAt + timedelta(hours=4))
    chosen = next((item for item in offered if item["startAt"] == body.startAt), None)
    if not chosen:
        raise HTTPException(409, "El horario no está disponible")
    if doctor.requiresDeposit and not request.app.state.payment_provider.configured:
        raise HTTPException(503, "El cobro de señas todavía no está configurado")
    item = Appointment(patientId=user.patient.id, doctorId=doctor.id, **chosen, reason=body.reason,
                       status="PENDING_PAYMENT" if doctor.requiresDeposit else "CONFIRMED")
    db.add(item)
    db.flush()
    if doctor.requiresDeposit:
        payment = Payment(appointmentId=item.id, amount=doctor.depositAmount, currency=doctor.depositCurrency)
        db.add(payment)
        db.flush()
        # Si el proveedor falla, la transacción revierte también la reserva.
        pref = request.app.state.payment_provider.checkout(payment.id, float(payment.amount), payment.currency, user.user.email)
        payment.preferenceId, payment.checkoutUrl = pref["id"], pref["url"]
    else:
        appointment_effects(db, item)
    db.flush()
    return serialize(db, item)


@router.get("/me")
def agenda(start: AwareDatetime | None = Query(default=None, alias="from"), end: AwareDatetime | None = Query(default=None, alias="to"), user=Depends(current_user), db=Depends(session)):
    start = start or now() - timedelta(days=30)
    end = end or start + timedelta(days=90)
    validate_range(start, end)
    owners = []
    if user.patient:
        owners.append(Appointment.patientId == user.patient.id)
    if user.doctor:
        owners.append(Appointment.doctorId == user.doctor.id)
    if not owners:
        return []
    query = select(Appointment).where(or_(*owners), Appointment.startAt >= start, Appointment.startAt <= end).order_by(Appointment.startAt)
    return [serialize(db, item) for item in db.scalars(query)]


@router.delete("/{appointment_id}")
def cancel(appointment_id: str, body: Cancel | None = None, user=Depends(current_user), db=Depends(session)):
    item = db.scalar(select(Appointment).where(Appointment.id == appointment_id).with_for_update())
    if not item:
        raise HTTPException(404, "Turno no encontrado")
    is_doctor = user.doctor and item.doctorId == user.doctor.id
    if not is_doctor and (not user.patient or item.patientId != user.patient.id):
        raise HTTPException(403, "Turno ajeno")
    if item.status not in ACTIVE:
        if item.status.startswith("CANCELLED"):
            return serialize(db, item)  # Reintento seguro.
        raise HTTPException(409, "El turno ya finalizó")
    doctor = db.get(Doctor, item.doctorId)
    refundable = is_doctor or item.startAt - now() >= timedelta(hours=doctor.cancellationWindowHours)
    item.status = "CANCELLED_BY_DOCTOR" if is_doctor else "CANCELLED_BY_PATIENT"
    item.cancelledAt, item.cancellationReason = now(), body.reason if body else None
    payment = db.scalar(select(Payment).where(Payment.appointmentId == item.id).with_for_update())
    if payment:
        if payment.status == "APPROVED" and refundable:
            payment.status = "REFUND_PENDING"
            enqueue(db, "refund", payment.id, f"refund:{payment.id}")
        elif payment.status in ("PENDING", "REJECTED"):
            payment.status = "EXPIRED"
    appointment_effects(db, item, cancelled=True)
    db.flush()
    return serialize(db, item)


@router.patch("/{appointment_id}/status")
def complete(appointment_id: str, body: AppointmentState, user=Depends(doctor_user), db=Depends(session)):
    item = db.scalar(select(Appointment).where(Appointment.id == appointment_id, Appointment.doctorId == user.doctor.id).with_for_update())
    if not item:
        raise HTTPException(404, "Turno no encontrado")
    if item.status != "CONFIRMED" or item.startAt > now():
        raise HTTPException(409, "El turno todavía no se puede finalizar")
    item.status = body.status
    db.flush()
    return serialize(db, item)


def expire_holds(db):
    expired = list(db.scalars(select(Appointment).where(Appointment.status == "PENDING_PAYMENT", Appointment.createdAt < now() - timedelta(minutes=30)).with_for_update(skip_locked=True)))
    for item in expired:
        item.status, item.cancelledAt, item.cancellationReason = "CANCELLED_BY_PATIENT", now(), "Seña no abonada"
        payment = db.scalar(select(Payment).where(Payment.appointmentId == item.id).with_for_update())
        if payment:
            payment.status = "EXPIRED"
        appointment_effects(db, item, cancelled=True)
    return len(expired)
