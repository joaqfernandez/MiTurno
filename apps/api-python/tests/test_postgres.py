"""Pruebas opt-in en una DB temporal creada y eliminada por este módulo."""
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
import os
from types import SimpleNamespace
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, update, func
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError
from app.auth import issue_tokens
from app.config import Settings
from app.database import Database
from app.main import create_app
from app.models import User, Doctor, Appointment, Patient, MedicalEntry, AuditLog, Job, Payment, now
from app.seed import seed
from app.payments import apply_payment
from conftest import migrate, SECRET, FakePayments

pytestmark = pytest.mark.skipif(not os.getenv("TEST_POSTGRES_URL"), reason="Requiere TEST_POSTGRES_URL; nunca usa la DB de desarrollo")


@pytest.fixture
def pg():
    root_url = make_url(os.environ["TEST_POSTGRES_URL"])
    database_name = "miturno_test_" + uuid4().hex
    root = create_engine(root_url, isolation_level="AUTOCOMMIT")
    with root.connect() as connection:
        connection.exec_driver_sql(f'CREATE DATABASE "{database_name}"')
    settings = Settings(root_url.set(database=database_name).render_as_string(hide_password=False), SECRET)
    database = Database(settings.database_url)
    app = None
    try:
        migrate(settings.database_url)
        seed(database, settings)
        with database.transaction() as db:
            ana = db.scalar(select(User).where(User.email == "ana@example.com"))
            lucas = db.scalar(select(User).where(User.email == "lucas@example.com"))
            doctor = db.scalar(select(Doctor).where(Doctor.firstName == "Valeria"))
            doctor_id = doctor.id
            patient_id = db.scalar(select(Patient.id).where(Patient.userId == ana.id))
            tokens = [issue_tokens(db, user, settings) for user in (ana, lucas)]
        app = create_app(settings=settings, payment_provider=FakePayments())
        with TestClient(app) as client:
            yield SimpleNamespace(client=client, db=database, tokens=tokens, doctor_id=doctor_id, patient_id=patient_id, settings=settings)
    finally:
        database.engine.dispose()
        if app:
            app.state.database.engine.dispose()
        with root.connect() as connection:
            connection.exec_driver_sql(f'DROP DATABASE "{database_name}" WITH (FORCE)')
        root.dispose()


def test_postgres_concurrent_booking_and_cancel_rebook(pg):
    start, end = now() + timedelta(days=2), now() + timedelta(days=8)
    available = pg.client.get(f"/api/appointments/availability/{pg.doctor_id}", params={"from": start.isoformat(), "to": end.isoformat()}).json()
    chosen = available[0]
    def book(token):
        return pg.client.post("/api/appointments", headers={"Authorization": "Bearer " + token["accessToken"]}, json={"doctorId": pg.doctor_id, "startAt": chosen["startAt"]})
    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(executor.map(book, pg.tokens))
    assert sorted(response.status_code for response in responses) == [201, 409]
    winner = next(index for index, response in enumerate(responses) if response.status_code == 201)
    assert pg.client.delete("/api/appointments/" + responses[winner].json()["id"], headers={"Authorization": "Bearer " + pg.tokens[winner]["accessToken"]}).status_code == 200
    assert book(pg.tokens[1 - winner]).status_code == 201


def test_postgres_constraints_and_immutable_audit(pg):
    with pg.db.transaction() as db:
        occupied = db.scalar(select(Appointment).where(Appointment.doctorId == pg.doctor_id, Appointment.status == "CONFIRMED"))
        begin, end = occupied.startAt, occupied.endAt
    with pytest.raises(IntegrityError):
        with pg.db.transaction() as db:
            db.add(Appointment(patientId=pg.patient_id, doctorId=pg.doctor_id, startAt=begin + timedelta(minutes=5), endAt=end + timedelta(minutes=5), status="CONFIRMED"))
    from sqlalchemy.exc import DBAPIError
    with pytest.raises(DBAPIError):
        with pg.db.transaction() as db:
            db.execute(update(MedicalEntry).values(content="Changed"))
    with pytest.raises(DBAPIError):
        with pg.db.transaction() as db:
            db.execute(update(AuditLog).values(action="Changed"))


def test_postgres_refresh_is_single_use_under_concurrency(pg):
    def refresh(_):
        return pg.client.post("/api/auth/refresh", json={"refreshToken": pg.tokens[0]["refreshToken"]})
    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(refresh, range(2)))
    assert sorted(response.status_code for response in results) == [200, 401]


def test_postgres_concurrent_webhook_is_idempotent(pg):
    with pg.db.transaction() as db:
        appointment = db.scalar(select(Appointment).where(Appointment.doctorId == pg.doctor_id, Appointment.status == "CONFIRMED"))
        appointment.status = "PENDING_PAYMENT"
        payment = Payment(appointmentId=appointment.id, amount=100, currency="ARS")
        db.add(payment)
        db.flush()
        details = {"id": 222, "external_reference": payment.id, "transaction_amount": 100, "currency_id": "ARS", "status": "approved"}
    def approve(_):
        with pg.db.transaction() as db:
            apply_payment(db, details)
    with ThreadPoolExecutor(max_workers=2) as executor:
        list(executor.map(approve, range(2)))
    with pg.db.transaction() as db:
        assert db.scalar(select(func.count()).select_from(Job)) == 3
