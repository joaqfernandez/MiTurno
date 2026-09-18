from datetime import datetime, timedelta, timezone
import pytest
from sqlalchemy import select, func, update
from sqlalchemy.exc import IntegrityError
from app.models import User, Patient, Doctor, Schedule, ScheduleOverride, Appointment, MedicalEntry, MedicalRecord, AuditLog, Job, Payment
from app.appointments import expire_holds
from app.payments import apply_payment
from app.worker import run_one
from conftest import future_slots, reserve, PASSWORD


def test_registration_login_refresh_logout(system):
    payload = {"email": "new@example.com", "password": PASSWORD, "firstName": "Nuevo", "lastName": "Paciente", "role": "PATIENT", "phone": "+5492611234567"}
    response = system.client.post("/api/auth/register", json=payload)
    assert response.status_code == 201, response.text
    auth = response.json()
    assert auth["user"]["roles"] == ["PATIENT"]
    assert system.client.post("/api/auth/login", json={"email": payload["email"], "password": PASSWORD}).status_code == 200
    refreshed = system.client.post("/api/auth/refresh", json={"refreshToken": auth["refreshToken"]})
    assert refreshed.status_code == 200
    assert refreshed.json()["refreshToken"] != auth["refreshToken"]
    assert system.client.post("/api/auth/refresh", json={"refreshToken": auth["refreshToken"]}).status_code == 401
    assert system.client.post("/api/auth/logout", json={"refreshToken": refreshed.json()["refreshToken"]}, headers={"Authorization": "Bearer " + refreshed.json()["accessToken"]}).status_code == 200
    assert system.client.post("/api/auth/refresh", json={"refreshToken": refreshed.json()["refreshToken"]}).status_code == 401


def test_doctor_requires_verification(system):
    payload = {"email": "newdoctor@example.com", "password": PASSWORD, "firstName": "Nuevo", "lastName": "Médico", "role": "DOCTOR", "licenseNumber": "ABC"}
    response = system.client.post("/api/auth/register", json=payload)
    assert response.status_code == 201
    assert response.json()["accessToken"] is None
    uid = response.json()["user"]["id"]
    assert system.client.post("/api/auth/login", json={"email": payload["email"], "password": PASSWORD}).status_code == 403
    assert system.client.patch(f"/api/admin/users/{uid}/status", json={"status": "ACTIVE"}, headers=system.headers()).status_code == 403
    assert system.client.patch(f"/api/admin/users/{uid}/status", json={"status": "ACTIVE"}, headers=system.headers("admin")).status_code == 200
    assert system.client.post("/api/auth/login", json={"email": payload["email"], "password": PASSWORD}).status_code == 200


def test_doctor_configuration_and_public_contracts(system):
    client, headers = system.client, system.headers("doctor")
    assert client.get("/api/specialties").json()[0]["slug"] == "clinica"
    assert client.get("/api/doctors/doctor").status_code == 200
    assert client.patch("/api/doctors/me/settings", json={"defaultSlotMinutes": 20, "specialtyIds": ["specialty"]}, headers=headers).status_code == 200
    assert client.get("/api/doctors/me/settings", headers=headers).json()["defaultSlotMinutes"] == 20
    assert client.put("/api/doctors/me/locations", json={"locations": [{"name": "Consultorio", "address": "Ficticia 123", "weekdays": [1, 3]}]}, headers=headers).status_code == 200
    assert client.get("/api/doctors/doctor").json()["locations"][0]["address"] == "Ficticia 123"
    assert client.put("/api/doctors/me/photo", json={"photoUrl": "https://example.com/photo.png"}, headers=headers).status_code == 200
    assert client.get("/api/doctors/me/photo", headers=headers).json()["photoUrl"].startswith("https://")
    blocks = [{"weekday": 1, "startTime": "10:00", "endTime": "12:00"}]
    assert client.put("/api/doctors/me/schedule", json={"blocks": blocks}, headers=headers).status_code == 200
    assert len(client.get("/api/doctors/me/schedule", headers=headers).json()) == 1


@pytest.mark.parametrize("body", [{"defaultSlotMinutes": 0}, {"defaultSlotMinutes": -30}, {"requiresDeposit": True}, {"timezone": "Unknown/Zone"}, {"specialtyIds": ["unknown"]}, {"userId": "other"}])
def test_invalid_settings(system, body):
    assert system.client.patch("/api/doctors/me/settings", json=body, headers=system.headers("doctor")).status_code == 400


def test_schedule_validation(system):
    blocks = [{"weekday": 1, "startTime": "09:00", "endTime": "11:00"}, {"weekday": 1, "startTime": "10:00", "endTime": "12:00"}]
    assert system.client.put("/api/doctors/me/schedule", json={"blocks": blocks}, headers=system.headers("doctor")).status_code == 400
    assert system.client.put("/api/doctors/me/schedule", json={"blocks": [{**blocks[0], "slotMinutes": 0}]}, headers=system.headers("doctor")).status_code == 400


def test_legacy_schedule_route_preserves_ownership_and_validation(system):
    body = {"schedules": [{"weekday": 1, "startTime": "09:00", "endTime": "11:00"}]}
    assert system.client.put("/api/doctors/other/schedule", json=body, headers=system.headers("doctor")).status_code == 403
    assert system.client.put("/api/doctors/doctor/schedule", json=body, headers=system.headers()).status_code == 403
    assert system.client.put("/api/doctors/doctor/schedule", json=body, headers=system.headers("doctor")).status_code == 200
    assert system.client.get("/api/doctors/me/schedule", headers=system.headers("doctor")).json()[0]["endTime"] == "11:00"


def test_booking_cancellation_and_rebooking(system):
    start = future_slots(system)[0]["startAt"]
    booked = reserve(system, start=start)
    assert booked.status_code == 201, booked.text
    assert booked.json()["status"] == "CONFIRMED"
    assert reserve(system, "other", start).status_code == 409
    item_id = booked.json()["id"]
    assert system.client.delete(f"/api/appointments/{item_id}", headers=system.headers("other")).status_code == 403
    assert system.client.delete(f"/api/appointments/{item_id}", headers=system.headers()).status_code == 200
    assert reserve(system, "other", start).status_code == 201
    assert len(system.client.get("/api/appointments/me", headers=system.headers()).json()) == 1
    with system.database.transaction() as db:
        assert db.scalar(select(func.count()).select_from(Job)) == 9


def test_slot_duration_range_and_overrides(system):
    start = datetime.fromisoformat(future_slots(system)[0]["startAt"].replace("Z", "+00:00"))
    with system.database.transaction() as db:
        for schedule in db.scalars(select(Schedule)):
            schedule.slotMinutes = 15
    response = reserve(system, start=start.isoformat())
    assert response.status_code == 201
    assert datetime.fromisoformat(response.json()["endAt"].replace("Z", "+00:00")) - start == timedelta(minutes=15)
    # Bloqueo DATE del mismo día consultado desde un instante posterior a medianoche.
    local_date = (start - timedelta(hours=3)).date().isoformat()
    assert system.client.post("/api/doctors/me/overrides", json={"type": "BLOCKED", "date": local_date}, headers=system.headers("doctor")).status_code == 201
    response = system.client.get("/api/appointments/availability/doctor", params={"from": start.isoformat(), "to": (start + timedelta(hours=4)).isoformat()})
    assert response.json() == []


def test_extra_and_schedule_validity(system):
    offered = future_slots(system)
    start = datetime.fromisoformat(offered[0]["startAt"].replace("Z", "+00:00"))
    local_date = (start - timedelta(hours=3)).date()
    with system.database.transaction() as db:
        for schedule in db.scalars(select(Schedule)):
            schedule.validFrom = local_date + timedelta(days=30)
    assert system.client.post("/api/doctors/me/overrides", json={"type": "EXTRA", "date": local_date.isoformat(), "startTime": "09:00", "endTime": "10:00"}, headers=system.headers("doctor")).status_code == 201
    response = system.client.get("/api/appointments/availability/doctor", params={"from": (start + timedelta(minutes=30)).isoformat(), "to": (start + timedelta(hours=4)).isoformat()})
    assert len(response.json()) == 1
    assert datetime.fromisoformat(response.json()[0]["startAt"].replace("Z", "+00:00")) == start + timedelta(minutes=30)


def test_database_rejects_overlaps_even_when_service_is_bypassed(system):
    booked = reserve(system).json()
    with pytest.raises(IntegrityError):
        with system.database.transaction() as db:
            start = datetime.fromisoformat(booked["startAt"].replace("Z", "+00:00")) + timedelta(minutes=10)
            db.add(Appointment(patientId="patient-other", doctorId="doctor", startAt=start, endAt=start + timedelta(minutes=20), status="CONFIRMED"))


def test_medical_history_is_atomic_and_immutable(system, monkeypatch):
    appointment = reserve(system).json()
    assert system.client.get("/api/medical-records/patient-own", headers=system.headers("other")).status_code == 403
    assert system.client.get("/api/medical-records/patient-own", headers=system.headers("doctor")).json()["entries"] == []
    body = {"patientId": "patient-own", "title": "Evolución", "content": "Contenido ficticio", "appointmentId": appointment["id"]}
    response = system.client.post("/api/medical-records/entries", json=body, headers=system.headers("doctor"))
    assert response.status_code == 201, response.text
    entry_id = response.json()["id"]
    assert system.client.post("/api/medical-records/entries", json={**body, "amendsEntryId": entry_id}, headers=system.headers("doctor")).status_code == 201
    with pytest.raises(IntegrityError):
        with system.database.transaction() as db:
            db.execute(update(MedicalEntry).where(MedicalEntry.id == entry_id).values(content="Changed"))
    from app import medical_records
    def broken_audit(*args):
        raise RuntimeError("Audit unavailable")
    monkeypatch.setattr(medical_records, "audit", broken_audit)
    with pytest.raises(RuntimeError):
        system.client.post("/api/medical-records/entries", json=body, headers=system.headers("doctor"))
    with system.database.transaction() as db:
        assert db.scalar(select(func.count()).select_from(MedicalEntry)) == 2


def test_cross_patient_amendment_rejected(system):
    reserve(system)
    reserve(system, "other")
    entry = system.client.post("/api/medical-records/entries", headers=system.headers("doctor"), json={"patientId": "patient-own", "title": "A", "content": "B"}).json()
    assert system.client.post("/api/medical-records/entries", headers=system.headers("doctor"), json={"patientId": "patient-other", "title": "A", "content": "B", "amendsEntryId": entry["id"]}).status_code == 400


def test_payment_approval_idempotency_late_payment_and_refund(system):
    with system.database.transaction() as db:
        doctor = db.get(Doctor, "doctor")
        doctor.requiresDeposit, doctor.depositAmount = True, 1500
    response = reserve(system)
    assert response.status_code == 201
    item_id = response.json()["id"]
    with system.database.transaction() as db:
        payment = db.scalar(select(Payment).where(Payment.appointmentId == item_id))
        payment_id = payment.id
        details = {"id": 123, "external_reference": payment.id, "transaction_amount": 1500, "currency_id": "ARS", "status": "approved"}
        apply_payment(db, details)
        apply_payment(db, details)
    with system.database.transaction() as db:
        assert db.get(Appointment, item_id).status == "CONFIRMED"
        assert db.scalar(select(func.count()).select_from(Job)) == 3
    system.client.delete(f"/api/appointments/{item_id}", headers=system.headers("doctor"))
    with system.database.transaction() as db:
        apply_payment(db, details)
        assert db.get(Appointment, item_id).status == "CANCELLED_BY_DOCTOR"
        assert db.get(Payment, payment_id).status == "REFUND_PENDING"
    from app.payments import refund_job
    with system.database.transaction() as db:
        refund_job(db, payment_id, system.provider)
        refund_job(db, payment_id, system.provider)
    assert system.provider.refunds == [("123", payment_id)]


def test_expiration_releases_slot_and_late_payment_refunds(system):
    with system.database.transaction() as db:
        doctor = db.get(Doctor, "doctor")
        doctor.requiresDeposit, doctor.depositAmount = True, 100
    start = future_slots(system)[0]["startAt"]
    appointment = reserve(system, start=start).json()
    with system.database.transaction() as db:
        item = db.get(Appointment, appointment["id"])
        item.createdAt = datetime.now(timezone.utc) - timedelta(minutes=31)
        db.flush()
        assert expire_holds(db) == 1
        payment = db.scalar(select(Payment).where(Payment.appointmentId == item.id))
        payment_id = payment.id
    assert reserve(system, "other", start).status_code == 201
    with system.database.transaction() as db:
        apply_payment(db, {"id": 234, "external_reference": payment_id, "transaction_amount": 100, "currency_id": "ARS", "status": "approved"})
        assert db.get(Payment, payment_id).status == "REFUND_PENDING"
        assert db.get(Appointment, appointment["id"]).status == "CANCELLED_BY_PATIENT"


def test_checkout_failure_does_not_hold_slot(system):
    with system.database.transaction() as db:
        doctor = db.get(Doctor, "doctor")
        doctor.requiresDeposit, doctor.depositAmount = True, 100
    system.provider.fail_checkout = True
    assert reserve(system).status_code == 502
    with system.database.transaction() as db:
        assert db.scalar(select(func.count()).select_from(Appointment)) == 0


def test_feed_rotation_and_patient_ics(system):
    appointment = reserve(system).json()
    assert system.client.get("/api/calendar/feed/test-feed-token.ics").status_code == 200
    assert system.client.get(f"/api/calendar/appointments/{appointment['id']}.ics", headers=system.headers("other")).status_code == 404
    assert "BEGIN:VCALENDAR" in system.client.get(f"/api/calendar/appointments/{appointment['id']}.ics", headers=system.headers()).text
    rotated = system.client.post("/api/calendar/feed/rotate", headers=system.headers("doctor"))
    assert rotated.status_code == 200
    assert system.client.get("/api/calendar/feed/test-feed-token.ics").status_code == 404


def test_notification_failure_is_not_sent_and_job_retries(system):
    reserve(system)
    assert run_one(system.database, system.settings, system.provider, system.client.app.state.calendar_provider)
    from app.models import Notification
    with system.database.transaction() as db:
        job = db.scalar(select(Job).where(Job.kind == "notification").order_by(Job.createdAt))
        assert job.attempts == 1 and job.status == "PENDING"
        assert db.get(Notification, job.entityId).status == "FAILED"
