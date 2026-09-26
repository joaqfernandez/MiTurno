"""Registro, login y refresh rotativo: identidad siempre consultada en la DB."""
from datetime import timedelta
import secrets
import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, InvalidHashError
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select, update
from .account import consume, digest, invalidate_tokens, lock_user, request_email
from .dependencies import session, current_user
from .models import User, Patient, Doctor, RefreshToken, AuditLog, now
from .schemas import Register, Login, Refresh, EmailOnly, AccountLink, PasswordReset, check_password

router = APIRouter(prefix="/api/auth", tags=["Autenticación"])
passwords = PasswordHasher()
# Se verifica contra este hash cuando la cuenta no existe: el login tarda lo mismo y no revela emails.
DUMMY_HASH = passwords.hash(secrets.token_urlsafe(16))
# Respuestas idénticas exista o no la cuenta: nadie puede averiguar quién usa MiTurno.
REGISTERED = "Si el email es válido, te enviamos un link para confirmar la cuenta. Revisá tu correo."
RESET_REQUESTED = "Si hay una cuenta con ese email, te enviamos un link para restablecer la contraseña."
VERIFICATION_REQUESTED = "Si la cuenta existe y falta confirmarla, te enviamos un nuevo link."


def can_sign_in(user):
    return user.status == "ACTIVE" and user.emailVerifiedAt is not None


def user_payload(db, user):
    patient = db.scalar(select(Patient).where(Patient.userId == user.id))
    doctor = db.scalar(select(Doctor).where(Doctor.userId == user.id))
    profile = doctor or patient
    return {"id": user.id, "email": user.email, "roles": user.roles, "status": user.status,
            "name": f"{profile.firstName} {profile.lastName}" if profile else user.email,
            "patientProfileId": patient.id if patient else None, "doctorProfileId": doctor.id if doctor else None}

def issue_tokens(db, user, settings):
    payload = user_payload(db, user)
    if not can_sign_in(user):
        return {"accessToken": None, "refreshToken": None, "user": payload}
    raw = secrets.token_urlsafe(48)
    db.add(RefreshToken(userId=user.id, tokenHash=digest(raw), expiresAt=now() + timedelta(days=30)))
    token = jwt.encode({"sub": user.id, "pid": payload["patientProfileId"], "did": payload["doctorProfileId"],
                       "sv": user.sessionVersion, "iat": now(), "exp": now() + timedelta(seconds=settings.access_ttl)}, settings.secret, algorithm="HS256")
    return {"accessToken": token, "refreshToken": raw, "user": payload}

@router.post("/register", status_code=202)
def register(body: Register, db=Depends(session)):
    email = str(body.email).lower()
    # Se calcula siempre: mismo costo exista o no la cuenta.
    password_hash = passwords.hash(body.password)
    existing = lock_user(db, email=email)
    if existing:
        # El dueño real recibe un aviso; quien registra ve la misma respuesta que con un email nuevo.
        request_email(db, existing, "account_exists")
        return {"message": REGISTERED}
    user = User(email=email, passwordHash=password_hash, phone=body.phone,
                roles=[body.role], status="ACTIVE" if body.role == "PATIENT" else "PENDING_VERIFICATION")
    db.add(user)
    db.flush()
    fields = dict(userId=user.id, firstName=body.firstName, lastName=body.lastName)
    db.add(Patient(**fields) if body.role == "PATIENT" else Doctor(**fields, licenseNumber=body.licenseNumber, icsFeedToken=secrets.token_urlsafe(32)))
    db.flush()
    request_email(db, user, "email_verification")
    return {"message": REGISTERED}

@router.post("/login")
def login(body: Login, request: Request, db=Depends(session)):
    user = lock_user(db, email=str(body.email).lower())
    try:
        valid = passwords.verify(user.passwordHash if user and user.passwordHash else DUMMY_HASH, body.password)
    except (VerificationError, InvalidHashError):
        valid = False
    if not valid or user is None or not user.passwordHash:
        raise HTTPException(401, "Credenciales inválidas")
    if user.emailVerifiedAt is None:
        # Solo se informa con la contraseña correcta, así que no revela cuentas.
        return JSONResponse(status_code=403, content={"message": "Confirmá tu email para ingresar. Revisá tu correo o pedí un nuevo link.", "code": "EMAIL_NOT_VERIFIED"})
    if user.status != "ACTIVE":
        raise HTTPException(403, "Cuenta pendiente de verificación o suspendida")
    return issue_tokens(db, user, request.app.state.settings)

@router.post("/refresh")
def refresh(body: Refresh, request: Request, db=Depends(session)):
    stored = db.scalar(select(RefreshToken).where(RefreshToken.tokenHash == digest(body.refreshToken)))
    if not stored:
        raise HTTPException(401, "Refresh inválido")
    # Orden de locks compartido con suspensión: usuario antes de refresh.
    user = db.scalar(select(User).where(User.id == stored.userId).with_for_update().execution_options(populate_existing=True))
    if user is None or not can_sign_in(user):
        raise HTTPException(403, "La cuenta no está activa", headers={"X-Session-Invalid": "1"})
    consumed = db.execute(update(RefreshToken).where(RefreshToken.id == stored.id, RefreshToken.revokedAt.is_(None), RefreshToken.expiresAt > now()).values(revokedAt=now()))
    if consumed.rowcount != 1:
        raise HTTPException(401, "Refresh vencido o utilizado")
    return issue_tokens(db, user, request.app.state.settings)

@router.post("/logout")
def logout(body: Refresh, principal=Depends(current_user), db=Depends(session)):
    db.execute(update(RefreshToken).where(RefreshToken.tokenHash == digest(body.refreshToken), RefreshToken.userId == principal.user.id).values(revokedAt=now()))
    return {"ok": True}

@router.post("/password/forgot", status_code=202)
def forgot_password(body: EmailOnly, db=Depends(session)):
    user = lock_user(db, email=str(body.email).lower())
    if user and user.status != "SUSPENDED":
        request_email(db, user, "password_reset")
    return {"message": RESET_REQUESTED}

@router.post("/password/reset")
def reset_password(body: PasswordReset, request: Request, db=Depends(session)):
    user = consume(db, "password_reset", body.token)
    # Si la contraseña se rechaza, la excepción revierte la transacción y el link sigue sirviendo.
    try:
        check_password(body.password, user.email)
    except ValueError as error:
        raise HTTPException(400, str(error)) from None
    user.passwordHash = passwords.hash(body.password)
    # Cierra todas las sesiones (incluidas las de quien haya tenido acceso antes) y anula otros links.
    user.sessionVersion += 1
    db.execute(update(RefreshToken).where(RefreshToken.userId == user.id, RefreshToken.revokedAt.is_(None)).values(revokedAt=now()))
    invalidate_tokens(db, user.id)
    # Abrir el link del email prueba que la persona controla la casilla.
    user.emailVerifiedAt = user.emailVerifiedAt or now()
    db.add(AuditLog(userId=user.id, action="user.password_reset", entity="User", entityId=user.id, ip=request.client.host if request.client else None))
    request_email(db, user, "password_changed", limited=False)
    return {"message": "Tu contraseña se actualizó. Ingresá con la contraseña nueva."}

@router.post("/email/verify")
def verify_email(body: AccountLink, request: Request, db=Depends(session)):
    user = consume(db, "email_verification", body.token)
    if user.emailVerifiedAt is None:
        user.emailVerifiedAt = now()
        db.add(AuditLog(userId=user.id, action="user.email_verified", entity="User", entityId=user.id, ip=request.client.host if request.client else None))
    return {"message": "Tu email quedó confirmado. Ya podés ingresar."}

@router.post("/email/resend", status_code=202)
def resend_verification(body: EmailOnly, db=Depends(session)):
    user = lock_user(db, email=str(body.email).lower())
    if user and user.emailVerifiedAt is None and user.status != "SUSPENDED":
        request_email(db, user, "email_verification")
    return {"message": VERIFICATION_REQUESTED}
