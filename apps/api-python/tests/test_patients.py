from datetime import datetime, timedelta, timezone
import jwt
import pytest
from sqlalchemy import select
from app.models import User, Patient
from app.patients import update_patient
from app.database import EDITABLE_FIELDS
from app.serializers import row
from conftest import SECRET


def snapshot(system):
    with system.database.transaction() as db:
        return {table.__tablename__: [row(item) for item in db.scalars(select(table).order_by(table.id))] for table in (User, Patient)}


def patch(system, body, headers=None):
    return system.client.patch("/api/patients/me", json=body, headers=system.headers() if headers is None else headers)


def test_all_fields_persist(system):
    changes = {"firstName": "Juana", "lastName": "Pérez", "documentId": "55555555", "birthDate": "2000-02-29", "healthInsurance": "Nueva", "insuranceNumber": "XYZ"}
    response = patch(system, changes)
    assert response.status_code == 200, response.text
    actual = system.client.get("/api/patients/me", headers=system.headers()).json()
    for key, value in changes.items():
        assert actual[key].startswith(value)
    assert actual["userId"] == "user-own"
    with system.database.transaction() as db:
        assert db.get(Patient, "patient-own").firstName == "Juana"
        assert db.get(Patient, "patient-other").firstName == "Otro"


def test_partial_and_empty_updates(system):
    before = snapshot(system)
    assert patch(system, {}).status_code == 200
    assert snapshot(system) == before
    assert patch(system, {"firstName": "Juana"}).status_code == 200
    with system.database.transaction() as db:
        assert db.get(Patient, "patient-own").lastName == "Castro"
        assert db.get(Patient, "patient-own").healthInsurance == "Original"


FORBIDDEN = {"roles": ["ADMIN"], "status": "ACTIVE", "id": "patient-other", "userId": "user-other", "user": {"update": {"roles": ["ADMIN"]}}, "appointments": {"deleteMany": {}}, "medicalRecord": {"delete": True}, "createdAt": "2000-01-01", "updatedAt": "2000-01-01", "passwordHash": "replacement", "unknown": "value"}

@pytest.mark.parametrize("key,value", FORBIDDEN.items())
def test_rejects_privileged_fields(system, key, value):
    before = snapshot(system)
    assert patch(system, {"firstName": "Must not persist", key: value}).status_code == 400
    assert snapshot(system) == before

@pytest.mark.parametrize("field", EDITABLE_FIELDS)
@pytest.mark.parametrize("value", [None, 123, [], {"set": "injected"}])
def test_rejects_invalid_field_types(system, field, value):
    before = snapshot(system)
    assert patch(system, {field: value}).status_code == 400
    assert snapshot(system) == before

@pytest.mark.parametrize("value", ["not-a-date", "2025-02-30", "2025-13-01", "2025-01-01T00:00:00Z", ""])
def test_invalid_dates(system, value):
    before = snapshot(system)
    assert patch(system, {"birthDate": value}).status_code == 400
    assert snapshot(system) == before

@pytest.mark.parametrize("field", ["firstName", "lastName"])
def test_empty_names(system, field):
    assert patch(system, {field: ""}).status_code == 400

@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer invalid"}, {"Authorization": "Basic invalid"}])
def test_unauthenticated(system, headers):
    assert patch(system, {}, headers).status_code == 401

@pytest.mark.parametrize("kind", ["expired", "wrong-secret", "none", "algorithm", "missing-sub", "missing-exp"])
def test_bad_jwt(system, kind):
    claims = {"sub": "user-own", "exp": datetime.now(timezone.utc) + timedelta(minutes=1)}
    secret, algorithm = SECRET, "HS256"
    if kind == "expired": claims["exp"] = datetime.now(timezone.utc) - timedelta(seconds=1)
    if kind == "wrong-secret": secret = "wrong-secret-" * 6
    if kind == "none": secret, algorithm = "", "none"
    if kind == "algorithm": algorithm = "HS384"
    if kind == "missing-sub": del claims["sub"]
    if kind == "missing-exp": del claims["exp"]
    token = jwt.encode(claims, secret, algorithm=algorithm)
    assert patch(system, {}, {"Authorization": f"Bearer {token}"}).status_code == 401


def test_identity_is_derived_from_db_not_pid_claim(system):
    token = jwt.encode({"sub": "user-own", "pid": "patient-other", "exp": datetime.now(timezone.utc) + timedelta(minutes=1)}, SECRET, algorithm="HS256")
    response = patch(system, {"firstName": "Juana"}, {"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["id"] == "patient-own"


def test_doctor_has_no_patient_profile(system):
    assert patch(system, {}, system.headers("doctor")).status_code == 403


def test_suspended_user_cannot_update(system):
    with system.database.transaction() as db:
        db.get(User, "user-own").status = "SUSPENDED"
    assert patch(system, {}).status_code == 403


def test_duplicate_document_rolls_back(system):
    before = snapshot(system)
    assert patch(system, {"firstName": "Must not persist", "documentId": "87654321"}).status_code == 409
    assert snapshot(system) == before


def test_internal_service_allowlist(system):
    before = snapshot(system)
    with system.database.transaction() as db:
        update_patient(db.get(Patient, "patient-own"), FORBIDDEN)
    assert snapshot(system) == before


def test_sql_payload_is_only_data(system):
    value = "Ana'; UPDATE users SET roles = 'ADMIN'; --"
    assert patch(system, {"firstName": value}).status_code == 200
    with system.database.transaction() as db:
        assert db.get(User, "user-own").roles == ["PATIENT"]

@pytest.mark.parametrize("body", ["[]", "null", "123", '\"text\"', '{"firstName":'])
def test_bad_request_body(system, body):
    response = system.client.patch("/api/patients/me", content=body, headers={**system.headers(), "Content-Type": "application/json"})
    assert response.status_code == 400
