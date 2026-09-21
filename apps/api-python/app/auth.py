"""Registro, login y refresh rotativo: identidad siempre consultada en la DB."""
from datetime import timedelta
import hashlib
import secrets
import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, InvalidHashError
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, update
from .dependencies import session, current_user
from .models import User, Patient, Doctor, RefreshToken, now
from .schemas import Register, Login, Refresh

router = APIRouter(prefix="/api/auth", tags=["Autenticación"])
passwords = PasswordHasher()

def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()

def user_payload(db, user):
    patient = db.scalar(select(Patient).where(Patient.userId == user.id))
    doctor = db.scalar(select(Doctor).where(Doctor.userId == user.id))
    profile = doctor or patient
    return {"id": user.id, "email": user.email, "roles": user.roles, "status": user.status,
            "name": f"{profile.firstName} {profile.lastName}" if profile else user.email,
            "patientProfileId": patient.id if patient else None, "doctorProfileId": doctor.id if doctor else None}

def issue_tokens(db, user, settings):
    payload = user_payload(db, user)
    if user.status != "ACTIVE":
        return {"accessToken": None, "refreshToken": None, "user": payload}
    raw = secrets.token_urlsafe(48)
    db.add(RefreshToken(userId=user.id, tokenHash=digest(raw), expiresAt=now() + timedelta(days=30)))
    token = jwt.encode({"sub": user.id, "pid": payload["patientProfileId"], "did": payload["doctorProfileId"],
                       "sv": user.sessionVersion, "iat": now(), "exp": now() + timedelta(seconds=settings.access_ttl)}, settings.secret, algorithm="HS256")
    return {"accessToken": token, "refreshToken": raw, "user": payload}

@router.post("/register", status_code=201)
def register(body: Register, request: Request, db=Depends(session)):
    email = str(body.email).lower()
    if db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(409, "El email ya está registrado")
    user = User(email=email, passwordHash=passwords.hash(body.password), phone=body.phone,
                roles=[body.role], status="ACTIVE" if body.role == "PATIENT" else "PENDING_VERIFICATION")
    db.add(user)
    db.flush()
    fields = dict(userId=user.id, firstName=body.firstName, lastName=body.lastName)
    db.add(Patient(**fields) if body.role == "PATIENT" else Doctor(**fields, licenseNumber=body.licenseNumber, icsFeedToken=secrets.token_urlsafe(32)))
    db.flush()
    return issue_tokens(db, user, request.app.state.settings)

@router.post("/login")
def login(body: Login, request: Request, db=Depends(session)):
    user = db.scalar(select(User).where(User.email == str(body.email).lower()).with_for_update())
    try:
        if user is None or not user.passwordHash or not passwords.verify(user.passwordHash, body.password):
            raise HTTPException(401, "Credenciales inválidas")
    except (VerificationError, InvalidHashError):
        raise HTTPException(401, "Credenciales inválidas") from None
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
    if user is None or user.status != "ACTIVE":
        raise HTTPException(403, "La cuenta no está activa", headers={"X-Session-Invalid": "1"})
    consumed = db.execute(update(RefreshToken).where(RefreshToken.id == stored.id, RefreshToken.revokedAt.is_(None), RefreshToken.expiresAt > now()).values(revokedAt=now()))
    if consumed.rowcount != 1:
        raise HTTPException(401, "Refresh vencido o utilizado")
    return issue_tokens(db, user, request.app.state.settings)

@router.post("/logout")
def logout(body: Refresh, principal=Depends(current_user), db=Depends(session)):
    db.execute(update(RefreshToken).where(RefreshToken.tokenHash == digest(body.refreshToken), RefreshToken.userId == principal.user.id).values(revokedAt=now()))
    return {"ok": True}
