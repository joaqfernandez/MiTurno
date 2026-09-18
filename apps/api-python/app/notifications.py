from html import escape
import httpx
from .models import Notification, User, Appointment, now

SUBJECTS = {"appointment_confirmed": "Turno confirmado", "appointment_cancelled": "Turno cancelado", "reminder_24h": "Recordatorio de turno"}


def send(db, notification_id, settings, transport=None):
    item = db.get(Notification, notification_id)
    if item.status == "SENT":
        return
    user = db.get(User, item.userId)
    appointment = db.get(Appointment, item.payload["appointmentId"])
    subject = SUBJECTS[item.template]
    message = f"{subject}. Fecha y hora (UTC): {appointment.startAt.isoformat()}. Consultá tu agenda en {settings.web_url}/mis-turnos."
    with httpx.Client(timeout=15, transport=transport) as client:
        if item.channel == "EMAIL":
            if not settings.resend_api_key or not settings.email_from:
                raise RuntimeError("Email no configurado; notificación no enviada")
            response = client.post("https://api.resend.com/emails", headers={"Authorization": f"Bearer {settings.resend_api_key}", "Idempotency-Key": item.id}, json={
                "from": settings.email_from, "to": [user.email], "subject": subject, "text": message, "html": f"<p>{escape(message)}</p>"})
        elif item.channel == "SMS":
            if not user.phone or not settings.twilio_sid or not settings.twilio_token or not settings.twilio_from:
                raise RuntimeError("SMS sin configuración o destinatario")
            response = client.post(f"https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_sid}/Messages.json", auth=(settings.twilio_sid, settings.twilio_token), data={"From": settings.twilio_from, "To": user.phone, "Body": message})
        else:
            raise RuntimeError("Canal de notificación no implementado")
        response.raise_for_status()
    item.status, item.sentAt, item.error = "SENT", now(), None
