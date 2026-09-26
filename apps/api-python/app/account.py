"""Emails de cuenta y links de un solo uso: verificar email y recuperar contraseña.

El token en claro solo existe en la memoria del worker y en el email: se genera al enviar,
en la base queda su SHA-256 y nunca pasa por la cola, los logs ni los errores.
"""
from datetime import timedelta
import hashlib
import secrets
from html import escape
from uuid import uuid4
from fastapi import HTTPException
from sqlalchemy import func, select, update
from .models import AccountToken, Notification, User, now
from .outbox import enqueue

# Plantilla → (vigencia del link, página de la web que lo recibe).
LINKS = {
    "password_reset": (timedelta(minutes=30), "restablecer-contrasena"),
    "email_verification": (timedelta(hours=24), "verificar-email"),
}
TEMPLATES = {*LINKS, "password_changed", "account_exists"}
# Por cuenta y plantilla: evita inundar la casilla de alguien pidiendo links en su nombre.
HOURLY_LIMIT = 3
INVALID_LINK = "El link no es válido o ya venció. Pedí uno nuevo."


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def lock_user(db, **where):
    column, value = next(iter(where.items()))
    return db.scalar(select(User).where(getattr(User, column) == value).with_for_update().execution_options(populate_existing=True))


def request_email(db, user, template, limited=True):
    """Encola un email de cuenta. Requiere el usuario bloqueado para que el límite no se pueda saltear en paralelo."""
    if limited:
        recent = db.scalar(select(func.count()).select_from(Notification).where(
            Notification.userId == user.id, Notification.template == template,
            Notification.createdAt > now() - timedelta(hours=1)))
        if recent >= HOURLY_LIMIT:
            return False
    item = Notification(userId=user.id, template=template, payload={}, dedupeKey=f"{template}:{user.id}:{uuid4()}")
    db.add(item)
    db.flush()
    enqueue(db, "notification", item.id, f"notification:{item.id}")
    return True


def invalidate_tokens(db, user_id, purpose=None):
    conditions = [AccountToken.userId == user_id, AccountToken.usedAt.is_(None)]
    if purpose:
        conditions.append(AccountToken.purpose == purpose)
    db.execute(update(AccountToken).where(*conditions).values(usedAt=now()))


def consume(db, purpose, raw):
    """Usa un link una sola vez. Falla si venció, ya se usó o la cuenta cambió de contraseña o se suspendió."""
    stored = db.scalar(select(AccountToken).where(AccountToken.tokenHash == digest(raw), AccountToken.purpose == purpose))
    if stored is None:
        raise HTTPException(400, INVALID_LINK)
    # Orden de locks compartido con login, refresh y suspensión: usuario primero.
    user = lock_user(db, id=stored.userId)
    used = db.execute(update(AccountToken).where(
        AccountToken.id == stored.id, AccountToken.usedAt.is_(None), AccountToken.expiresAt > now(),
        AccountToken.sessionVersion == user.sessionVersion).values(usedAt=now()))
    if used.rowcount != 1 or user.status == "SUSPENDED":
        raise HTTPException(400, INVALID_LINK)
    return user


def compose(db, item, settings):
    """Arma asunto, texto y HTML. Devuelve None si el email ya no corresponde (cuenta suspendida o ya verificada)."""
    user = lock_user(db, id=item.userId)
    if user.status == "SUSPENDED" or (item.template == "email_verification" and user.emailVerifiedAt):
        return None
    recover = f"{settings.web_url}/recuperar-contrasena"
    link = None
    if item.template in LINKS:
        ttl, page = LINKS[item.template]
        raw = secrets.token_urlsafe(32)
        # Un link nuevo anula los anteriores del mismo tipo.
        invalidate_tokens(db, user.id, item.template)
        db.add(AccountToken(userId=user.id, purpose=item.template, tokenHash=digest(raw),
                            sessionVersion=user.sessionVersion, expiresAt=now() + ttl))
        # El token va en el fragmento (#): el navegador no lo envía a servidores, proxies ni en el Referer.
        link = f"{settings.web_url}/{page}#token={raw}"
    if item.template == "email_verification":
        subject, label = "Confirmá tu email en MiTurno", "Confirmar email"
        lines = ["Para activar tu cuenta de MiTurno, abrí este link. Vence en 24 horas.",
                 "Si no creaste una cuenta, ignorá este mensaje."]
    elif item.template == "password_reset":
        subject, label = "Restablecé tu contraseña de MiTurno", "Elegir una contraseña nueva"
        lines = ["Recibimos un pedido para restablecer tu contraseña. El link vence en 30 minutos y sirve una sola vez.",
                 "Si no lo pediste, ignorá este mensaje: tu contraseña no cambia."]
    elif item.template == "password_changed":
        subject, label = "Tu contraseña de MiTurno cambió", None
        lines = ["La contraseña de tu cuenta se cambió y se cerraron todas las sesiones abiertas.",
                 f"Si no fuiste vos, recuperá el acceso en {recover} y avisá a soporte."]
    else:
        subject, label = "Intento de registro en MiTurno", None
        lines = ["Alguien intentó crear una cuenta de MiTurno con este email, pero ya tenés una.",
                 f"Si fuiste vos y no recordás tu contraseña, recuperala en {recover}. Si no, ignorá este mensaje."]
    text = "\n\n".join([lines[0], *([link] if link else []), *lines[1:]])
    html = "".join([f"<p>{escape(lines[0])}</p>",
                    *([f'<p><a href="{escape(link, quote=True)}">{escape(label)}</a></p>'] if link else []),
                    *(f"<p>{escape(line)}</p>" for line in lines[1:])])
    return subject, text, html
