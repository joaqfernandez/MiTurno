"""Aplicación de la prueba: GET/PATCH /api/patients/me."""

import os
from pathlib import Path
import sqlite3

from fastapi import Depends, FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .auth import Identity, authenticate
from .database import Database
from .patients import UpdatePatient, patient_response


def create_app(database_path: Path | None = None, secret: str | None = None) -> FastAPI:
    jwt_secret = secret if secret is not None else os.environ.get("JWT_ACCESS_SECRET", "")
    if len(jwt_secret.encode()) < 32:
        raise ValueError("JWT_ACCESS_SECRET debe tener al menos 32 bytes")

    default_path = Path(__file__).resolve().parents[1] / ".data" / "pilot.sqlite3"
    database = Database(database_path if database_path is not None else default_path)
    database.initialize()
    app = FastAPI(title="MiTurno — prueba Python", version="0.1.0")
    bearer = HTTPBearer(auto_error=False)

    def current_patient(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
        if credentials is None:
            raise HTTPException(401, "Se requiere Bearer JWT", headers={"WWW-Authenticate": "Bearer"})
        return authenticate(credentials.credentials, jwt_secret)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_request, error):
        # Igual que Nest: 400, y sin devolver el body original ni sus datos sensibles.
        messages = [f'{".".join(map(str, item["loc"]))}: {item["msg"]}' for item in error.errors()]
        return JSONResponse(status_code=400, content={"statusCode": 400, "message": messages})

    @app.exception_handler(PermissionError)
    async def permission_error(_request, _error):
        return JSONResponse(status_code=403, content={"detail": "No tenés acceso a este perfil"})

    @app.get("/api/patients/me")
    def get_me(identity: Identity = Depends(current_patient)):
        return patient_response(database.get_patient(identity.user_id, identity.patient_id))

    @app.patch("/api/patients/me")
    def update_me(body: UpdatePatient, identity: Identity = Depends(current_patient)):
        # exclude_unset conserva los campos que el cliente no mandó.
        changes = body.model_dump(exclude_unset=True)
        try:
            patient = database.update_patient(identity.user_id, identity.patient_id, changes)
        except sqlite3.IntegrityError:
            raise HTTPException(409, "El documento ya está en uso o los datos entran en conflicto") from None
        return patient_response(patient)

    return app
