from html import escape
from pathlib import Path
import httpx
from . import account
from .models import Notification, User, Appointment, now

SUBJECTS = {"appointment_confirmed": "Turno confirmado", "appointment_cancelled": "Turno cancelado", "reminder_24h": "Recordatorio de turno"}


def send(db, notification_id, settings, transport=None):
    item = db.get(Notification, notification_id)
    if item.status in ("SENT", "SKIPPED"):
        return
    user = db.get(User, item.userId)
    if item.template in account.TEMPLATES:
        message = account.compose(db, item, settings)
        if message is None:
            item.status, item.error = "SKIPPED", None
            return
        subject, text, html = message
    else:
        appointment = db.get(Appointment, item.payload["appointmentId"])
        subject = SUBJECTS[item.template]
        text = f"{subject}. Fecha y hora (UTC): {appointment.startAt.isoformat()}. Consultá tu agenda en {settings.web_url}/mis-turnos."
        html = f"<p>{escape(text)}</p>"
    if item.channel == "EMAIL" and not settings.resend_api_key and settings.mailbox_dir:
        # Solo desarrollo (config.py lo prohíbe en producción): entrega real a una carpeta local.
        mailbox = Path(settings.mailbox_dir)
        mailbox.mkdir(parents=True, exist_ok=True)
        path = mailbox / f"{now():%Y%m%d-%H%M%S}-{item.id}.txt"
        path.write_text(f"Para: {user.email}\nAsunto: {subject}\n\n{text}\n", encoding="utf-8")
        path.chmod(0o600)
        item.status, item.sentAt, item.error = "SENT", now(), None
        return
    with httpx.Client(timeout=15, transport=transport) as client:
        if item.channel == "EMAIL":
            if not settings.resend_api_key or not settings.email_from:
                raise RuntimeError("Email no configurado; notificación no enviada")
            response = client.post("https://api.resend.com/emails", headers={"Authorization": f"Bearer {settings.resend_api_key}", "Idempotency-Key": item.id}, json={
                "from": settings.email_from, "to": [user.email], "subject": subject, "text": text, "html": html})
        elif item.channel == "SMS":
            if not user.phone or not settings.twilio_sid or not settings.twilio_token or not settings.twilio_from:
                raise RuntimeError("SMS sin configuración o destinatario")
            response = client.post(f"https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_sid}/Messages.json", auth=(settings.twilio_sid, settings.twilio_token), data={"From": settings.twilio_from, "To": user.phone, "Body": text})
        else:
            raise RuntimeError("Canal de notificación no implementado")
        response.raise_for_status()
    item.status, item.sentAt, item.error = "SENT", now(), None
