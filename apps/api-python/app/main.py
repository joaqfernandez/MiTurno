"""Monolito modular FastAPI. Arranque sin modificar el esquema de la base."""
from collections import OrderedDict, deque
from contextlib import asynccontextmanager
import logging
from pathlib import Path
from threading import Lock
import time
import httpx
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from .config import Settings
from .database import Database
from .payments import MercadoPago
from .calendar import GoogleCalendar
from . import auth, patients, doctors, appointments, medical_records, payments, calendar, admin

logger = logging.getLogger("miturno.api")

def create_app(database_path: Path | None = None, secret: str | None = None, *, settings: Settings | None = None, payment_provider=None, calendar_provider=None):
    settings = settings or (Settings(f"sqlite:///{database_path}", secret) if database_path is not None and secret else Settings.load())
    database = Database(settings.database_url)
    provider = payment_provider or MercadoPago(settings)
    google = calendar_provider or GoogleCalendar(settings)
    @asynccontextmanager
    async def lifespan(app):
        yield
        database.engine.dispose()
        if hasattr(provider, "client"):
            provider.client.close()
        if hasattr(google, "client"):
            google.client.close()
    app = FastAPI(title="MiTurno API", version="1.0.0", lifespan=lifespan)
    app.state.database, app.state.settings = database, settings
    app.state.payment_provider, app.state.calendar_provider = provider, google
    app.add_middleware(CORSMiddleware, allow_origins=[settings.web_url], allow_credentials=True, allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"], allow_headers=["Authorization", "Content-Type"])

    attempts, mutex = OrderedDict(), Lock()
    @app.middleware("http")
    async def rate_limit(request, call_next):
        # Límite por proceso; desplegar un único worker API o agregar límite en proxy.
        if request.url.path.startswith(("/api/auth/", "/api/appointments/availability/", "/api/doctors")):
            key = (request.client.host if request.client else "unknown", request.url.path.split("/")[2])
            cap = 30 if key[1] == "auth" else 240
            stamp = time.monotonic()
            with mutex:
                bucket = attempts.setdefault(key, deque())
                attempts.move_to_end(key)
                while bucket and bucket[0] < stamp - 60:
                    bucket.popleft()
                if len(bucket) >= cap:
                    return JSONResponse(status_code=429, content={"message": "Demasiadas solicitudes; intentá en un minuto"}, headers={"Retry-After": "60"})
                bucket.append(stamp)
                if len(attempts) > 10000:
                    attempts.popitem(last=False)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_error(_request, error):
        return JSONResponse(status_code=400, content={"statusCode": 400, "message": [f'{".".join(map(str, item["loc"]))}: {item["msg"]}' for item in error.errors()]})

    @app.exception_handler(IntegrityError)
    async def integrity_error(_request, _error):
        return JSONResponse(status_code=409, content={"message": "Los datos entran en conflicto con un registro existente"})

    @app.exception_handler(httpx.HTTPError)
    async def provider_error(_request, error):
        logger.warning("provider_error type=%s", type(error).__name__)
        return JSONResponse(status_code=502, content={"message": "El proveedor externo no respondió correctamente; intentá nuevamente"})

    @app.get("/api/health")
    def health():
        with database.engine.connect() as connection:
            connection.execute(text("SELECT version_num FROM alembic_version"))
        return {"status": "ok", "backend": "python"}

    for module in (auth, patients, doctors, appointments, medical_records, payments, calendar, admin):
        app.include_router(module.router)
    return app
