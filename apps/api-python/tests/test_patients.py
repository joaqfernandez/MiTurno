"""Pruebas HTTP con JWT y SQLite reales; cada caso usa su propia DB temporal."""

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
import jwt
import pytest

from app.database import Database, EDITABLE_FIELDS
from app.main import create_app


SECRET = "test-only-secret-with-at-least-64-bytes-for-all-tested-hmac-algorithms"
INITIAL_TIME = "2026-01-01T00:00:00.000Z"


def token(**overrides):
    claims = {"sub": "user-own", "pid": "patient-own", "exp": datetime.now(timezone.utc) + timedelta(minutes=15)}
    claims.update(overrides)
    return jwt.encode(claims, SECRET, algorithm="HS256")


def headers(value=None):
    return {"Authorization": f"Bearer {value if value is not None else token()}"}


@pytest.fixture
def system(tmp_path):
    path = tmp_path / "test.sqlite3"
    app = create_app(path, SECRET)
    database = Database(path)
    with database.connect() as connection:
        connection.executemany("INSERT INTO users VALUES (?, ?, ?)", [
            ("user-own", '["PATIENT"]', "ACTIVE"),
            ("user-other", '["PATIENT"]', "ACTIVE"),
        ])
        connection.executemany(
            "INSERT INTO patient_profiles VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                ("patient-own", "user-own", "Ana", "Castro", "12345678", "1990-01-01", "Original", "ABC", INITIAL_TIME, INITIAL_TIME),
                ("patient-other", "user-other", "Otro", "Paciente", "87654321", None, None, None, INITIAL_TIME, INITIAL_TIME),
            ],
        )
    with TestClient(app) as client:
        yield client, database


def snapshot(database):
    with database.connect() as connection:
        return {
            table: [dict(row) for row in connection.execute(f"SELECT * FROM {table} ORDER BY id")]
            for table in ("users", "patient_profiles")
        }


def test_updates_all_fields_and_persists_after_app_restart(system):
    client, database = system
    changes = {"firstName": "Juana", "lastName": "Pérez", "documentId": "55555555", "birthDate": "2000-02-29", "healthInsurance": "Nueva", "insuranceNumber": "XYZ"}
    before = snapshot(database)
    response = client.patch("/api/patients/me", json=changes, headers=headers())
    assert response.status_code == 200
    expected = {**changes, "birthDate": "2000-02-29T00:00:00.000Z"}
    assert {key: response.json()[key] for key in changes} == expected
    assert response.json()["id"] == "patient-own"
    assert response.json()["userId"] == "user-own"
    assert response.json()["createdAt"] == INITIAL_TIME
    assert response.json()["updatedAt"] != INITIAL_TIME
    after = snapshot(database)
    assert after["users"] == before["users"]
    assert after["patient_profiles"][0] == before["patient_profiles"][0]  # Otro paciente.
    with TestClient(create_app(database.path, SECRET)) as restarted:
        assert restarted.get("/api/patients/me", headers=headers()).json() == response.json()


def test_partial_update_preserves_omitted_fields(system):
    client, database = system
    before = database.get_patient("user-own", "patient-own")
    response = client.patch("/api/patients/me", json={"firstName": "Juana"}, headers=headers())
    assert response.status_code == 200
    after = database.get_patient("user-own", "patient-own")
    assert after["firstName"] == "Juana"
    for field in set(before) - {"firstName", "updatedAt"}:
        assert after[field] == before[field]


def test_empty_patch_is_no_op(system):
    client, database = system
    before = snapshot(database)
    assert client.patch("/api/patients/me", json={}, headers=headers()).status_code == 200
    assert snapshot(database) == before


FORBIDDEN = {
    "roles": ["ADMIN"], "status": "ACTIVE", "id": "patient-other", "userId": "user-other",
    "user": {"update": {"roles": ["ADMIN"], "status": "ACTIVE", "passwordHash": "replacement"}},
    "appointments": {"deleteMany": {}}, "medicalRecord": {"delete": True},
    "createdAt": "2000-01-01", "updatedAt": "2000-01-01", "passwordHash": "replacement", "unknown": "value",
}


@pytest.mark.parametrize("field,value", FORBIDDEN.items())
def test_forbidden_fields_rejected_without_any_database_change(system, field, value):
    client, database = system
    before = snapshot(database)
    response = client.patch("/api/patients/me", json={"firstName": "Must not persist", field: value}, headers=headers())
    assert response.status_code == 400
    assert any(field in message for message in response.json()["message"])
    assert snapshot(database) == before


@pytest.mark.parametrize("field", EDITABLE_FIELDS)
@pytest.mark.parametrize("value", [None, 123, [], {"set": "injected"}])
def test_invalid_field_types_are_rejected(system, field, value):
    client, database = system
    before = snapshot(database)
    assert client.patch("/api/patients/me", json={field: value}, headers=headers()).status_code == 400
    assert snapshot(database) == before


@pytest.mark.parametrize("value", ["not-a-date", "2025-02-30", "2025-13-01", "2025-01-01T00:00:00Z", ""])
def test_invalid_birth_dates(system, value):
    client, database = system
    before = snapshot(database)
    assert client.patch("/api/patients/me", json={"birthDate": value}, headers=headers()).status_code == 400
    assert snapshot(database) == before


@pytest.mark.parametrize("field", ["firstName", "lastName"])
def test_empty_names(system, field):
    client, database = system
    before = snapshot(database)
    assert client.patch("/api/patients/me", json={field: ""}, headers=headers()).status_code == 400
    assert snapshot(database) == before


def invalid_tokens():
    claims = {"sub": "user-own", "pid": "patient-own", "exp": datetime.now(timezone.utc) + timedelta(minutes=15)}
    return [
        "invalid-token",
        token(exp=datetime.now(timezone.utc) - timedelta(minutes=1)),
        jwt.encode(claims, "wrong-secret-that-is-at-least-32-bytes", algorithm="HS256"),
        jwt.encode(claims, "", algorithm="none"),
        jwt.encode(claims, SECRET, algorithm="HS384"),
        jwt.encode({key: value for key, value in claims.items() if key != "exp"}, SECRET, algorithm="HS256"),
        jwt.encode({key: value for key, value in claims.items() if key != "sub"}, SECRET, algorithm="HS256"),
    ]


@pytest.mark.parametrize("value", invalid_tokens())
def test_invalid_jwt(system, value):
    client, database = system
    before = snapshot(database)
    assert client.patch("/api/patients/me", json={"firstName": "Juana"}, headers=headers(value)).status_code == 401
    assert snapshot(database) == before


@pytest.mark.parametrize("auth_headers", [{}, {"Authorization": "Basic invalid"}])
def test_missing_bearer(system, auth_headers):
    client, database = system
    before = snapshot(database)
    assert client.patch("/api/patients/me", json={}, headers=auth_headers).status_code == 401
    assert snapshot(database) == before


@pytest.mark.parametrize("claims", [
    {"pid": None}, {"pid": 123}, {"pid": "patient-other"}, {"sub": "user-missing"},
])
def test_missing_or_foreign_patient_cannot_be_modified(system, claims):
    client, database = system
    before = snapshot(database)
    response = client.patch("/api/patients/me", json={"firstName": "Juana"}, headers=headers(token(**claims)))
    assert response.status_code == 403
    assert snapshot(database) == before


@pytest.mark.parametrize("status", ["SUSPENDED", "PENDING_VERIFICATION"])
def test_non_active_user_is_rejected_even_with_a_valid_jwt(system, status):
    client, database = system
    with database.connect() as connection:
        connection.execute("UPDATE users SET status = ? WHERE id = ?", (status, "user-own"))
    before = snapshot(database)
    assert client.patch("/api/patients/me", json={}, headers=headers()).status_code == 403
    assert client.get("/api/patients/me", headers=headers()).status_code == 403
    assert snapshot(database) == before


def test_duplicate_document_rolls_back_all_fields(system):
    client, database = system
    before = snapshot(database)
    response = client.patch("/api/patients/me", json={"firstName": "Must not persist", "documentId": "87654321"}, headers=headers())
    assert response.status_code == 409
    assert snapshot(database) == before


def test_repository_allowlist_blocks_relations_for_internal_callers(system):
    _, database = system
    before = snapshot(database)
    database.update_patient("user-own", "patient-own", FORBIDDEN)
    assert snapshot(database) == before


def test_repository_also_checks_ownership(system):
    _, database = system
    before = snapshot(database)
    with pytest.raises(PermissionError):
        database.update_patient("user-own", "patient-other", {"firstName": "Injected"})
    assert snapshot(database) == before


def test_sql_payload_is_saved_as_text_not_executed(system):
    client, database = system
    value = "Ana'; UPDATE users SET roles = 'ADMIN'; --"
    before_users = snapshot(database)["users"]
    response = client.patch("/api/patients/me", json={"firstName": value}, headers=headers())
    assert response.status_code == 200
    assert database.get_patient("user-own", "patient-own")["firstName"] == value
    assert snapshot(database)["users"] == before_users


@pytest.mark.parametrize("body", ["[]", "null", "123", '"text"', '{"firstName":'])
def test_invalid_request_body(system, body):
    client, database = system
    before = snapshot(database)
    response = client.patch("/api/patients/me", content=body, headers={**headers(), "Content-Type": "application/json"})
    assert response.status_code == 400
    assert snapshot(database) == before


def test_openapi_lists_editable_fields_and_bearer_auth(system):
    client, _ = system
    schema = client.get("/openapi.json").json()
    assert set(schema["components"]["schemas"]["UpdatePatient"]["properties"]) == set(EDITABLE_FIELDS)
    assert schema["components"]["schemas"]["UpdatePatient"]["additionalProperties"] is False
    assert schema["paths"]["/api/patients/me"]["patch"]["security"] == [{"HTTPBearer": []}]


@pytest.mark.parametrize("secret", ["", "short"])
def test_secret_is_required_and_no_db_is_created(tmp_path, secret):
    path = tmp_path / "uninitialized.sqlite3"
    with pytest.raises(ValueError, match="JWT_ACCESS_SECRET"):
        create_app(path, secret)
    assert not path.exists()


def test_demo_token_works_and_reseeding_preserves_changes(tmp_path, monkeypatch, capsys):
    from app import demo

    path = tmp_path / "demo.sqlite3"
    monkeypatch.setenv("JWT_ACCESS_SECRET", SECRET)
    monkeypatch.setattr(demo, "Database", lambda _path: Database(path))
    demo.main()
    demo_token = capsys.readouterr().out.strip().splitlines()[-1]
    with TestClient(create_app(path, SECRET)) as client:
        response = client.patch("/api/patients/me", json={"firstName": "Cambio persistente"}, headers=headers(demo_token))
        assert response.status_code == 200
        demo.main()
        assert client.get("/api/patients/me", headers=headers(demo_token)).json()["firstName"] == "Cambio persistente"
