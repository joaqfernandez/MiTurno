"""Aceptación de términos y consentimiento para datos de salud.

Ninguna cuenta opera sin haber aceptado la versión vigente, sin importar cómo se creó (formulario o Google).
Al cambiar TERMS_VERSION todas las cuentas vuelven a aceptar en su próximo pedido.
"""
from .models import AuditLog, now

# Versión de los textos de docs/legal. Mientras diga «borrador» no pasaron por un abogado: ver docs/BETA.md, Fase 0.
TERMS_VERSION = "borrador-1"
MESSAGE = "Antes de continuar tenés que aceptar los términos y condiciones."


class AcceptanceRequired(Exception):
    def __init__(self, pending):
        self.pending = pending


def pending(user):
    """Qué le falta aceptar a esta cuenta: «terms» y, para pacientes, «healthData»."""
    roles = user.roles or []
    # El administrador opera la plataforma; no es usuario del servicio ni carga datos de salud.
    if "ADMIN" in roles:
        return []
    missing = []
    if user.termsVersion != TERMS_VERSION or user.termsAcceptedAt is None:
        missing.append("terms")
    if "PATIENT" in roles and user.healthDataConsentAt is None:
        missing.append("healthData")
    return missing


def record(db, user, accept_terms, accept_health_data, ip=None):
    """Guarda lo aceptado, con fecha y versión, y lo deja en la auditoría (que no se puede modificar)."""
    accepted = []
    if accept_terms is True and "terms" in pending(user):
        user.termsVersion, user.termsAcceptedAt = TERMS_VERSION, now()
        accepted.append("terms")
    if accept_health_data is True and "PATIENT" in (user.roles or []) and user.healthDataConsentAt is None:
        user.healthDataConsentAt = now()
        accepted.append("healthData")
    if accepted:
        db.add(AuditLog(userId=user.id, action="user.terms_accepted", entity="User", entityId=user.id,
                        details={"version": TERMS_VERSION, "accepted": accepted}, ip=ip))
    return pending(user)
