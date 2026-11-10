"""Aceptación de términos y consentimiento para datos de salud.

Ninguna cuenta opera sin aceptar la versión vigente, sin importar cómo se creó. El caso que originó estos
tests: el ingreso con Google crea la cuenta sin pasar por el formulario de registro ni sus casillas.
"""
import pytest
from sqlalchemy import func, select
from app import legal
from app.models import Appointment, AuditLog, User
from conftest import PASSWORD, deliver_emails, future_slots, link_token
from test_google_auth import begin, callback, complete, google, signing_key  # noqa: F401 (fixtures)

BOTH = {"acceptTerms": True, "acceptHealthData": True}


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


def test_google_account_cannot_do_anything_until_it_accepts(google):
    client = google.system.client
    callback(google, begin(google))
    auth = complete(google).json()
    headers = bearer(auth["accessToken"])
    assert auth["user"]["acceptancePending"] == ["terms", "healthData"]
    slot = future_slots(google.system)[0]["startAt"]
    blocked = [client.post("/api/appointments", headers=headers, json={"doctorId": "doctor", "startAt": slot}),
               client.get("/api/appointments/me", headers=headers),
               client.get(f"/api/medical-records/{auth['user']['patientProfileId']}", headers=headers),
               client.get("/api/patients/me", headers=headers)]
    for response in blocked:
        assert response.status_code == 403, response.text
        assert response.json()["code"] == "ACCEPTANCE_REQUIRED" and response.json()["pending"] == ["terms", "healthData"]
    with google.system.database.transaction() as db:
        assert db.scalar(select(func.count()).select_from(Appointment)) == 0
    # Sí puede consultar qué le falta y cerrar sesión.
    assert client.get("/api/auth/acceptance", headers=headers).json() == {"version": legal.TERMS_VERSION, "pending": ["terms", "healthData"]}

    # Aceptar a medias no alcanza, y lo aceptado queda guardado.
    partial = client.post("/api/auth/acceptance", headers=headers, json={"acceptTerms": True})
    assert partial.status_code == 403 and partial.json()["pending"] == ["healthData"]
    assert client.get("/api/appointments/me", headers=headers).status_code == 403
    assert client.post("/api/auth/acceptance", headers=headers, json={"acceptHealthData": True}).json() == {"version": legal.TERMS_VERSION, "pending": []}
    assert client.post("/api/appointments", headers=headers, json={"doctorId": "doctor", "startAt": slot}).status_code == 201
    with google.system.database.transaction() as db:
        user = db.get(User, auth["user"]["id"])
        assert user.termsVersion == legal.TERMS_VERSION and user.termsAcceptedAt and user.healthDataConsentAt
        logs = list(db.scalars(select(AuditLog).where(AuditLog.action == "user.terms_accepted", AuditLog.userId == user.id).order_by(AuditLog.createdAt)))
        assert [log.details for log in logs] == [{"version": legal.TERMS_VERSION, "accepted": ["terms"]},
                                                 {"version": legal.TERMS_VERSION, "accepted": ["healthData"]}]
    # Un nuevo ingreso con Google ya no pide nada.
    callback(google, begin(google))
    assert complete(google).json()["user"]["acceptancePending"] == []


def test_unaccepted_session_can_log_out(google):
    callback(google, begin(google))
    auth = complete(google).json()
    assert google.system.client.post("/api/auth/logout", headers=bearer(auth["accessToken"]), json={"refreshToken": auth["refreshToken"]}).status_code == 200
    assert google.system.client.post("/api/auth/refresh", json={"refreshToken": auth["refreshToken"]}).status_code == 401


@pytest.mark.parametrize("role,flags,message", [
    ("PATIENT", {}, "términos"), ("PATIENT", {"acceptTerms": False, "acceptHealthData": True}, "términos"),
    ("PATIENT", {"acceptTerms": True}, "datos de salud"), ("PATIENT", {"acceptTerms": "true", "acceptHealthData": True}, "acceptTerms"),
    ("DOCTOR", {}, "términos"), ("DOCTOR", {"acceptHealthData": True}, "términos"),
])
def test_registration_requires_the_checkboxes(system, role, flags, message):
    body = {"email": "nueva@example.com", "password": PASSWORD, "firstName": "N", "lastName": "C", "role": role, "licenseNumber": "L-1", **flags}
    response = system.client.post("/api/auth/register", json=body)
    assert response.status_code == 400 and message in response.text
    with system.database.transaction() as db:
        assert db.scalar(select(User).where(User.email == "nueva@example.com")) is None


def test_registration_records_version_date_and_audit(system, tmp_path):
    body = {"email": "nueva@example.com", "password": PASSWORD, "firstName": "N", "lastName": "C", "role": "PATIENT", **BOTH}
    assert system.client.post("/api/auth/register", json=body).status_code == 202
    doctor = {"email": "medica@example.com", "password": PASSWORD, "firstName": "M", "lastName": "D", "role": "DOCTOR", "licenseNumber": "L-2", "acceptTerms": True}
    assert system.client.post("/api/auth/register", json=doctor).status_code == 202
    with system.database.transaction() as db:
        patient = db.scalar(select(User).where(User.email == "nueva@example.com"))
        assert patient.termsVersion == legal.TERMS_VERSION and patient.termsAcceptedAt and patient.healthDataConsentAt
        assert db.scalar(select(AuditLog.details).where(AuditLog.action == "user.terms_accepted", AuditLog.userId == patient.id)) == {
            "version": legal.TERMS_VERSION, "accepted": ["terms", "healthData"]}
        # Un médico no carga datos de salud propios: solo acepta los términos.
        account = db.scalar(select(User).where(User.email == "medica@example.com"))
        assert account.termsAcceptedAt and account.healthDataConsentAt is None and legal.pending(account) == []
    token = link_token([item for item in deliver_emails(system, tmp_path) if item.to == "nueva@example.com"][-1], "verificar-email")
    assert system.client.post("/api/auth/email/verify", json={"token": token}).status_code == 200
    session = system.client.post("/api/auth/login", json={"email": "nueva@example.com", "password": PASSWORD}).json()
    assert session["user"]["acceptancePending"] == []
    assert system.client.get("/api/appointments/me", headers=bearer(session["accessToken"])).status_code == 200


def test_new_terms_version_asks_everyone_again_except_the_admin(system, monkeypatch):
    assert system.client.get("/api/appointments/me", headers=system.headers()).status_code == 200
    monkeypatch.setattr(legal, "TERMS_VERSION", "2.0")
    for name in ("own", "doctor"):
        response = system.client.get("/api/appointments/me", headers=system.headers(name))
        # El consentimiento de datos de salud ya dado no se vuelve a pedir; los términos nuevos sí.
        assert response.status_code == 403 and response.json()["pending"] == ["terms"]
    assert system.client.get("/api/admin/doctors", headers=system.headers("admin")).status_code == 200
    assert system.client.post("/api/auth/acceptance", headers=system.headers(), json={"acceptTerms": True}).status_code == 200
    assert system.client.get("/api/appointments/me", headers=system.headers()).status_code == 200
    with system.database.transaction() as db:
        assert db.get(User, "user-own").termsVersion == "2.0"


def test_acceptance_requires_a_session_and_strict_booleans(system):
    assert system.client.post("/api/auth/acceptance", json=BOTH).status_code == 401
    assert system.client.get("/api/auth/acceptance").status_code == 401
    assert system.client.post("/api/auth/acceptance", headers=system.headers(), json={"acceptTerms": "yes"}).status_code == 400
    assert system.client.post("/api/auth/acceptance", headers=system.headers(), json={"userId": "user-other", **BOTH}).status_code == 400


def test_every_protected_route_goes_through_the_acceptance_gate(system):
    """Ninguna ruta puede usar la sesión «sin términos» salvo aceptar, consultar qué falta y cerrar sesión."""
    from app.dependencies import authenticated_user, current_user
    allowed = {("GET", "/api/auth/acceptance"), ("POST", "/api/auth/acceptance"), ("POST", "/api/auth/logout")}

    def uses(dependant, target):
        return dependant.call is target or any(uses(item, target) for item in dependant.dependencies)

    import app.main as main
    routes = [route for module in vars(main).values() if hasattr(module, "router") for route in module.router.routes]
    assert len(routes) > 50 and any(route.path == "/api/admin/analytics" for route in routes)
    bypass = set()
    for route in routes:
        if uses(route.dependant, authenticated_user) and not uses(route.dependant, current_user):
            bypass |= {(method, route.path) for method in route.methods}
    assert bypass == allowed
