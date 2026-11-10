"""Crea la cuenta del administrador desde el servidor. No existe ninguna ruta web que cree administradores.

Uso: python -m app.create_admin persona@dominio.com

La cuenta nace sin contraseña: se envía a ese email el link de un solo uso para elegirla (vence en 30 minutos).
Así la contraseña nunca pasa por la terminal, los logs ni otra persona. El worker debe estar corriendo para enviarlo.
"""
import sys
from email_validator import EmailNotValidError, validate_email
from .account import lock_user, request_email
from .config import Settings
from .database import Database
from .models import AuditLog, User


def create_admin(database, email):
    """Devuelve un mensaje para mostrar. Lanza ValueError si el email no sirve o ya pertenece a otra cuenta."""
    try:
        email = validate_email(email.strip(), check_deliverability=False).normalized.lower()
    except EmailNotValidError:
        raise ValueError("El email no es válido") from None
    with database.transaction() as db:
        user = lock_user(db, email=email)
        if user and "ADMIN" not in user.roles:
            # Una cuenta de paciente o médico no se convierte en administradora: son identidades separadas.
            raise ValueError("Ese email ya pertenece a una cuenta de paciente o médico; usá otro email para administrar")
        if user and user.status != "ACTIVE":
            raise ValueError("Esa cuenta administradora está suspendida")
        if user is None:
            user = User(email=email, passwordHash=None, roles=["ADMIN"], status="ACTIVE")
            db.add(user)
            db.flush()
            db.add(AuditLog(userId=None, action="user.admin_created", entity="User", entityId=user.id, details={"source": "create_admin"}))
            created = True
        else:
            created = False
        request_email(db, user, "password_reset", limited=False)
    return (f"Administrador creado: {email}." if created else f"{email} ya era administrador.") + \
        " Se envió el link para elegir la contraseña (vence 30 minutos después de enviado)."


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Uso: python -m app.create_admin persona@dominio.com")
    settings = Settings.load()
    database = Database(settings.database_url)
    try:
        print(create_admin(database, sys.argv[1]))
    except ValueError as error:
        raise SystemExit(str(error)) from None
    finally:
        database.engine.dispose()


if __name__ == "__main__":
    main()
