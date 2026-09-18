"""Valida el Bearer JWT; la propiedad del perfil se vuelve a verificar en la DB."""

from dataclasses import dataclass

import jwt
from fastapi import HTTPException


@dataclass(frozen=True)
class Identity:
    user_id: str
    patient_id: str


def authenticate(token: str, secret: str) -> Identity:
    try:
        claims = jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            options={"require": ["sub", "exp"]},
        )
        if not isinstance(claims["sub"], str) or not claims["sub"]:
            raise jwt.InvalidTokenError("sub inválido")
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=401,
            detail="Token inválido o vencido",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None

    patient_id = claims.get("pid")
    if not isinstance(patient_id, str) or not patient_id:
        raise HTTPException(status_code=403, detail="La sesión no tiene perfil de paciente")
    return Identity(user_id=claims["sub"], patient_id=patient_id)
