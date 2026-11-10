"""Cuenta del administrador, límites de lo que puede ver y números del negocio.

Decisiones del fundador (2026-11-10): el administrador no lee historias clínicas; su cuenta se crea solo
desde el servidor y la contraseña la elige él mismo con un link de un solo uso; las analíticas muestran
totales y datos de profesionales, nunca filas de pacientes.
"""
from datetime import datetime, timedelta, timezone
import json
import pytest
from sqlalchemy import func, select
from app.analytics import age_group
from app.create_admin import create_admin
from app.models import Appointment, AuditLog, Doctor, Patient, Specialty, User
from conftest import deliver_emails, link_token, reserve

UTC = timezone.utc


def test_admin_cannot_read_medical_records(system):
    reserve(system)
    headers = system.headers("doctor")
    assert system.client.post("/api/medical-records/entries", headers=headers, json={"patientId": "patient-own", "title": "A", "content": "Texto clínico"}).status_code == 201
    response = system.client.get("/api/medical-records/patient-own", headers=system.headers("admin"))
    assert response.status_code == 403 and "Texto clínico" not in response.text
    with system.database.transaction() as db:
        assert db.scalar(select(func.count()).select_from(AuditLog).where(AuditLog.action == "medical_record.read")) == 0
    # El paciente y su médico siguen leyendo.
    assert system.client.get("/api/medical-records/patient-own", headers=system.headers()).status_code == 200
    assert system.client.get("/api/medical-records/patient-own", headers=headers).status_code == 200


def test_create_admin_sends_a_link_and_the_owner_chooses_the_password(system, tmp_path):
    message = create_admin(system.database, "  Fundador@MiTurno.Example ")
    assert "fundador@miturno.example" in message
    with system.database.transaction() as db:
        user = db.scalar(select(User).where(User.email == "fundador@miturno.example"))
        assert user.roles == ["ADMIN"] and user.passwordHash is None and user.emailVerifiedAt is None
        assert db.scalar(select(func.count()).select_from(AuditLog).where(AuditLog.action == "user.admin_created", AuditLog.entityId == user.id)) == 1
    # Sin contraseña elegida no hay forma de entrar.
    login = lambda password: system.client.post("/api/auth/login", json={"email": "fundador@miturno.example", "password": password})
    assert login("cualquier-cosa-123").status_code == 401
    email = deliver_emails(system, tmp_path)[-1]
    assert email.to == "fundador@miturno.example"
    token = link_token(email, "restablecer-contrasena")
    assert system.client.post("/api/auth/password/reset", json={"token": token, "password": "Clave-del-fundador-1"}).status_code == 200
    session = login("Clave-del-fundador-1")
    assert session.status_code == 200 and session.json()["user"]["roles"] == ["ADMIN"]
    headers = {"Authorization": f"Bearer {session.json()['accessToken']}"}
    assert system.client.get("/api/admin/analytics", headers=headers).status_code == 200
    # Repetir el comando no duplica la cuenta: reenvía el link.
    assert "ya era administrador" in create_admin(system.database, "fundador@miturno.example")
    with system.database.transaction() as db:
        assert db.scalar(select(func.count()).select_from(User).where(User.email == "fundador@miturno.example")) == 1


@pytest.mark.parametrize("email,message", [("own@example.com", "paciente o médico"), ("doctor@example.com", "paciente o médico"), ("no-es-un-email", "no es válido")])
def test_create_admin_never_promotes_existing_accounts(system, email, message):
    with pytest.raises(ValueError, match=message):
        create_admin(system.database, email)
    with system.database.transaction() as db:
        assert [user.id for user in db.scalars(select(User)) if "ADMIN" in user.roles] == ["user-admin"]


def test_create_admin_refuses_a_suspended_admin(system):
    with system.database.transaction() as db:
        db.get(User, "user-admin").status = "SUSPENDED"
    with pytest.raises(ValueError, match="suspendida"):
        create_admin(system.database, "admin@example.com")


def test_no_web_route_creates_admins(system):
    body = {"email": "nuevo@example.com", "password": "Clave-segura-123", "firstName": "A", "lastName": "B", "role": "ADMIN", "acceptTerms": True, "acceptHealthData": True}
    assert system.client.post("/api/auth/register", json=body).status_code == 400
    with system.database.transaction() as db:
        assert db.scalar(select(User).where(User.email == "nuevo@example.com")) is None


@pytest.mark.parametrize("name", ["own", "doctor", None])
def test_analytics_are_only_for_the_admin(system, name):
    response = system.client.get("/api/admin/analytics", headers=system.headers(name) if name else {})
    assert response.status_code == (403 if name else 401)


@pytest.mark.parametrize("born,expected", [
    (None, "Sin dato"), (datetime(2010, 6, 1, tzinfo=UTC), "0 a 17"), (datetime(2000, 6, 15, tzinfo=UTC), "18 a 29"),
    # Cumple 30 el 15/6/2026: el día anterior todavía tiene 29.
    (datetime(1996, 6, 16, tzinfo=UTC), "18 a 29"), (datetime(1996, 6, 15, tzinfo=UTC), "30 a 44"),
    (datetime(1970, 1, 1, tzinfo=UTC), "45 a 59"), (datetime(1960, 1, 1, tzinfo=UTC), "60 a 74"), (datetime(1930, 1, 1, tzinfo=UTC), "75 o más"),
])
def test_age_groups(born, expected):
    assert age_group(born, datetime(2026, 6, 15).date()) == expected


def test_analytics_count_real_data_without_exposing_patients(system):
    with system.database.transaction() as db:
        db.add(Specialty(id="cardio", name="Cardiología", slug="cardiologia"))
        db.add(User(id="user-pending", email="pendiente@example.com", roles=["DOCTOR"], status="PENDING_VERIFICATION"))
        db.flush()
        db.add(Doctor(id="pending", userId="user-pending", firstName="Pedro", lastName="Gómez", licenseNumber="P-1", specialtyIds=["cardio"]))
        db.get(Doctor, "doctor").specialtyIds = ["specialty", "cardio"]
        db.get(Patient, "patient-own").healthInsurance = "  osde  210 "
        db.get(Patient, "patient-other").healthInsurance = "OSDE 210"
    first = reserve(system)
    second = reserve(system, "other")
    assert first.status_code == second.status_code == 201
    assert system.client.delete(f"/api/appointments/{second.json()['id']}", headers=system.headers("other")).status_code == 200
    with system.database.transaction() as db:
        db.add(Appointment(patientId="patient-own", doctorId="doctor", status="COMPLETED",
                           startAt=datetime.now(UTC) - timedelta(days=3), endAt=datetime.now(UTC) - timedelta(days=3) + timedelta(minutes=30)))

    response = system.client.get("/api/admin/analytics", headers=system.headers("admin"))
    assert response.status_code == 200, response.text
    data = response.json()
    count = lambda rows: {row["label"]: row["count"] for row in rows}
    assert data["totals"] == {"patients": 2, "doctorsActive": 1, "doctorsPending": 1, "doctorsSuspended": 0, "appointments": 3,
                              "appointmentsUpcoming": 1, "notificationsFailed": 0, "jobsFailed": 0}
    # Solo médicos activos; un médico con dos especialidades cuenta en las dos.
    assert count(data["doctorsBySpecialty"]) == {"Clínica": 1, "Cardiología": 1}
    # Demanda: turnos no cancelados por especialidad del médico.
    assert count(data["appointmentsBySpecialty"]) == {"Clínica": 2, "Cardiología": 2}
    assert count(data["appointmentsByStatus"]) == {"CONFIRMED": 1, "CANCELLED_BY_PATIENT": 1, "COMPLETED": 1}
    ages = count(data["patientsByAge"])
    assert list(ages) == ["0 a 17", "18 a 29", "30 a 44", "45 a 59", "60 a 74", "75 o más", "Sin dato"]
    assert ages["30 a 44"] == 1 and ages["Sin dato"] == 1 and sum(ages.values()) == 2
    assert count(data["patientsByInsurance"]) == {"Osde 210": 2}
    assert len(data["weekly"]) == 12 and [row["week"] for row in data["weekly"]] == sorted(row["week"] for row in data["weekly"])
    assert sum(row["booked"] for row in data["weekly"]) == 2 and sum(row["cancelled"] for row in data["weekly"]) == 1
    assert data["weekly"][-1]["patients"] == 2 and data["weekly"][-1]["doctors"] == 2
    doctors = {row["email"]: row for row in data["doctors"]}
    assert doctors["doctor@example.com"] | {"createdAt": None} == {
        "firstName": "Valeria", "lastName": "Roldán", "email": "doctor@example.com", "licenseNumber": "DEMO", "status": "ACTIVE",
        "specialties": ["Clínica", "Cardiología"], "createdAt": None, "appointments": 3, "appointmentsLast30Days": 1}
    assert doctors["pendiente@example.com"]["status"] == "PENDING_VERIFICATION"
    # Ningún dato que identifique a un paciente sale en la respuesta.
    text = json.dumps(data, ensure_ascii=False)
    for private in ("Castro", "Ana", "12345678", "87654321", "own@example.com", "other@example.com", "patient-own", "test-feed-token"):
        assert private not in text, private
