"""Persistencia SQLite exclusiva de la prueba; no accede al PostgreSQL del proyecto."""

from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
import sqlite3


EDITABLE_FIELDS = (
    "firstName", "lastName", "documentId", "birthDate",
    "healthInsurance", "insuranceNumber",
)


class Database:
    def __init__(self, path: Path):
        self.path = path

    @contextmanager
    def connect(self):
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        try:
            # Commit si termina bien; rollback si ocurre un error.
            with connection:
                yield connection
        finally:
            connection.close()

    def initialize(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as connection:
            connection.executescript("""
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    roles TEXT NOT NULL,
                    status TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS patient_profiles (
                    id TEXT PRIMARY KEY,
                    userId TEXT NOT NULL UNIQUE REFERENCES users(id),
                    firstName TEXT NOT NULL,
                    lastName TEXT NOT NULL,
                    documentId TEXT UNIQUE,
                    birthDate TEXT,
                    healthInsurance TEXT,
                    insuranceNumber TEXT,
                    createdAt TEXT NOT NULL,
                    updatedAt TEXT NOT NULL
                );
            """)

    def _owned_patient(self, connection, user_id: str, patient_id: str):
        row = connection.execute(
            """SELECT p.* FROM patient_profiles p
               JOIN users u ON u.id = p.userId
               WHERE p.id = ? AND p.userId = ? AND u.status = 'ACTIVE'""",
            (patient_id, user_id),
        ).fetchone()
        if row is None:
            raise PermissionError("No tenés acceso a este perfil de paciente")
        return dict(row)

    def get_patient(self, user_id: str, patient_id: str):
        with self.connect() as connection:
            return self._owned_patient(connection, user_id, patient_id)

    def update_patient(self, user_id: str, patient_id: str, changes: dict):
        # Segunda defensa: solo nombres de columnas constantes, nunca SQL del cliente.
        allowed = {name: changes[name] for name in EDITABLE_FIELDS if name in changes}
        with self.connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            self._owned_patient(connection, user_id, patient_id)
            if allowed:
                allowed["updatedAt"] = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
                assignments = ", ".join(f'"{name}" = ?' for name in allowed)
                connection.execute(
                    f"UPDATE patient_profiles SET {assignments} WHERE id = ? AND userId = ?",
                    (*allowed.values(), patient_id, user_id),
                )
            return self._owned_patient(connection, user_id, patient_id)
