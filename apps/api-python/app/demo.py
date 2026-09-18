"""Crea un paciente ficticio y emite un token local. No es un endpoint de login."""

from datetime import datetime, timedelta, timezone
import os
from pathlib import Path

import jwt

from .database import Database


def main():
    secret = os.environ.get("JWT_ACCESS_SECRET", "")
    if len(secret.encode()) < 32:
        raise SystemExit("Definí JWT_ACCESS_SECRET con al menos 32 bytes antes de continuar")
    database = Database(Path(__file__).resolve().parents[1] / ".data" / "pilot.sqlite3")
    database.initialize()
    now = datetime.now(timezone.utc)
    timestamp = now.isoformat(timespec="milliseconds").replace("+00:00", "Z")
    with database.connect() as connection:
        # Volver a ejecutar conserva las ediciones hechas desde la API.
        connection.execute("INSERT OR IGNORE INTO users VALUES (?, ?, ?)", ("demo-user", '["PATIENT"]', "ACTIVE"))
        connection.execute(
            """INSERT OR IGNORE INTO patient_profiles
               (id, userId, firstName, lastName, birthDate, createdAt, updatedAt)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            ("demo-patient", "demo-user", "Ana", "Ejemplo", "1990-01-01", timestamp, timestamp),
        )
    token = jwt.encode({"sub": "demo-user", "pid": "demo-patient", "iat": now, "exp": now + timedelta(minutes=15)}, secret, algorithm="HS256")
    print("Paciente ficticio listo. En /docs → Authorize pegá este token (vence en 15 minutos):")
    print(token)


if __name__ == "__main__":
    main()
