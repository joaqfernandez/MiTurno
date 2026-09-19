import base64
from datetime import timedelta
import hashlib
import secrets
from urllib.parse import urlencode, quote
import httpx
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import APIRouter, Depends, HTTPException, Request, Response, Query
from fastapi.responses import RedirectResponse
from icalendar import Calendar, Event
from sqlalchemy import select, update
from .auth import digest
from .dependencies import session, doctor_user, current_user
from .models import OAuthState, CalendarAccount, CalendarEvent, Appointment, Patient, Doctor, User, now
from .outbox import enqueue

router = APIRouter(prefix="/api/calendar", tags=["Calendarios"])


class GoogleCalendar:
    def __init__(self, settings, transport=None):
        self.settings = settings
        self.client = httpx.Client(timeout=15, transport=transport)

    def cipher(self):
        try:
            key = bytes.fromhex(self.settings.encryption_key)
            if len(key) != 32 or not any(key):
                raise ValueError()
            return AESGCM(key)
        except ValueError:
            raise HTTPException(503, "Configurá ENCRYPTION_KEY con 32 bytes aleatorios en hexadecimal") from None

    def encrypt(self, value):
        nonce = secrets.token_bytes(12)
        return base64.b64encode(nonce + self.cipher().encrypt(nonce, value.encode(), None)).decode()

    def decrypt(self, value):
        packed = base64.b64decode(value)
        return self.cipher().decrypt(packed[:12], packed[12:], None).decode()

    def auth_url(self, state):
        if not self.settings.google_client_id or not self.settings.google_client_secret:
            raise HTTPException(503, "Google Calendar todavía no está configurado")
        self.cipher()
        return "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode({
            "client_id": self.settings.google_client_id, "redirect_uri": (self.settings.google_redirect_uri or f"{self.settings.api_url}/api/calendar/google/callback"),
            "response_type": "code", "access_type": "offline", "prompt": "consent", "state": state,
            "scope": "openid email https://www.googleapis.com/auth/calendar.events",
        })

    def token(self, data):
        response = self.client.post("https://oauth2.googleapis.com/token", data={
            **data, "client_id": self.settings.google_client_id, "client_secret": self.settings.google_client_secret})
        response.raise_for_status()
        return response.json()

    def exchange(self, code):
        tokens = self.token({"grant_type": "authorization_code", "code": code, "redirect_uri": (self.settings.google_redirect_uri or f"{self.settings.api_url}/api/calendar/google/callback")})
        response = self.client.get("https://openidconnect.googleapis.com/v1/userinfo", headers={"Authorization": f"Bearer {tokens['access_token']}"})
        response.raise_for_status()
        profile = response.json()
        if not profile.get("email_verified") or not profile.get("email"):
            raise HTTPException(400, "Google no devolvió un email verificado")
        return tokens, profile["email"]

    def sync(self, db, appointment_id):
        item = db.get(Appointment, appointment_id)
        accounts = list(db.scalars(select(CalendarAccount).where(CalendarAccount.doctorId == item.doctorId)))
        patient = db.get(Patient, item.patientId)
        for account in accounts:
            if account.tokenExpiresAt <= now() + timedelta(minutes=1):
                tokens = self.token({"grant_type": "refresh_token", "refresh_token": self.decrypt(account.refreshTokenEnc)})
                account.accessTokenEnc = self.encrypt(tokens["access_token"])
                account.tokenExpiresAt = now() + timedelta(seconds=tokens["expires_in"])
            headers = {"Authorization": f"Bearer {self.decrypt(account.accessTokenEnc)}"}
            base = f"https://www.googleapis.com/calendar/v3/calendars/{quote(account.calendarId, safe='')}/events"
            # Hex es subconjunto de base32hex admitido por Google. Mismo ID al reintentar.
            event_id = hashlib.sha256(f"{item.id}:{account.id}".encode()).hexdigest()
            mapping = db.scalar(select(CalendarEvent).where(CalendarEvent.appointmentId == item.id, CalendarEvent.accountId == account.id))
            if item.status == "CONFIRMED":
                payload = {"id": event_id, "summary": f"Turno: {patient.firstName} {patient.lastName}",
                           "start": {"dateTime": item.startAt.isoformat()}, "end": {"dateTime": item.endAt.isoformat()}}
                response = self.client.post(base, headers=headers, json=payload)
                if response.status_code == 409:
                    response = self.client.put(f"{base}/{event_id}", headers=headers, json=payload)
                response.raise_for_status()
                if not mapping:
                    db.add(CalendarEvent(appointmentId=item.id, accountId=account.id, externalEventId=event_id))
            elif item.status.startswith("CANCELLED"):
                response = self.client.delete(f"{base}/{mapping.externalEventId if mapping else event_id}", headers=headers)
                if response.status_code not in (404, 410):
                    response.raise_for_status()
                if mapping:
                    db.delete(mapping)


@router.get("/google/connect")
def connect(request: Request, response: Response, user=Depends(doctor_user), db=Depends(session)):
    raw = secrets.token_urlsafe(32)
    url = request.app.state.calendar_provider.auth_url(raw)
    db.add(OAuthState(tokenHash=digest(raw), userId=user.user.id, doctorId=user.doctor.id, expiresAt=now() + timedelta(minutes=10)))
    response.set_cookie("calendar_state", raw, httponly=True, secure=request.app.state.settings.environment == "production", samesite="lax", max_age=600, path="/api/calendar/google/callback")
    return {"url": url}


@router.get("/google/callback")
def callback(request: Request, code: str | None = Query(default=None, max_length=2048), state: str = Query(max_length=256), error: str | None = None, db=Depends(session)):
    if not secrets.compare_digest(request.cookies.get("calendar_state", ""), state):
        raise HTTPException(400, "La conexión no pertenece a esta sesión")
    pending = db.scalar(select(OAuthState).where(OAuthState.tokenHash == digest(state)))
    if not pending or pending.usedAt or pending.expiresAt <= now():
        raise HTTPException(400, "Conexión vencida o utilizada")
    if db.get(User, pending.userId).status != "ACTIVE":
        raise HTTPException(403, "Cuenta inactiva")
    result = db.execute(update(OAuthState).where(OAuthState.id == pending.id, OAuthState.usedAt.is_(None)).values(usedAt=now()))
    if result.rowcount != 1:
        raise HTTPException(400, "Conexión utilizada")
    provider = request.app.state.calendar_provider
    def denied():
        response = RedirectResponse(f"{request.app.state.settings.web_url}/panel/configuracion?calendar=error", status_code=303)
        response.delete_cookie("calendar_state", path="/api/calendar/google/callback")
        return response
    if error or not code:
        return denied()
    try:
        tokens, email = provider.exchange(code)
    except (httpx.HTTPError, ValueError, KeyError, HTTPException):
        return denied()
    account = db.scalar(select(CalendarAccount).where(CalendarAccount.doctorId == pending.doctorId, CalendarAccount.externalEmail == email, CalendarAccount.provider == "google"))
    if not account:
        if not tokens.get("refresh_token"):
            raise HTTPException(400, "Google no autorizó acceso offline; volvé a conectar")
        account = CalendarAccount(doctorId=pending.doctorId, externalEmail=email, refreshTokenEnc=provider.encrypt(tokens["refresh_token"]))
        db.add(account)
    account.accessTokenEnc = provider.encrypt(tokens["access_token"])
    if tokens.get("refresh_token"):
        account.refreshTokenEnc = provider.encrypt(tokens["refresh_token"])
    account.tokenExpiresAt = now() + timedelta(seconds=tokens["expires_in"])
    db.flush()
    for item in db.scalars(select(Appointment).where(Appointment.doctorId == pending.doctorId, Appointment.status == "CONFIRMED", Appointment.startAt > now())):
        enqueue(db, "calendar", item.id, f"calendar-connect:{pending.id}:{item.id}")
    response = RedirectResponse(f"{request.app.state.settings.web_url}/panel/configuracion?calendar=ok", status_code=303)
    response.delete_cookie("calendar_state", path="/api/calendar/google/callback")
    return response


def ics_response(items):
    calendar = Calendar()
    calendar.add("prodid", "-//MiTurno//Calendario//ES")
    calendar.add("version", "2.0")
    for item in items:
        event = Event()
        event.add("uid", f"{item.id}@miturno")
        event.add("dtstamp", now())
        event.add("dtstart", item.startAt)
        event.add("dtend", item.endAt)
        event.add("summary", "Turno médico")
        event.add("status", "TENTATIVE" if item.status == "PENDING_PAYMENT" else "CANCELLED" if item.status.startswith("CANCELLED") else "CONFIRMED")
        calendar.add_component(event)
    return Response(calendar.to_ical(), media_type="text/calendar", headers={"Cache-Control": "no-store"})


@router.get("/feed/{token}.ics")
def feed(token: str, db=Depends(session)):
    doctor = db.scalar(select(Doctor).where(Doctor.icsFeedToken == token))
    if not doctor or db.get(User, doctor.userId).status != "ACTIVE":
        raise HTTPException(404, "Calendario no encontrado")
    items = db.scalars(select(Appointment).where(Appointment.doctorId == doctor.id, Appointment.status.in_(["CONFIRMED", "PENDING_PAYMENT"]), Appointment.startAt > now() - timedelta(days=30), Appointment.startAt < now() + timedelta(days=366)))
    return ics_response(items)


@router.get("/feed-url")
def feed_url(request: Request, user=Depends(doctor_user)):
    return {"url": f"{request.app.state.settings.api_url}/api/calendar/feed/{user.doctor.icsFeedToken}.ics"}


@router.post("/feed/rotate")
def rotate(request: Request, user=Depends(doctor_user)):
    user.doctor.icsFeedToken = secrets.token_urlsafe(32)
    return feed_url(request, user)


@router.get("/appointments/{appointment_id}.ics")
def patient_calendar(appointment_id: str, user=Depends(current_user), db=Depends(session)):
    item = db.get(Appointment, appointment_id)
    if not item or not ((user.patient and item.patientId == user.patient.id) or (user.doctor and item.doctorId == user.doctor.id)):
        raise HTTPException(404, "Turno no encontrado")
    return ics_response([item])
