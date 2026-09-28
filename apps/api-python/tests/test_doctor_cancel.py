"""El médico cancela un turno desde su agenda y el paciente recibe un aviso claro: médico, hora local y motivo."""
from datetime import datetime
from zoneinfo import ZoneInfo
from sqlalchemy import select
from app.models import Appointment
from conftest import deliver_emails, reserve

MENDOZA = ZoneInfo("America/Argentina/Mendoza")  # Zona del médico de prueba.


def local_hour(appointment):
    return datetime.fromisoformat(appointment["startAt"].replace("Z", "+00:00")).astimezone(MENDOZA).strftime("%H:%M")


def cancel(system, appointment_id, name="doctor", **body):
    return system.client.request("DELETE", f"/api/appointments/{appointment_id}", json=body or None, headers=system.headers(name))


def emails_to(emails, address):
    return [email for email in emails if email.to == address]


def test_doctor_cancels_with_reason_and_patient_is_told_who_when_and_why(system, tmp_path):
    booked = reserve(system).json()
    response = cancel(system, booked["id"], reason="Tengo un congreso ese día")
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "CANCELLED_BY_DOCTOR"
    with system.database.transaction() as db:
        assert db.get(Appointment, booked["id"]).cancellationReason == "Tengo un congreso ese día"
    emails = deliver_emails(system, tmp_path)
    [patient] = [email for email in emails_to(emails, "own@example.com") if email.subject == "Turno cancelado"]
    assert "Valeria Roldán" in patient.body
    assert f"a las {local_hour(booked)} h" in patient.body
    assert "UTC" not in patient.body
    assert "Lo canceló el profesional. Motivo: Tengo un congreso ese día" in patient.body
    assert "/mis-turnos" in patient.body
    # El aviso al médico lo lleva a su panel, no a la pantalla del paciente.
    [doctor] = [email for email in emails_to(emails, "doctor@example.com") if email.subject == "Turno cancelado"]
    assert "/panel" in doctor.body and "/mis-turnos" not in doctor.body


def test_confirmation_shows_the_doctors_local_time_not_utc(system, tmp_path):
    booked = reserve(system).json()
    [email] = [item for item in emails_to(deliver_emails(system, tmp_path), "own@example.com") if item.subject == "Turno confirmado"]
    assert f"a las {local_hour(booked)} h" in email.body
    assert "UTC" not in email.body


def test_patient_cancellation_does_not_blame_the_doctor(system, tmp_path):
    booked = reserve(system).json()
    assert cancel(system, booked["id"], name="own").status_code == 200
    [email] = [item for item in emails_to(deliver_emails(system, tmp_path), "own@example.com") if item.subject == "Turno cancelado"]
    assert "Lo canceló el profesional" not in email.body


def test_doctor_cancels_without_reason(system):
    booked = reserve(system).json()
    assert cancel(system, booked["id"]).status_code == 200
    with system.database.transaction() as db:
        item = db.get(Appointment, booked["id"])
        assert (item.status, item.cancellationReason) == ("CANCELLED_BY_DOCTOR", None)


def test_reason_is_limited_and_other_users_cannot_cancel(system):
    booked = reserve(system).json()
    assert cancel(system, booked["id"], reason="x" * 1001).status_code == 400
    assert cancel(system, booked["id"], name="other").status_code == 403
    with system.database.transaction() as db:
        assert db.scalar(select(Appointment.status).where(Appointment.id == booked["id"])) == "CONFIRMED"
