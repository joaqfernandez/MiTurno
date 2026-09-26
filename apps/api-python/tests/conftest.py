from datetime import datetime, timedelta, timezone
from pathlib import Path
import re
from types import SimpleNamespace
import secrets
import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import select
from app.config import Settings
from app.database import Database
from app.main import create_app
from app.models import User, Patient, Doctor, Specialty, Schedule
from app.auth import passwords, issue_tokens
from app.worker import run_one

SECRET = "test-only-secret-with-at-least-64-bytes-for-all-tested-hmac-algorithms"
PASSWORD = "Test-password123"
ROOT = Path(__file__).resolve().parents[1]


def migrate(url):
    config = Config(str(ROOT / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
    command.upgrade(config, "head")


class FakePayments:
    configured = True
    fail_checkout = False
    refunds = []
    details = {}

    def __init__(self):
        self.refunds, self.details = [], {}

    def checkout(self, payment_id, amount, currency, email):
        if self.fail_checkout:
            import httpx
            raise httpx.ConnectError("provider down")
        return {"id": f"pref-{payment_id}", "url": "https://example.com/checkout"}

    def payment(self, external_id):
        return self.details

    def refund(self, external_id, key):
        self.refunds.append((external_id, key))


@pytest.fixture(scope="session")
def password_hash():
    return passwords.hash(PASSWORD)


@pytest.fixture
def system(tmp_path, password_hash):
    settings = Settings(f"sqlite:///{tmp_path / 'test.sqlite3'}", SECRET, mp_webhook_secret="test-webhook-secret", encryption_key="12" * 32)
    migrate(settings.database_url)
    database = Database(settings.database_url)
    provider = FakePayments()
    with database.transaction() as db:
        specialty = Specialty(id="specialty", name="Clínica", slug="clinica")
        db.add(specialty)
        for name, role in [("own", "PATIENT"), ("other", "PATIENT"), ("doctor", "DOCTOR"), ("admin", "ADMIN")]:
            db.add(User(id=f"user-{name}", email=f"{name}@example.com", passwordHash=password_hash, roles=[role], status="ACTIVE", emailVerifiedAt=datetime.now(timezone.utc)))
        db.flush()
        db.add_all([
            Patient(id="patient-own", userId="user-own", firstName="Ana", lastName="Castro", documentId="12345678", birthDate=datetime(1990, 1, 1, tzinfo=timezone.utc), healthInsurance="Original", insuranceNumber="ABC"),
            Patient(id="patient-other", userId="user-other", firstName="Otro", lastName="Paciente", documentId="87654321"),
            Doctor(id="doctor", userId="user-doctor", firstName="Valeria", lastName="Roldán", licenseNumber="DEMO", specialtyIds=["specialty"], icsFeedToken="test-feed-token"),
        ])
        db.flush()
        for day in range(7):
            db.add(Schedule(doctorId="doctor", weekday=day, startTime="09:00", endTime="13:00"))
        tokens = {name: issue_tokens(db, db.get(User, f"user-{name}"), settings) for name in ("own", "other", "doctor", "admin")}
    app = create_app(settings=settings, payment_provider=provider)
    with TestClient(app) as client:
        yield SimpleNamespace(client=client, database=database, settings=settings, provider=provider, tokens=tokens,
                              headers=lambda name="own": {"Authorization": f"Bearer {tokens[name]['accessToken']}"})
    database.engine.dispose()


def future_slots(system):
    start = datetime.now(timezone.utc) + timedelta(days=2)
    end = start + timedelta(days=2)
    response = system.client.get(f"/api/appointments/availability/doctor", params={"from": start.isoformat(), "to": end.isoformat()})
    assert response.status_code == 200, response.text
    return response.json()


def reserve(system, name="own", start=None):
    return system.client.post("/api/appointments", headers=system.headers(name), json={"doctorId": "doctor", "startAt": start or future_slots(system)[0]["startAt"]})


def deliver_emails(system, directory):
    """Procesa la cola con el buzón local de desarrollo y devuelve los emails entregados, del más viejo al más nuevo."""
    system.settings.mailbox_dir = str(directory)
    state = system.client.app.state
    while run_one(system.database, system.settings, state.payment_provider, state.calendar_provider):
        pass
    emails = []
    for path in sorted(Path(directory).glob("*.txt"), key=lambda item: item.stat().st_mtime_ns):
        head, _, body = path.read_text(encoding="utf-8").partition("\n\n")
        to, subject = (line.split(": ", 1)[1] for line in head.splitlines())
        emails.append(SimpleNamespace(to=to, subject=subject, body=body))
    return emails


def link_token(email, page):
    match = re.search(rf"/{page}#token=([A-Za-z0-9_-]+)", email.body)
    assert match, email.body
    return match.group(1)
