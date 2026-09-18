import hashlib
import hmac
import json
import time
from urllib.parse import parse_qs, urlparse
from datetime import timedelta
import httpx
from sqlalchemy import select, func
from app.calendar import GoogleCalendar
from app.models import CalendarAccount, CalendarEvent, Doctor, Payment, Appointment, Notification, Job, now
from app.notifications import send
from app.payments import MercadoPago
from conftest import reserve


def signature(secret, data_id, timestamp=None):
    timestamp = str(timestamp or int(time.time()))
    message = f"id:{data_id};request-id:test-request;ts:{timestamp};"
    digest = hmac.new(secret.encode(), message.encode(), hashlib.sha256).hexdigest()
    return {"x-signature": f"ts={timestamp},v1={digest}", "x-request-id": "test-request"}


def test_webhook_authenticates_url_and_validates_amount(system):
    with system.database.transaction() as db:
        doctor = db.get(Doctor, "doctor")
        doctor.requiresDeposit, doctor.depositAmount = True, 100
    item = reserve(system).json()
    with system.database.transaction() as db:
        payment = db.scalar(select(Payment).where(Payment.appointmentId == item["id"]))
        payment_id = payment.id
    system.provider.details = {"id": 123, "external_reference": payment_id, "transaction_amount": 100, "currency_id": "ARS", "status": "approved"}
    url = "/api/payments/webhooks/mercadopago?data.id=123"
    assert system.client.post(url).status_code == 401
    expired_headers = signature(system.settings.mp_webhook_secret, "123", int(time.time()) - 600)
    assert system.client.post(url, headers=expired_headers).status_code == 401
    valid_headers = signature(system.settings.mp_webhook_secret, "123")
    assert system.client.post(url.replace("123", "456"), headers=valid_headers).status_code == 401
    system.provider.details["transaction_amount"] = 1
    assert system.client.post(url, headers=valid_headers).status_code == 409
    system.provider.details["transaction_amount"] = 100
    assert system.client.post(url, headers=valid_headers, json={"data": {"id": "malicious-body-id"}}).status_code == 200
    assert system.client.post(url, headers=valid_headers).status_code == 200
    with system.database.transaction() as db:
        assert db.get(Appointment, item["id"]).status == "CONFIRMED"
        assert db.get(Payment, payment_id).externalPaymentId == "123"
        assert db.scalar(select(func.count()).select_from(Job)) == 3


def google_transport(request):
    if request.url.path == "/token":
        return httpx.Response(200, json={"access_token": "secret-access", "refresh_token": "secret-refresh", "expires_in": 3600})
    if request.url.path == "/v1/userinfo":
        return httpx.Response(200, json={"email": "doctor@example.com", "email_verified": True})
    raise AssertionError(request.url)


def test_oauth_nonce_cookie_encryption_and_replay(system):
    settings = system.settings
    settings.google_client_id, settings.google_client_secret = "test-client", "test-secret"
    provider = GoogleCalendar(settings, httpx.MockTransport(google_transport))
    system.client.app.state.calendar_provider = provider
    response = system.client.get("/api/calendar/google/connect", headers=system.headers("doctor"))
    assert response.status_code == 200
    params = parse_qs(urlparse(response.json()["url"]).query)
    state = params["state"][0]
    assert state != "doctor"
    assert "email" in params["scope"][0]
    assert system.client.get("/api/calendar/google/callback", params={"code": "code", "state": "doctor"}, follow_redirects=False).status_code == 400
    # Un callback copiado a otro navegador no tiene la cookie iniciadora.
    cookie = system.client.cookies.get("calendar_state")
    system.client.cookies.clear()
    assert system.client.get("/api/calendar/google/callback", params={"code": "code", "state": state}, follow_redirects=False).status_code == 400
    system.client.cookies.set("calendar_state", cookie, path="/api/calendar/google/callback")
    assert system.client.get("/api/calendar/google/callback", params={"code": "code", "state": state}, follow_redirects=False).status_code == 303
    system.client.cookies.set("calendar_state", cookie, path="/api/calendar/google/callback")
    assert system.client.get("/api/calendar/google/callback", params={"code": "code", "state": state}, follow_redirects=False).status_code == 400
    with system.database.transaction() as db:
        account = db.scalar(select(CalendarAccount))
        assert account.accessTokenEnc != "secret-access"
        assert account.refreshTokenEnc != "secret-refresh"
        assert provider.decrypt(account.refreshTokenEnc) == "secret-refresh"


def test_calendar_sync_is_idempotent_and_cancel_deletes(system):
    item = reserve(system).json()
    events = {}
    def transport(request):
        if request.method == "POST":
            data = json.loads(request.content)
            if data["id"] in events:
                return httpx.Response(409)
            events[data["id"]] = data
            return httpx.Response(200, json=data)
        event_id = request.url.path.split("/")[-1]
        if request.method == "PUT":
            events[event_id] = json.loads(request.content)
            return httpx.Response(200, json=events[event_id])
        if request.method == "DELETE":
            events.pop(event_id, None)
            return httpx.Response(204)
        raise AssertionError(request)
    provider = GoogleCalendar(system.settings, httpx.MockTransport(transport))
    with system.database.transaction() as db:
        db.add(CalendarAccount(doctorId="doctor", externalEmail="google@example.com", accessTokenEnc=provider.encrypt("access"), refreshTokenEnc=provider.encrypt("refresh"), tokenExpiresAt=now() + timedelta(hours=1)))
    for _ in range(2):
        with system.database.transaction() as db:
            provider.sync(db, item["id"])
    assert len(events) == 1
    with system.database.transaction() as db:
        assert db.scalar(select(func.count()).select_from(CalendarEvent)) == 1
    system.client.delete(f"/api/appointments/{item['id']}", headers=system.headers())
    with system.database.transaction() as db:
        provider.sync(db, item["id"])
    assert not events


def test_notification_marks_sent_only_after_provider_acceptance(system):
    reserve(system)
    system.settings.resend_api_key, system.settings.email_from = "test-key", "MiTurno <test@example.com>"
    observed = []
    def transport(request):
        observed.append(request)
        return httpx.Response(200, json={"id": "email-provider-id"})
    with system.database.transaction() as db:
        notification = db.scalar(select(Notification).order_by(Notification.createdAt))
        notification_id = notification.id
        send(db, notification_id, system.settings, httpx.MockTransport(transport))
        send(db, notification_id, system.settings, httpx.MockTransport(transport))
        assert notification.status == "SENT"
    assert len(observed) == 1
    assert observed[0].headers["Idempotency-Key"] == notification_id


def test_mp_adapter_keeps_preference_and_payment_identifiers_separate(system):
    seen = []
    def transport(request):
        seen.append(request)
        if request.url.path == "/checkout/preferences":
            return httpx.Response(200, json={"id": "preference-123", "init_point": "https://example.com/checkout"})
        if request.url.path == "/v1/payments/987/refunds":
            return httpx.Response(201, json={"id": "refund"})
        raise AssertionError(request.url)
    provider = MercadoPago(system.settings, httpx.MockTransport(transport))
    assert provider.checkout("internal-id", 100, "ARS", "user@example.com")["id"] == "preference-123"
    provider.refund("987", "internal-id")
    assert seen[-1].headers["X-Idempotency-Key"] == "internal-id"
