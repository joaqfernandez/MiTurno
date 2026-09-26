"""Recuperar contraseña y verificar email: cada test protege una defensa concreta contra el abuso de estos links."""
from datetime import timedelta
import httpx
import pytest
from sqlalchemy import select, func, update
from app import auth
from app.models import AccountToken, AuditLog, Job, Notification, User, now
from app.worker import run_one
from conftest import deliver_emails, link_token, PASSWORD

NEW_PASSWORD = "Otra-clave-segura-2026"


def forgot(system, email):
    return system.client.post("/api/auth/password/forgot", json={"email": email})


def reset(system, token, password=NEW_PASSWORD):
    return system.client.post("/api/auth/password/reset", json={"token": token, "password": password})


def login(system, email, password):
    return system.client.post("/api/auth/login", json={"email": email, "password": password})


def emails_to(system, tmp_path, email):
    return [item for item in deliver_emails(system, tmp_path / "mailbox") if item.to == email]


def register(system, email, role="PATIENT", password=PASSWORD):
    body = {"email": email, "password": password, "firstName": "Nueva", "lastName": "Cuenta", "role": role}
    if role == "DOCTOR":
        body["licenseNumber"] = f"MAT-{email}"
    return system.client.post("/api/auth/register", json=body)


def test_register_requires_verified_email_and_link_is_single_use(system, tmp_path):
    assert register(system, "nueva@example.com").status_code == 202
    blocked = login(system, "nueva@example.com", PASSWORD)
    assert blocked.status_code == 403 and blocked.json()["code"] == "EMAIL_NOT_VERIFIED"
    [email] = emails_to(system, tmp_path, "nueva@example.com")
    token = link_token(email, "verificar-email")
    # El token viaja en el fragmento (#), nunca como parámetro que llegue a servidores o logs.
    assert "?token" not in email.body and email.body.count(system.settings.web_url + "/verificar-email#token=") == 1
    assert system.client.post("/api/auth/email/verify", json={"token": token}).status_code == 200
    assert login(system, "nueva@example.com", PASSWORD).status_code == 200
    assert system.client.post("/api/auth/email/verify", json={"token": token}).status_code == 400


def test_raw_token_is_never_stored(system, tmp_path):
    forgot(system, "own@example.com")
    token = link_token(emails_to(system, tmp_path, "own@example.com")[-1], "restablecer-contrasena")
    with system.database.transaction() as db:
        stored = db.scalar(select(AccountToken).where(AccountToken.userId == "user-own"))
        assert stored.tokenHash == auth.digest(token) and stored.tokenHash != token
        texts = [str(row.payload) + str(row.error) for row in db.scalars(select(Notification))]
        texts += [str(row.error) for row in db.scalars(select(Job))]
        assert not any(token in text for text in texts)


def test_register_does_not_reveal_existing_accounts(system, tmp_path):
    fresh = register(system, "desconocida@example.com")
    taken = register(system, "own@example.com", password="Clave-del-atacante-1")
    assert (fresh.status_code, fresh.json()) == (taken.status_code, taken.json())
    with system.database.transaction() as db:
        assert db.scalar(select(func.count()).select_from(User).where(User.email == "own@example.com")) == 1
    # La cuenta existente no cambia y su dueño recibe un aviso sin link de acceso.
    assert login(system, "own@example.com", PASSWORD).status_code == 200
    assert login(system, "own@example.com", "Clave-del-atacante-1").status_code == 401
    [notice] = emails_to(system, tmp_path, "own@example.com")
    assert notice.subject == "Intento de registro en MiTurno" and "#token=" not in notice.body


def test_forgot_password_does_not_reveal_accounts(system, tmp_path):
    existing, missing = forgot(system, "own@example.com"), forgot(system, "nadie@example.com")
    assert (existing.status_code, existing.json()) == (missing.status_code, missing.json()) == (202, {"message": auth.RESET_REQUESTED})
    delivered = deliver_emails(system, tmp_path / "mailbox")
    assert [item.to for item in delivered] == ["own@example.com"]


def test_login_checks_a_password_even_when_the_account_does_not_exist(system, monkeypatch):
    # Sin esta verificación, el login respondería más rápido para emails inexistentes y los revelaría.
    calls, original = [], auth.passwords

    class Recorder:
        def verify(self, stored, given):
            calls.append(stored)
            return original.verify(stored, given)
    monkeypatch.setattr(auth, "passwords", Recorder())
    assert login(system, "nadie@example.com", PASSWORD).status_code == 401
    assert calls == [auth.DUMMY_HASH]


def test_reset_closes_every_session_and_notifies_owner(system, tmp_path):
    forgot(system, "own@example.com")
    token = link_token(emails_to(system, tmp_path, "own@example.com")[-1], "restablecer-contrasena")
    assert reset(system, token).status_code == 200
    # Quien tuviera una sesión abierta (por ejemplo, alguien que robó la contraseña) queda afuera.
    assert system.client.get("/api/patients/me", headers=system.headers()).status_code == 401
    assert system.client.post("/api/auth/refresh", json={"refreshToken": system.tokens["own"]["refreshToken"]}).status_code == 401
    assert login(system, "own@example.com", PASSWORD).status_code == 401
    assert login(system, "own@example.com", NEW_PASSWORD).status_code == 200
    assert reset(system, token, "Tercera-clave-2026").status_code == 400
    assert emails_to(system, tmp_path, "own@example.com")[-1].subject == "Tu contraseña de MiTurno cambió"
    with system.database.transaction() as db:
        audit = db.scalar(select(AuditLog).where(AuditLog.action == "user.password_reset"))
        assert audit.entityId == "user-own"
        assert token not in str(audit.details) and NEW_PASSWORD not in str(audit.details)


def test_reset_link_expires(system, tmp_path):
    forgot(system, "own@example.com")
    token = link_token(emails_to(system, tmp_path, "own@example.com")[-1], "restablecer-contrasena")
    with system.database.transaction() as db:
        stored = db.scalar(select(AccountToken).where(AccountToken.tokenHash == auth.digest(token)))
        assert timedelta(minutes=29) < stored.expiresAt - now() <= timedelta(minutes=30)
        stored.expiresAt = now() - timedelta(seconds=1)
    assert reset(system, token).status_code == 400
    assert login(system, "own@example.com", PASSWORD).status_code == 200


def test_new_link_invalidates_previous_one(system, tmp_path):
    forgot(system, "own@example.com")
    first = link_token(emails_to(system, tmp_path, "own@example.com")[-1], "restablecer-contrasena")
    forgot(system, "own@example.com")
    second = link_token(emails_to(system, tmp_path, "own@example.com")[-1], "restablecer-contrasena")
    assert first != second
    assert reset(system, first).status_code == 400
    assert reset(system, second).status_code == 200


def test_links_only_work_for_their_purpose(system, tmp_path):
    register(system, "proposito@example.com")
    verification = link_token(emails_to(system, tmp_path, "proposito@example.com")[-1], "verificar-email")
    assert reset(system, verification).status_code == 400
    forgot(system, "own@example.com")
    recovery = link_token(emails_to(system, tmp_path, "own@example.com")[-1], "restablecer-contrasena")
    assert system.client.post("/api/auth/email/verify", json={"token": recovery}).status_code == 400
    assert reset(system, "x" * 43).status_code == 400


@pytest.mark.parametrize("password,status", [("own@example.com-2026", 400), ("OWN@EXAMPLE.COM!!", 400), ("corta", 400), ("x" * 129, 400)])
def test_rejected_password_does_not_consume_the_link(system, tmp_path, password, status):
    forgot(system, "own@example.com")
    token = link_token(emails_to(system, tmp_path, "own@example.com")[-1], "restablecer-contrasena")
    assert reset(system, token, password).status_code == status
    assert reset(system, token).status_code == 200


def test_register_rejects_password_containing_email(system):
    assert register(system, "clave@example.com", password="clave@example.com1").status_code == 400


def test_suspended_accounts_get_no_links_and_cannot_use_old_ones(system, tmp_path):
    forgot(system, "own@example.com")
    token = link_token(emails_to(system, tmp_path, "own@example.com")[-1], "restablecer-contrasena")
    assert system.client.patch("/api/admin/users/user-own/status", json={"status": "SUSPENDED"}, headers=system.headers("admin")).status_code == 200
    assert reset(system, token).status_code == 400
    assert forgot(system, "own@example.com").status_code == 202
    # La respuesta es la misma, pero no se encola ningún email nuevo.
    with system.database.transaction() as db:
        assert db.scalar(select(func.count()).select_from(Notification).where(Notification.template == "password_reset")) == 1


def test_link_queued_before_suspension_is_not_sent(system, tmp_path):
    forgot(system, "own@example.com")
    assert system.client.patch("/api/admin/users/user-own/status", json={"status": "SUSPENDED"}, headers=system.headers("admin")).status_code == 200
    assert emails_to(system, tmp_path, "own@example.com") == []
    with system.database.transaction() as db:
        assert db.scalar(select(Notification.status).where(Notification.template == "password_reset")) == "SKIPPED"
        assert db.scalar(select(func.count()).select_from(AccountToken)) == 0


def test_reset_does_not_reactivate_or_approve_accounts(system, tmp_path):
    register(system, "pendiente@example.com", role="DOCTOR")
    forgot(system, "pendiente@example.com")
    sent = emails_to(system, tmp_path, "pendiente@example.com")
    token = link_token([item for item in sent if "restablecer" in item.body][-1], "restablecer-contrasena")
    assert reset(system, token).status_code == 200
    # El link de recuperación prueba el email, pero el médico sigue esperando al administrador.
    assert login(system, "pendiente@example.com", NEW_PASSWORD).status_code == 403
    with system.database.transaction() as db:
        user = db.scalar(select(User).where(User.email == "pendiente@example.com"))
        assert user.status == "PENDING_VERIFICATION" and user.emailVerifiedAt is not None


def test_hourly_limit_per_account_is_silent(system, tmp_path):
    responses = [forgot(system, "own@example.com") for _ in range(5)]
    assert {(item.status_code, item.json()["message"]) for item in responses} == {(202, auth.RESET_REQUESTED)}
    assert len(emails_to(system, tmp_path, "own@example.com")) == 3


def test_link_domain_comes_from_configuration_not_from_the_request(system, tmp_path):
    system.client.post("/api/auth/password/forgot", json={"email": "own@example.com"},
                       headers={"Host": "evil.example", "X-Forwarded-Host": "evil.example", "Origin": "https://evil.example"})
    email = emails_to(system, tmp_path, "own@example.com")[-1]
    assert "evil.example" not in email.body
    assert f"{system.settings.web_url}/restablecer-contrasena#token=" in email.body


def test_resend_verification_is_generic_and_skips_verified_accounts(system, tmp_path):
    register(system, "reenvio@example.com")
    responses = [system.client.post("/api/auth/email/resend", json={"email": email}) for email in ("reenvio@example.com", "own@example.com", "nadie@example.com")]
    assert len({(item.status_code, item.json()["message"]) for item in responses}) == 1
    delivered = deliver_emails(system, tmp_path / "mailbox")
    assert [item.to for item in delivered] == ["reenvio@example.com", "reenvio@example.com"]
    first, second = (link_token(item, "verificar-email") for item in delivered)
    assert system.client.post("/api/auth/email/verify", json={"token": first}).status_code == 400
    assert system.client.post("/api/auth/email/verify", json={"token": second}).status_code == 200


def test_failed_delivery_leaves_no_usable_token(system):
    system.settings.resend_api_key, system.settings.email_from = "test-key", "MiTurno <test@example.com>"
    forgot(system, "own@example.com")
    sent = []
    transport = httpx.MockTransport(lambda request: sent.append(request) or httpx.Response(500))
    state = system.client.app.state
    assert run_one(system.database, system.settings, state.payment_provider, state.calendar_provider, transport)
    with system.database.transaction() as db:
        assert db.scalar(select(func.count()).select_from(AccountToken)) == 0
        assert db.scalar(select(Notification.status).where(Notification.template == "password_reset")) == "FAILED"
    # Se intentó enviar un link real; como el proveedor falló, ese link no quedó válido.
    assert b"restablecer-contrasena#token=" in sent[0].content


def test_account_email_html_escapes_and_links(system):
    system.settings.resend_api_key, system.settings.email_from = "test-key", "MiTurno <test@example.com>"
    forgot(system, "own@example.com")
    sent = []
    transport = httpx.MockTransport(lambda request: sent.append(request) or httpx.Response(200, json={"id": "email"}))
    state = system.client.app.state
    assert run_one(system.database, system.settings, state.payment_provider, state.calendar_provider, transport)
    body = sent[0].read().decode()
    assert '<a href=\\"http://localhost:3001/restablecer-contrasena#token=' in body
    with system.database.transaction() as db:
        assert db.scalar(select(func.count()).select_from(AccountToken).where(AccountToken.usedAt.is_(None))) == 1


def test_unverified_accounts_never_get_sessions(system):
    with system.database.transaction() as db:
        db.execute(update(User).where(User.id == "user-own").values(emailVerifiedAt=None))
        assert auth.issue_tokens(db, db.get(User, "user-own"), system.settings)["accessToken"] is None
    assert system.client.get("/api/patients/me", headers=system.headers()).status_code == 403
    assert system.client.post("/api/auth/refresh", json={"refreshToken": system.tokens["own"]["refreshToken"]}).status_code == 403


def test_suspended_status_alone_blocks_links(system, tmp_path):
    # Segunda capa: aunque la suspensión no hubiera cambiado sessionVersion, el estado bloquea el link.
    forgot(system, "own@example.com")
    token = link_token(emails_to(system, tmp_path, "own@example.com")[-1], "restablecer-contrasena")
    with system.database.transaction() as db:
        db.execute(update(User).where(User.id == "user-own").values(status="SUSPENDED"))
    assert reset(system, token).status_code == 400
