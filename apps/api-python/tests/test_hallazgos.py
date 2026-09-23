"""Criterios de aceptación de docs/AUDITORIA.md que no tenían prueba propia. Ver docs/COBERTURA_HALLAZGOS.md."""
from datetime import datetime, timedelta, timezone
import pytest
from fastapi import HTTPException
from sqlalchemy import select, func
from app.appointments import expire_holds
from app.models import User, Doctor, Payment, Appointment, Notification
from app.payments import apply_payment
from conftest import future_slots, reserve, PASSWORD


def first_slot(system):
    return datetime.fromisoformat(future_slots(system)[0]["startAt"].replace("Z", "+00:00"))


def with_deposit(system, amount=100):
    with system.database.transaction() as db:
        doctor = db.get(Doctor, "doctor")
        doctor.requiresDeposit, doctor.depositAmount = True, amount


# A01/A03: el registro no acepta campos que otorguen privilegios.
@pytest.mark.parametrize("extra", [{"roles": ["ADMIN"]}, {"role": "ADMIN"}, {"status": "ACTIVE", "role": "DOCTOR", "licenseNumber": "L"},
                                   {"userId": "user-admin"}, {"id": "chosen-id"}])
def test_registration_rejects_privileged_fields(system, extra):
    body = {"email": "nuevo@example.com", "password": PASSWORD, "firstName": "N", "lastName": "P", "role": "PATIENT", **extra}
    assert system.client.post("/api/auth/register", json=body).status_code == 400
    with system.database.transaction() as db:
        assert db.scalar(select(User.id).where(User.email == "nuevo@example.com")) is None


# A04: la reserva por API rechaza solapamientos con distinto inicio y horarios fuera de la grilla.
def test_booking_rejects_overlap_offgrid_and_past(system):
    start = first_slot(system)
    assert reserve(system, start=start.isoformat()).status_code == 201
    for candidate in (start + timedelta(minutes=10), start - timedelta(days=10)):
        assert reserve(system, "other", candidate.isoformat()).status_code == 409
    with system.database.transaction() as db:
        assert db.scalar(select(func.count()).select_from(Appointment)) == 1


# A05: rangos de disponibilidad acotados y con zona horaria.
@pytest.mark.parametrize("delta_from,delta_to", [(0, -1), (0, 94)])
def test_availability_rejects_invalid_ranges(system, delta_from, delta_to):
    start = first_slot(system)
    params = {"from": (start + timedelta(days=delta_from)).isoformat(), "to": (start + timedelta(days=delta_to)).isoformat()}
    assert system.client.get("/api/appointments/availability/doctor", params=params).status_code == 400


def test_availability_rejects_naive_datetimes(system):
    params = {"from": "2030-01-07T09:00:00", "to": "2030-01-08T09:00:00"}
    assert system.client.get("/api/appointments/availability/doctor", params=params).status_code == 400


# A05/D07: la agenda y sus excepciones solo aceptan valores válidos.
@pytest.mark.parametrize("block", [{"weekday": 9, "startTime": "09:00", "endTime": "11:00"},
                                   {"weekday": 1, "startTime": "25:00", "endTime": "26:00"},
                                   {"weekday": 1, "startTime": "11:00", "endTime": "09:00"},
                                   {"weekday": 1, "startTime": "09:00", "endTime": "09:00"}])
def test_schedule_rejects_invalid_blocks(system, block):
    headers = system.headers("doctor")
    before = system.client.get("/api/doctors/me/schedule", headers=headers).json()
    assert system.client.put("/api/doctors/me/schedule", json={"blocks": [block]}, headers=headers).status_code == 400
    assert system.client.get("/api/doctors/me/schedule", headers=headers).json() == before


@pytest.mark.parametrize("body", [{"depositAmount": -5, "requiresDeposit": True}, {"defaultSlotMinutes": 100000}])
def test_settings_reject_out_of_range_values(system, body):
    assert system.client.patch("/api/doctors/me/settings", json=body, headers=system.headers("doctor")).status_code == 400


@pytest.mark.parametrize("body", [{"type": "EXTRA", "date": "2030-01-01", "startTime": "10:00", "endTime": "09:00"},
                                  {"type": "BLOCKED", "date": "2030-02-31"}])
def test_overrides_reject_invalid_values(system, body):
    assert system.client.post("/api/doctors/me/overrides", json=body, headers=system.headers("doctor")).status_code == 400


# A07: un pago con otra moneda no confirma el turno.
def test_payment_with_wrong_currency_changes_nothing(system):
    with_deposit(system)
    item = reserve(system).json()
    with system.database.transaction() as db:
        payment_id = db.scalar(select(Payment.id).where(Payment.appointmentId == item["id"]))
    with pytest.raises(HTTPException) as error:
        with system.database.transaction() as db:
            apply_payment(db, {"id": 9, "external_reference": payment_id, "transaction_amount": 100, "currency_id": "USD", "status": "approved"})
    assert error.value.status_code == 409
    with system.database.transaction() as db:
        assert db.get(Appointment, item["id"]).status == "PENDING_PAYMENT"
        assert db.get(Payment, payment_id).status == "PENDING"


# A07: la expiración cierra también el pago, no solo el turno.
def test_expiration_marks_payment_expired(system):
    with_deposit(system)
    item = reserve(system).json()
    with system.database.transaction() as db:
        db.get(Appointment, item["id"]).createdAt = datetime.now(timezone.utc) - timedelta(minutes=31)
        db.flush()
        assert expire_holds(db) == 1
    with system.database.transaction() as db:
        assert db.get(Appointment, item["id"]).status == "CANCELLED_BY_PATIENT"
        assert db.scalar(select(Payment.status).where(Payment.appointmentId == item["id"])) == "EXPIRED"


# A09: la cancelación avisa a paciente y médico.
def test_cancellation_notifies_patient_and_doctor(system):
    item = reserve(system).json()
    with system.database.transaction() as db:
        before = {n.id for n in db.scalars(select(Notification))}
    assert system.client.delete(f"/api/appointments/{item['id']}", headers=system.headers()).status_code == 200
    with system.database.transaction() as db:
        created = [n for n in db.scalars(select(Notification)) if n.id not in before]
    assert {n.userId for n in created} == {"user-own", "user-doctor"}
