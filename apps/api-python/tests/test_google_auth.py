from datetime import timedelta
from types import SimpleNamespace
from urllib.parse import urlsplit, parse_qs
import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from sqlalchemy import select, func, update
from app.google_auth import GoogleLogin, create_request, consume_request
from app.models import User, Patient, OAuthRequest, now
from fastapi import Response


@pytest.fixture(scope="module")
def signing_key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture
def google(system, signing_key):
    system.settings.google_client_id = "test-client"
    system.settings.google_client_secret = "test-secret"
    case = SimpleNamespace(system=system, nonce="", changes={}, calls=0, signing_key=signing_key)
    def transport(request):
        case.calls += 1
        claims = {"sub": "google-subject", "iss": "https://accounts.google.com", "aud": "test-client",
                  "iat": now(), "exp": now() + timedelta(minutes=10), "nonce": case.nonce,
                  "email": "google@example.com", "email_verified": True, "given_name": "Ana", "family_name": "Google"}
        claims.update(case.changes)
        token = jwt.encode(claims, case.signing_key, algorithm="RS256", headers={"kid": "test-key"})
        return httpx.Response(200, json={"id_token": token})
    keys = SimpleNamespace(get_signing_key_from_jwt=lambda token: SimpleNamespace(key=signing_key.public_key()))
    provider = GoogleLogin(system.settings, transport=httpx.MockTransport(transport), keys=keys)
    system.client.app.state.login_provider.client.close()
    system.client.app.state.login_provider = provider
    yield case
    provider.client.close()


def begin(google, role=None):
    client = google.system.client
    response = client.post('/api/auth/google/link', headers=google.system.headers(role)) if role else client.get('/api/auth/google/start', follow_redirects=False)
    url = response.json()['url'] if role else response.headers['location']
    query = parse_qs(urlsplit(url).query)
    google.nonce = query['nonce'][0]
    assert query['scope'] == ['openid email profile']
    assert 'HttpOnly' in response.headers['set-cookie']
    return query['state'][0]


def callback(google, state, **extra):
    return google.system.client.get('/api/auth/google/callback', params={'state': state, 'code': 'test-code', **extra}, follow_redirects=False)


def complete(google, origin=None):
    return google.system.client.post('/api/auth/google/complete', headers={'Origin': origin or google.system.settings.web_url})


def test_new_patient_login_refresh_and_no_duplicate(google):
    state = begin(google)
    response = callback(google, state)
    assert response.headers['location'].endswith('/auth/google/callback')
    assert 'accessToken' not in response.headers['location']
    auth = complete(google).json()
    assert auth['user']['roles'] == ['PATIENT'] and auth['user']['patientProfileId']
    assert auth['refreshToken']
    assert google.system.client.post('/api/auth/refresh', json={'refreshToken': auth['refreshToken']}).status_code == 200
    assert complete(google).status_code == 401
    callback(google, begin(google))
    assert complete(google).json()['user']['id'] == auth['user']['id']
    with google.system.database.transaction() as db:
        assert db.scalar(select(func.count()).select_from(User).where(User.googleSubject == 'google-subject')) == 1
        assert db.scalar(select(User).where(User.googleSubject == 'google-subject')).passwordHash is None


@pytest.mark.parametrize('role', ['own', 'doctor', 'admin'])
def test_existing_account_requires_link_and_preserves_profiles(google, role):
    google.changes['email'] = f'{role}@example.com'
    assert callback(google, begin(google)).headers['location'].endswith('google=account')
    assert complete(google).status_code == 401
    assert callback(google, begin(google, role)).headers['location'].endswith('/auth/google/callback')
    auth = complete(google).json()
    assert auth['user'] == google.system.tokens[role]['user']
    callback(google, begin(google))
    assert complete(google).json()['user']['id'] == f'user-{role}'


@pytest.mark.parametrize('changes', [
    {'email_verified': False}, {'email_verified': 'true'}, {'nonce': 'wrong'},
    {'aud': 'other-client'}, {'iss': 'https://attacker.example'}, {'exp': 1},
    {'sub': ''}, {'email': 'invalid'}, {'azp': 'other-client'}, {'aud': ['test-client', 'other']},
])
def test_invalid_signed_claims_reject_session(google, changes):
    google.changes = changes
    assert callback(google, begin(google)).headers['location'].endswith('google=failed')
    assert complete(google).status_code == 401
    with google.system.database.transaction() as db:
        assert db.scalar(select(User).where(User.googleSubject == 'google-subject')) is None


def test_bad_signature_rejects_session(google):
    google.signing_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    assert callback(google, begin(google)).headers['location'].endswith('google=failed')
    assert complete(google).status_code == 401


@pytest.mark.parametrize('scenario', ['missing', 'tampered', 'browser', 'expired', 'purpose', 'denied'])
def test_invalid_state_never_exchanges_code(google, scenario):
    state = begin(google)
    if scenario == 'missing': state = ''
    if scenario == 'tampered': state = state + 'x'
    if scenario == 'browser': google.system.client.cookies.clear()
    if scenario in ('expired', 'purpose'):
        with google.system.database.transaction() as db:
            db.execute(update(OAuthRequest).values(**({'expiresAt': now() - timedelta(seconds=1)} if scenario == 'expired' else {'purpose': 'session'})))
    response = callback(google, state, **({'error': 'access_denied'} if scenario == 'denied' else {}))
    assert response.headers['location'].endswith('google=failed')
    assert google.calls == 0
    assert complete(google).status_code == 401


def test_callback_replay_and_wrong_origin_cannot_consume_session(google):
    state = begin(google)
    binding = google.system.client.cookies.get('miturno_oauth_login')
    callback(google, state)
    assert complete(google, 'https://attacker.example').status_code == 403
    assert complete(google).status_code == 200
    google.system.client.cookies.set('miturno_oauth_login', binding, path='/api/auth/google')
    assert callback(google, state).headers['location'].endswith('google=failed')
    assert google.calls == 1


@pytest.mark.parametrize('status', ['SUSPENDED', 'PENDING_VERIFICATION'])
def test_non_active_account_cannot_login(google, status):
    with google.system.database.transaction() as db:
        user = db.get(User, 'user-doctor')
        user.googleSubject, user.status = 'google-subject', status
    assert callback(google, begin(google)).headers['location'].endswith('google=failed')
    assert complete(google).status_code == 401


def test_suspended_after_callback_and_expired_ticket_cannot_complete(google):
    callback(google, begin(google))
    with google.system.database.transaction() as db:
        user = db.scalar(select(User).where(User.googleSubject == 'google-subject'))
        user.status = 'SUSPENDED'
    assert complete(google).status_code == 401
    with google.system.database.transaction() as db:
        user = db.scalar(select(User).where(User.googleSubject == 'google-subject'))
        user.status = 'ACTIVE'
    callback(google, begin(google))
    with google.system.database.transaction() as db:
        db.execute(update(OAuthRequest).values(expiresAt=now() - timedelta(seconds=1)))
    assert complete(google).status_code == 401


def test_link_wrong_email_or_already_linked_identity_rejected(google):
    assert callback(google, begin(google, 'doctor')).headers['location'].endswith('google=account')
    with google.system.database.transaction() as db:
        db.get(User, 'user-own').googleSubject = 'google-subject'
    assert callback(google, begin(google, 'doctor')).headers['location'].endswith('google=failed')
    assert complete(google).status_code == 401


def test_missing_config_returns_503_not_missing_route(system):
    assert system.client.get('/api/auth/google/start').status_code == 503
    assert system.client.post('/api/auth/google/link').status_code == 401


def test_consumed_state_stays_consumed_after_provider_failure(google):
    state = begin(google)
    binding = google.system.client.cookies.get('miturno_oauth_login')
    google.system.client.app.state.login_provider.client.close()
    google.system.client.app.state.login_provider.client = httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(503)))
    assert callback(google, state).headers['location'].endswith('google=failed')
    google.system.client.cookies.set('miturno_oauth_login', binding, path='/api/auth/google')
    google.system.client.app.state.login_provider.exchange = lambda *args: pytest.fail('replayed exchange')
    assert callback(google, state).headers['location'].endswith('google=failed')


def test_upgrade_preserves_existing_users_and_clinical_entries(tmp_path):
    from alembic import command
    from alembic.config import Config
    from conftest import ROOT, SECRET
    from app.config import Settings
    from app.database import Database
    from app.seed import seed
    from app.models import MedicalEntry
    settings = Settings(f"sqlite:///{tmp_path / 'upgrade.sqlite3'}", SECRET)
    config = Config(str(ROOT / 'alembic.ini'))
    config.set_main_option('sqlalchemy.url', settings.database_url)
    command.upgrade(config, 'head')
    database = Database(settings.database_url)
    seed(database, settings)
    with database.transaction() as db:
        expected = list(db.execute(select(User.id, User.email)))
        entries = list(db.execute(select(MedicalEntry.id, MedicalEntry.content)))
    command.downgrade(config, '0001')
    command.upgrade(config, 'head')
    with database.transaction() as db:
        assert list(db.execute(select(User.id, User.email))) == expected
        assert list(db.execute(select(MedicalEntry.id, MedicalEntry.content))) == entries
    database.engine.dispose()
