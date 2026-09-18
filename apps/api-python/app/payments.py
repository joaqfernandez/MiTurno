"""PaymentProvider separa el dominio de la API concreta de Mercado Pago."""
from decimal import Decimal
import hashlib
import hmac
import time
from typing import Protocol
from datetime import timedelta
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from .dependencies import session
from .models import Payment, Appointment, now
from .outbox import appointment_effects, enqueue


class PaymentProvider(Protocol):
    configured: bool
    def checkout(self, payment_id: str, amount: float, currency: str, email: str) -> dict: ...
    def payment(self, external_id: str) -> dict: ...
    def refund(self, external_id: str, key: str) -> None: ...


class MercadoPago:
    def __init__(self, settings, transport=None):
        self.settings = settings
        self.configured = bool(settings.mp_access_token and settings.mp_webhook_secret)
        self.client = httpx.Client(base_url="https://api.mercadopago.com", timeout=15, transport=transport,
                                   headers={"Authorization": f"Bearer {settings.mp_access_token}"})

    def checkout(self, payment_id, amount, currency, email):
        response = self.client.post("/checkout/preferences", headers={"X-Idempotency-Key": payment_id}, json={
            "items": [{"id": payment_id, "title": "Seña de turno", "quantity": 1, "unit_price": amount, "currency_id": currency}],
            "payer": {"email": email}, "external_reference": payment_id,
            "notification_url": f"{self.settings.api_url}/api/payments/webhooks/mercadopago",
            "back_urls": {"success": f"{self.settings.web_url}/mis-turnos", "failure": f"{self.settings.web_url}/mis-turnos", "pending": f"{self.settings.web_url}/mis-turnos"},
            "expires": True, "expiration_date_to": (now() + timedelta(minutes=30)).isoformat(),
        })
        response.raise_for_status()
        result = response.json()
        return {"id": result["id"], "url": result["init_point"]}

    def payment(self, external_id):
        response = self.client.get(f"/v1/payments/{external_id}")
        response.raise_for_status()
        return response.json()

    def refund(self, external_id, key):
        response = self.client.post(f"/v1/payments/{external_id}/refunds", headers={"X-Idempotency-Key": key}, json={})
        response.raise_for_status()


def verify_signature(secret, signature, request_id, data_id):
    if not secret:
        raise HTTPException(503, "Webhook no configurado")
    try:
        parts = dict(piece.strip().split("=", 1) for piece in signature.split(","))
        timestamp = int(parts["ts"])
        seconds = timestamp / 1000 if timestamp > 10**12 else timestamp
        if not request_id or not data_id or abs(time.time() - seconds) > 300:
            raise ValueError()
        manifest = f"id:{data_id.lower()};request-id:{request_id};ts:{parts['ts']};"
        expected = hmac.new(secret.encode(), manifest.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, parts["v1"]):
            raise ValueError()
    except (ValueError, KeyError, AttributeError):
        raise HTTPException(401, "Firma de webhook inválida") from None


router = APIRouter(prefix="/api/payments", tags=["Pagos"])


@router.post("/webhooks/mercadopago")
def webhook(request: Request, db=Depends(session)):
    # La identidad autenticada es el data.id de la URL firmada, nunca un body arbitrario.
    data_id = request.query_params.get("data.id", "")
    verify_signature(request.app.state.settings.mp_webhook_secret, request.headers.get("x-signature", ""), request.headers.get("x-request-id", ""), data_id)
    if not data_id.isdigit() or len(data_id) > 32:
        raise HTTPException(400, "ID de pago inválido")
    details = request.app.state.payment_provider.payment(data_id)
    apply_payment(db, details)
    return {"received": True}


def apply_payment(db, details):
    reference = details.get("external_reference")
    payment = db.scalar(select(Payment).where(Payment.id == reference))
    if not payment:
        return
    # Mismo orden de locks que cancelación/expiración: turno, luego pago.
    item = db.scalar(select(Appointment).where(Appointment.id == payment.appointmentId).with_for_update())
    payment = db.scalar(select(Payment).where(Payment.id == payment.id).with_for_update().execution_options(populate_existing=True))
    if Decimal(str(details.get("transaction_amount", -1))) != payment.amount or details.get("currency_id") != payment.currency:
        raise HTTPException(409, "El importe o moneda no coincide")
    external_id = str(details["id"])
    if payment.externalPaymentId and payment.externalPaymentId != external_id:
        raise HTTPException(409, "Pago externo duplicado: requiere conciliación")
    status = details.get("status")
    if payment.status in ("REFUND_PENDING", "REFUNDED"):
        return
    if status == "approved" and payment.status != "APPROVED":
        payment.externalPaymentId = external_id
        payment.paidAt = now()
        if item.status != "PENDING_PAYMENT" or item.createdAt < now() - timedelta(minutes=30):
            payment.status = "REFUND_PENDING"
            if item.status == "PENDING_PAYMENT":
                item.status, item.cancelledAt = "CANCELLED_BY_PATIENT", now()
                item.cancellationReason = "Pago recibido fuera de plazo"
                appointment_effects(db, item, cancelled=True)
            enqueue(db, "refund", payment.id, f"refund:{payment.id}")
        else:
            payment.status, item.status = "APPROVED", "CONFIRMED"
            appointment_effects(db, item)
    elif status == "rejected" and payment.status == "PENDING":
        payment.status = "REJECTED"
    payment.rawWebhookPayload = {key: details.get(key) for key in ("id", "status", "transaction_amount", "currency_id", "external_reference")}


def refund_job(db, payment_id, provider):
    payment = db.scalar(select(Payment).where(Payment.id == payment_id).with_for_update())
    if payment.status != "REFUND_PENDING":
        return
    if not payment.externalPaymentId:
        raise ValueError("Falta ID externo para reembolso")
    provider.refund(payment.externalPaymentId, payment.id)
    payment.status = "REFUNDED"
