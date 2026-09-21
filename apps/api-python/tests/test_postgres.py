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


def test_postgres_oauth_ticket_has_only_one_winner(pg):
    from fastapi import Response
    from app.google_auth import create_request
    with pg.db.transaction() as db:
        user_id = db.scalar(select(User.id).where(User.email == 'ana@example.com'))
        ticket, _ = create_request(db, 'session', Response(), pg.settings, user_id)
    def complete(_):
        return pg.client.post('/api/auth/google/complete', headers={
            'Origin': pg.settings.web_url, 'Cookie': f'miturno_oauth_session={ticket}'})
    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(executor.map(complete, range(2)))
    assert sorted(response.status_code for response in responses) == [200, 401]


def test_postgres_oauth_callback_state_has_only_one_winner(pg):
    from fastapi import Response
    from app.google_auth import create_request, consume_request
    with pg.db.transaction() as db:
        response = Response()
        state, _ = create_request(db, 'login', response, pg.settings)
        binding = response.headers['set-cookie'].split(';')[0].split('=', 1)[1]
    def consume(_):
        with pg.db.transaction() as db:
            try:
                consume_request(db, 'login', state, binding)
                return True
            except ValueError:
                return False
    with ThreadPoolExecutor(max_workers=2) as executor:
        assert sorted(executor.map(consume, range(2))) == [False, True]


@pytest.mark.parametrize('operation', ['refresh', 'login', 'google'])
def test_postgres_suspension_competes_with_session_issuance(pg, operation):
    from threading import Barrier
    from app.models import RefreshToken
    with pg.db.transaction() as db:
        admin = db.scalar(select(User).where(User.email == 'admin@example.com'))
        admin_token = issue_tokens(db, admin, pg.settings)['accessToken']
        user_id = db.scalar(select(User.id).where(User.email == 'ana@example.com'))
    from fastapi import Response
    from app.google_auth import create_request
    with pg.db.transaction() as db:
        ticket, _ = create_request(db, 'session', Response(), pg.settings, user_id)
    headers = {'Authorization': 'Bearer ' + admin_token}
    barrier = Barrier(2)
    def authenticate():
        barrier.wait(timeout=10)
        if operation == 'google':
            return pg.client.post('/api/auth/google/complete', headers={'Origin':pg.settings.web_url, 'Cookie':f'miturno_oauth_session={ticket}'})
        if operation == 'refresh':
            return pg.client.post('/api/auth/refresh', json={'refreshToken':pg.tokens[0]['refreshToken']})
        return pg.client.post('/api/auth/login', json={'email':'ana@example.com', 'password':'DemoTurnos2026!'})
    def suspend():
        barrier.wait(timeout=10)
        return pg.client.patch(f'/api/admin/users/{user_id}/status', headers=headers, json={'status':'SUSPENDED'})
    with ThreadPoolExecutor(max_workers=2) as executor:
        authentication = executor.submit(authenticate)
        suspension = executor.submit(suspend)
        result = authentication.result(timeout=20)
        assert suspension.result(timeout=20).status_code == 200
    assert result.status_code in (200, 401, 403)
    with pg.db.transaction() as db:
        assert db.scalar(select(func.count()).select_from(RefreshToken).where(
            RefreshToken.userId == user_id, RefreshToken.revokedAt.is_(None))) == 0
    assert pg.client.patch(f'/api/admin/users/{user_id}/status', headers=headers, json={'status':'ACTIVE'}).status_code == 200
    credentials = [pg.tokens[0]] + ([result.json()] if result.status_code == 200 else [])
    for tokens in credentials:
        assert pg.client.get('/api/appointments/me', headers={'Authorization':'Bearer '+tokens['accessToken']}).status_code == 401
        assert pg.client.post('/api/auth/refresh', json={'refreshToken':tokens['refreshToken']}).status_code == 401


@pytest.fixture
def pg_clinical(pg):
    from app.models import MedicalRecord
    with pg.db.transaction() as db:
        original = db.scalar(select(MedicalEntry))
        doctor = db.get(Doctor, pg.doctor_id)
        token = issue_tokens(db, db.get(User, doctor.userId), pg.settings)['accessToken']
        other_patient = db.scalar(select(Patient).where(Patient.id != pg.patient_id))
        other_record = MedicalRecord(patientId=other_patient.id)
        db.add(other_record)
        start = now() + timedelta(days=30)
        visit = Appointment(patientId=pg.patient_id, doctorId=pg.doctor_id,
                            startAt=start, endAt=start + timedelta(minutes=30), status='CONFIRMED')
        db.add(visit)
        db.flush()
        pg.clinical = SimpleNamespace(original_id=original.id, record_id=original.recordId,
            original_visit=original.appointmentId, visit_id=visit.id, other_record=other_record.id,
            other_patient=other_patient.id, other_doctor=db.scalar(select(Doctor.id).where(Doctor.id != pg.doctor_id)),
            headers={'Authorization':'Bearer '+token})
    return pg


@pytest.mark.parametrize('mutation', ['record', 'author', 'episode', 'remove_episode', 'self', 'visit_patient', 'visit_doctor', 'pending_visit'])
def test_postgres_clinical_constraints_reject_direct_invalid_inserts(pg_clinical, mutation):
    pg, c = pg_clinical, pg_clinical.clinical
    values = dict(id='injected', recordId=c.record_id, doctorId=pg.doctor_id,
                  appointmentId=c.original_visit, amendsEntryId=c.original_id, title='A', content='B')
    changes = {
        'record': {'recordId':c.other_record}, 'author': {'doctorId':c.other_doctor},
        'episode': {'appointmentId':c.visit_id}, 'remove_episode': {'appointmentId':None},
        'self': {'amendsEntryId':'injected'},
        'visit_patient': {'amendsEntryId':None, 'recordId':c.other_record},
        'visit_doctor': {'amendsEntryId':None, 'doctorId':c.other_doctor},
        'pending_visit': {'amendsEntryId':None, 'appointmentId':c.visit_id},
    }
    if mutation == 'pending_visit':
        with pg.db.transaction() as db:
            db.get(Appointment, c.visit_id).status = 'PENDING_PAYMENT'
    with pytest.raises(IntegrityError):
        with pg.db.transaction() as db:
            db.add(MedicalEntry(**(values | changes[mutation])))
    with pg.db.transaction() as db:
        assert db.get(MedicalEntry, 'injected') is None


@pytest.mark.parametrize('target', ['record', 'visit_patient', 'visit_doctor'])
def test_postgres_clinical_parent_ownership_is_immutable(pg_clinical, target):
    from app.models import MedicalRecord
    pg, c = pg_clinical, pg_clinical.clinical
    statement = {
        'record': update(MedicalRecord).where(MedicalRecord.id == c.record_id).values(patientId=c.other_patient),
        'visit_patient': update(Appointment).where(Appointment.id == c.original_visit).values(patientId=c.other_patient),
        'visit_doctor': update(Appointment).where(Appointment.id == c.original_visit).values(doctorId=c.other_doctor),
    }[target]
    with pytest.raises(IntegrityError):
        with pg.db.transaction() as db:
            db.execute(statement)


def test_postgres_clinical_amendment_inherits_episode(pg_clinical):
    pg, c = pg_clinical, pg_clinical.clinical
    result = pg.client.post('/api/medical-records/entries', headers=c.headers,
        json={'patientId':pg.patient_id, 'amendsEntryId':c.original_id, 'title':'Corrección', 'content':'Ficticio'})
    assert result.status_code == 201, result.text
    assert result.json()['appointmentId'] == c.original_visit


def test_postgres_cancel_before_clinical_write_rechecks_status(pg_clinical):
    from threading import Event
    from sqlalchemy import event
    pg, c = pg_clinical, pg_clinical.clinical
    waiting = Event()
    def observed(connection, cursor, statement, parameters, context, executemany):
        if 'FOR SHARE' in statement and c.visit_id in str(parameters):
            waiting.set()
    event.listen(pg.db.engine, 'before_cursor_execute', observed)
    # La app usa la misma Database en esta fixture.
    event.listen(pg.client.app.state.database.engine, 'before_cursor_execute', observed)
    try:
        with ThreadPoolExecutor(max_workers=1) as pool:
            with pg.db.transaction() as db:
                db.execute(update(Appointment).where(Appointment.id == c.visit_id).values(status='CANCELLED_BY_PATIENT'))
                future = pool.submit(pg.client.post, '/api/medical-records/entries', headers=c.headers,
                    json={'patientId':pg.patient_id, 'appointmentId':c.visit_id, 'title':'Carrera', 'content':'Ficticio'})
                reached = waiting.wait(timeout=10)
                was_waiting = not future.done()
            result = future.result(timeout=10)
        assert reached and was_waiting
        assert result.status_code == 400, result.text
        with pg.db.transaction() as db:
            assert db.scalar(select(func.count()).select_from(MedicalEntry).where(MedicalEntry.appointmentId == c.visit_id)) == 0
    finally:
        event.remove(pg.db.engine, 'before_cursor_execute', observed)
        event.remove(pg.client.app.state.database.engine, 'before_cursor_execute', observed)


def test_postgres_clinical_write_before_cancellation_is_preserved(pg_clinical, monkeypatch):
    from threading import Event
    from sqlalchemy import event
    from app import medical_records
    pg, c = pg_clinical, pg_clinical.clinical
    written, release, cancelling = Event(), Event(), Event()
    original_audit = medical_records.audit
    def held_audit(*args):
        original_audit(*args)
        written.set()
        assert release.wait(timeout=15)
    def observed(connection, cursor, statement, parameters, context, executemany):
        if 'FOR UPDATE' in statement and c.visit_id in str(parameters):
            cancelling.set()
    monkeypatch.setattr(medical_records, 'audit', held_audit)
    event.listen(pg.client.app.state.database.engine, 'before_cursor_execute', observed)
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            writing = pool.submit(pg.client.post, '/api/medical-records/entries', headers=c.headers,
                json={'patientId':pg.patient_id, 'appointmentId':c.visit_id, 'title':'Carrera', 'content':'Ficticio'})
            try:
                assert written.wait(timeout=10)
                cancellation = pool.submit(pg.client.delete, '/api/appointments/' + c.visit_id,
                    headers={'Authorization':'Bearer '+pg.tokens[0]['accessToken']})
                assert cancelling.wait(timeout=10)
                assert not cancellation.done()
            finally:
                release.set()
            assert writing.result(timeout=10).status_code == 201
            assert cancellation.result(timeout=10).status_code == 200
        with pg.db.transaction() as db:
            assert db.scalar(select(func.count()).select_from(MedicalEntry).where(MedicalEntry.appointmentId == c.visit_id)) == 1
            assert db.get(Appointment, c.visit_id).status == 'CANCELLED_BY_PATIENT'
    finally:
        event.remove(pg.client.app.state.database.engine, 'before_cursor_execute', observed)


def test_postgres_clinical_migration_is_atomic_on_invalid_legacy_data(pg_clinical):
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import text
    from conftest import ROOT
    pg, c = pg_clinical, pg_clinical.clinical
    config = Config(str(ROOT / 'alembic.ini'))
    config.set_main_option('sqlalchemy.url', pg.settings.database_url.replace('%', '%%'))
    command.downgrade(config, '0003')
    with pg.db.transaction() as db:
        db.add(MedicalEntry(id='legacy-invalid', recordId=c.record_id, doctorId=pg.doctor_id,
            appointmentId=None, amendsEntryId=c.original_id, title='Histórico', content='Conservar'))
    with pytest.raises(RuntimeError, match='referencias inconsistentes'):
        command.upgrade(config, 'head')
    with pg.db.transaction() as db:
        assert db.scalar(text('SELECT version_num FROM alembic_version')) == '0003'
        assert db.get(MedicalEntry, 'legacy-invalid').content == 'Conservar'
        assert db.scalar(text("SELECT count(*) FROM pg_trigger WHERE tgname = 'clinical_entry_references_v1'")) == 0
