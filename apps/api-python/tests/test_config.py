"""D10: la configuración inválida debe fallar al arrancar, no en el primer uso."""
import pytest
from app.config import Settings
from conftest import SECRET

PRODUCTION = dict(environment="production", database_url="postgresql://db/miturno", web_url="https://miturno.example",
                  api_url="https://api.miturno.example", encryption_key="12" * 32,
                  resend_api_key="re_test", email_from="MiTurno <no-reply@miturno.example>")


def settings(**overrides):
    return Settings(**{"database_url": "sqlite://", "secret": SECRET, **overrides})


def test_valid_development_and_production_are_accepted():
    assert settings().environment == "development"
    # En desarrollo Calendar queda deshabilitado sin clave; no impide arrancar.
    assert settings(encryption_key="").encryption_key == ""
    assert settings(**PRODUCTION).environment == "production"


def test_short_jwt_secret_is_rejected():
    with pytest.raises(ValueError, match="JWT_ACCESS_SECRET"):
        settings(secret="corto")


@pytest.mark.parametrize("environment", ["produccion", "Production", "prod", "staging", ""])
def test_unknown_environment_is_rejected(environment):
    # Un error de tipeo no puede desactivar en silencio los controles de producción.
    with pytest.raises(ValueError, match="APP_ENV"):
        settings(environment=environment)


def test_unknown_environment_is_rejected_when_loading_from_env(monkeypatch):
    monkeypatch.setenv("APP_ENV", "produccion")
    monkeypatch.setenv("JWT_ACCESS_SECRET", SECRET)
    with pytest.raises(ValueError, match="APP_ENV"):
        Settings.load()


@pytest.mark.parametrize("change,message", [
    ({"database_url": "sqlite:///prod.sqlite3"}, "PostgreSQL"),
    ({"web_url": "http://miturno.example"}, "HTTPS"),
    ({"api_url": "http://api.miturno.example"}, "HTTPS"),
    ({"google_redirect_uri": "http://api.miturno.example/cb"}, "Google HTTPS"),
    ({"google_login_redirect_uri": "http://api.miturno.example/cb"}, "Google HTTPS"),
    # Sin email nadie puede verificar su cuenta ni recuperar la contraseña.
    ({"resend_api_key": ""}, "RESEND_API_KEY"),
    ({"email_from": ""}, "EMAIL_FROM"),
    # El buzón local de desarrollo nunca puede reemplazar el envío real.
    ({"mailbox_dir": "/tmp/mailbox"}, "DEV_MAILBOX_DIR"),
])
def test_production_requires_secure_infrastructure(change, message):
    with pytest.raises(ValueError, match=message):
        settings(**{**PRODUCTION, **change})


@pytest.mark.parametrize("key", ["", "abc", "zz" * 32, "12" * 16, "00" * 32])
def test_production_requires_valid_encryption_key(key):
    with pytest.raises(ValueError, match="ENCRYPTION_KEY"):
        settings(**{**PRODUCTION, "encryption_key": key})



def test_development_mailbox_defaults_only_outside_production(monkeypatch):
    # Aislado del .env local: solo cuentan las variables definidas acá.
    monkeypatch.setattr("app.config.load_dotenv", lambda *_args, **_kwargs: None)
    for name in ("DEV_MAILBOX_DIR", "GOOGLE_LOGIN_REDIRECT_URI", "GOOGLE_REDIRECT_URI"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("JWT_ACCESS_SECRET", SECRET)
    monkeypatch.setenv("APP_ENV", "development")
    assert Settings.load().mailbox_dir.endswith("mailbox")
    for name, key in {"DATABASE_URL": "database_url", "WEB_URL": "web_url", "API_URL": "api_url", "ENCRYPTION_KEY": "encryption_key",
                      "RESEND_API_KEY": "resend_api_key", "EMAIL_FROM": "email_from"}.items():
        monkeypatch.setenv(name, PRODUCTION[key])
    monkeypatch.setenv("APP_ENV", "production")
    assert Settings.load().mailbox_dir == ""
