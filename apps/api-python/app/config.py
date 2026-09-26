from dataclasses import dataclass
import os
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
# Lista cerrada: un valor mal escrito no puede desactivar los controles de producción.
ENVIRONMENTS = ("development", "production")


def valid_encryption_key(value):
    try:
        key = bytes.fromhex(value)
    except ValueError:
        return False
    return len(key) == 32 and any(key)


@dataclass
class Settings:
    database_url: str
    secret: str
    web_url: str = "http://localhost:3001"
    api_url: str = "http://localhost:3000"
    environment: str = "development"
    access_ttl: int = 900
    encryption_key: str = ""
    mp_access_token: str = ""
    mp_webhook_secret: str = ""
    google_client_id: str = ""
    google_client_secret: str = ""
    google_login_redirect_uri: str = ""
    google_redirect_uri: str = ""
    resend_api_key: str = ""
    email_from: str = ""
    twilio_sid: str = ""
    twilio_token: str = ""
    twilio_from: str = ""
    # Solo desarrollo: los emails se escriben en esta carpeta en vez de enviarse.
    mailbox_dir: str = ""
    # Pedidos por minuto e IP a /api/auth. No se lee del entorno: solo el backend de Playwright lo cambia.
    auth_rate_limit: int = 30

    def __post_init__(self):
        if len(self.secret.encode()) < 32:
            raise ValueError("JWT_ACCESS_SECRET debe tener al menos 32 bytes")
        if self.environment not in ENVIRONMENTS:
            raise ValueError(f"APP_ENV debe ser uno de {', '.join(ENVIRONMENTS)}; se recibió {self.environment!r}")
        if self.environment == "production":
            if not valid_encryption_key(self.encryption_key):
                raise ValueError("Producción requiere ENCRYPTION_KEY de 32 bytes aleatorios en hexadecimal")
            if not self.database_url.startswith("postgresql"):
                raise ValueError("Producción requiere PostgreSQL")
            if not self.web_url.startswith("https://") or not self.api_url.startswith("https://"):
                raise ValueError("Producción requiere URLs HTTPS")
            if self.mailbox_dir:
                raise ValueError("DEV_MAILBOX_DIR no se permite en producción")
            # Sin email nadie puede verificar su cuenta ni recuperar la contraseña.
            if not self.resend_api_key or not self.email_from:
                raise ValueError("Producción requiere RESEND_API_KEY y EMAIL_FROM")
            for uri in (self.google_login_redirect_uri, self.google_redirect_uri):
                if uri and not uri.startswith("https://"):
                    raise ValueError("Producción requiere callbacks Google HTTPS")

    @classmethod
    def load(cls):
        load_dotenv(ROOT / ".env")
        environment = os.getenv("APP_ENV", "development")
        return cls(
            database_url=os.getenv("DATABASE_URL", f"sqlite:///{ROOT / '.data' / 'miturno.sqlite3'}"),
            secret=os.getenv("JWT_ACCESS_SECRET", ""),
            web_url=os.getenv("WEB_URL", "http://localhost:3001"), api_url=os.getenv("API_URL", "http://localhost:3000"),
            environment=environment, encryption_key=os.getenv("ENCRYPTION_KEY", ""),
            mp_access_token=os.getenv("MP_ACCESS_TOKEN", ""), mp_webhook_secret=os.getenv("MP_WEBHOOK_SECRET", ""),
            google_client_id=os.getenv("GOOGLE_CLIENT_ID", ""), google_client_secret=os.getenv("GOOGLE_CLIENT_SECRET", ""),
            google_login_redirect_uri=os.getenv("GOOGLE_LOGIN_REDIRECT_URI", ""), google_redirect_uri=os.getenv("GOOGLE_REDIRECT_URI", ""),
            resend_api_key=os.getenv("RESEND_API_KEY", ""), email_from=os.getenv("EMAIL_FROM", ""),
            twilio_sid=os.getenv("TWILIO_ACCOUNT_SID", ""), twilio_token=os.getenv("TWILIO_AUTH_TOKEN", ""),
            twilio_from=os.getenv("TWILIO_FROM_NUMBER", ""),
            mailbox_dir=os.getenv("DEV_MAILBOX_DIR") or (str(ROOT / ".data" / "mailbox") if environment == "development" else ""),
        )
