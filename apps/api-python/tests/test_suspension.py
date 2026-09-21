"""La suspensión revoca credenciales, no solamente oculta acciones en la web."""
import jwt
import pytest
from sqlalchemy import select, func
from app.models import RefreshToken, User, AuditLog
from conftest import PASSWORD, reserve


def change_status(system, name, status):
    return system.client.patch(f'/api/admin/users/user-{name}/status',
        headers=system.headers('admin'), json={'status': status})


@pytest.mark.parametrize('name', ['own', 'doctor'])
def test_suspend_open_session_reactivate_requires_new_login(system, name):
    appointment = reserve(system).json()
    assert change_status(system, name, 'SUSPENDED').status_code == 200
    paths = ['/api/medical-records/patient-own', '/api/appointments/me']
    for path in paths:
        response = system.client.get(path, headers=system.headers(name))
        assert response.status_code == 403
        assert response.headers['X-Session-Invalid'] == '1'
    assert system.client.delete('/api/appointments/' + appointment['id'], headers=system.headers(name)).status_code == 403
    assert system.client.post('/api/medical-records/entries', headers=system.headers(name),
        json={'patientId': 'patient-own', 'title': 'A', 'content': 'B'}).status_code == 403
    credentials = {'email': f'{name}@example.com', 'password': PASSWORD}
    assert system.client.post('/api/auth/login', json=credentials).status_code == 403
    assert system.client.post('/api/auth/refresh', json={'refreshToken': system.tokens[name]['refreshToken']}).status_code == 403
    with system.database.transaction() as db:
        assert db.scalar(select(func.count()).select_from(RefreshToken).where(
            RefreshToken.userId == f'user-{name}', RefreshToken.revokedAt.is_(None))) == 0
        assert db.scalar(select(func.count()).select_from(AuditLog).where(AuditLog.action == 'user.status')) == 1
    assert change_status(system, name, 'ACTIVE').status_code == 200
    assert system.client.get('/api/medical-records/patient-own', headers=system.headers(name)).status_code == 401
    assert system.client.post('/api/auth/refresh', json={'refreshToken': system.tokens[name]['refreshToken']}).status_code == 401
    login = system.client.post('/api/auth/login', json=credentials)
    assert login.status_code == 200
    assert system.client.get('/api/medical-records/patient-own', headers={'Authorization': 'Bearer ' + login.json()['accessToken']}).status_code == 200


def test_only_admin_can_suspend_and_cannot_suspend_self(system):
    for name in ('own', 'doctor'):
        assert system.client.patch('/api/admin/users/user-other/status', headers=system.headers(name), json={'status':'SUSPENDED'}).status_code == 403
    assert change_status(system, 'admin', 'SUSPENDED').status_code == 400


def test_legacy_access_token_is_rejected(system):
    claims = jwt.decode(system.tokens['own']['accessToken'], system.settings.secret, algorithms=['HS256'])
    del claims['sv']
    token = jwt.encode(claims, system.settings.secret, algorithm='HS256')
    assert system.client.get('/api/medical-records/patient-own', headers={'Authorization':'Bearer '+token}).status_code == 401


def test_migration_revokes_old_credentials_without_changing_accounts(tmp_path):
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import text
    from app.config import Settings
    from app.database import Database
    from app.auth import issue_tokens
    from app.seed import seed
    from app.models import MedicalEntry, Appointment, OAuthRequest
    from app.google_auth import create_request
    from fastapi import Response
    from conftest import ROOT, SECRET
    settings = Settings(f"sqlite:///{tmp_path / 'migration.sqlite3'}", SECRET)
    config = Config(str(ROOT / 'alembic.ini'))
    config.set_main_option('sqlalchemy.url', settings.database_url)
    command.upgrade(config, 'head')
    database = Database(settings.database_url)
    seed(database, settings)
    with database.transaction() as db:
        user = db.scalar(select(User).where(User.email == 'ana@example.com'))
        issue_tokens(db, user, settings)
        create_request(db, 'session', Response(), settings, user.id)
        users = list(db.execute(select(User.id, User.email, User.status)))
        entries = list(db.execute(select(MedicalEntry.id, MedicalEntry.content)))
        appointments = list(db.execute(select(Appointment.id, Appointment.status)))
    command.downgrade(config, '0002')
    with database.engine.connect() as connection:
        assert connection.scalar(text('SELECT count(*) FROM refresh_tokens WHERE "revokedAt" IS NULL')) == 1
        assert connection.scalar(text('SELECT count(*) FROM oauth_requests')) == 1
    command.upgrade(config, 'head')
    with database.transaction() as db:
        assert list(db.execute(select(User.id, User.email, User.status))) == users
        assert list(db.execute(select(MedicalEntry.id, MedicalEntry.content))) == entries
        assert list(db.execute(select(Appointment.id, Appointment.status))) == appointments
        assert db.scalar(select(func.count()).select_from(RefreshToken).where(RefreshToken.revokedAt.is_(None))) == 0
        assert db.scalar(select(func.count()).select_from(OAuthRequest)) == 0
    database.engine.dispose()
