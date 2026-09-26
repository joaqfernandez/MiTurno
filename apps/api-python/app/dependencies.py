from dataclasses import dataclass
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt
from sqlalchemy import select
from .models import User, Patient, Doctor

bearer = HTTPBearer(auto_error=False)


def session(request: Request):
    with request.app.state.database.transaction() as db:
        yield db


@dataclass
class Principal:
    user: User
    patient: Patient | None
    doctor: Doctor | None


def current_user(request: Request, credentials: HTTPAuthorizationCredentials | None = Depends(bearer), db=Depends(session)):
    if not credentials:
        raise HTTPException(401, "Se requiere iniciar sesión", headers={"WWW-Authenticate": "Bearer"})
    try:
        claims = jwt.decode(credentials.credentials, request.app.state.settings.secret, algorithms=["HS256"], options={"require": ["sub", "exp"]})
        user = db.get(User, claims["sub"])
    except (jwt.InvalidTokenError, TypeError):
        raise HTTPException(401, "Sesión inválida o vencida") from None
    if user is None:
        raise HTTPException(401, "Sesión inválida")
    if user.status != "ACTIVE" or user.emailVerifiedAt is None:
        raise HTTPException(403, "La cuenta no está activa", headers={"X-Session-Invalid": "1"})
    if type(claims.get("sv")) is not int or claims["sv"] != user.sessionVersion:
        raise HTTPException(401, "Sesión revocada", headers={"X-Session-Invalid": "1"})
    return Principal(user, db.scalar(select(Patient).where(Patient.userId == user.id)), db.scalar(select(Doctor).where(Doctor.userId == user.id)))


def patient_user(user=Depends(current_user)):
    if user.patient is None:
        raise HTTPException(403, "Se requiere perfil de paciente")
    return user


def doctor_user(user=Depends(current_user)):
    if user.doctor is None:
        raise HTTPException(403, "Se requiere perfil de médico")
    return user


def admin_user(user=Depends(current_user)):
    if "ADMIN" not in user.user.roles:
        raise HTTPException(403, "Se requiere administrador")
    return user
