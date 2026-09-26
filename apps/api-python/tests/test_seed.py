from dataclasses import replace
import pytest
from sqlalchemy import select, func
from app.seed import seed, PASSWORD
from app.models import User, Patient, Appointment, MedicalEntry, Job
from app.auth import passwords
from app.config import Settings
from app.database import Database
from conftest import migrate, SECRET


def test_seed_is_persistent_and_does_not_overwrite_edits(tmp_path):
    settings = Settings(f"sqlite:///{tmp_path / 'seed.sqlite3'}", SECRET)
    migrate(settings.database_url)
    database = Database(settings.database_url)
    assert seed(database, settings) is True
    with database.transaction() as db:
        user = db.scalar(select(User).where(User.email == "ana@example.com"))
        assert passwords.verify(user.passwordHash, PASSWORD)
        patient = db.scalar(select(Patient).where(Patient.userId == user.id))
        patient.firstName = "Nombre editado"
        assert db.scalar(select(func.count()).select_from(Appointment)) == 3
        assert db.scalar(select(func.count()).select_from(MedicalEntry)) == 1
        assert db.scalar(select(func.count()).select_from(Job)) == 0
    assert seed(database, settings) is False
    with database.transaction() as db:
        assert db.scalar(select(func.count()).select_from(Appointment)) == 3
        assert db.scalar(select(Patient.firstName).where(Patient.userId == user.id)) == "Nombre editado"

    database.engine.dispose()

def test_seed_rejects_production_before_writing(system):
    settings = replace(system.settings, environment="production", database_url="postgresql://unused", web_url="https://example.com", api_url="https://api.example.com", resend_api_key="re_test", email_from="MiTurno <no-reply@example.com>", mailbox_dir="")
    with pytest.raises(ValueError, match="producción"):
        seed(system.database, settings)
    with system.database.transaction() as db:
        assert db.scalar(select(User.id).where(User.email == "ana@example.com")) is None
