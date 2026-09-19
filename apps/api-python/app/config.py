from dataclasses import dataclass
import os
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]


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
    resend_api_key: str = ""
    email_from: str = ""
    twilio_sid: str = ""
    twilio_token: str = ""
    twilio_from: str = ""

    def __post_init__(self):
        if len(self.secret.encode()) < 32:
            raise ValueError("JWT_ACCESS_SECRET debe tener al menos 32 bytes")
        if self.environment == "production":
            if not self.database_url.startswith("postgresql"):
                raise ValueError("Producción requiere PostgreSQL")
            if not self.web_url.startswith("https://") or not self.api_url.startswith("https://"):
                raise ValueError("Producción requiere URLs HTTPS")

    @classmethod
    def load(cls):
        load_dotenv(ROOT / ".env")
        return cls(
            database_url=os.getenv("DATABASE_URL", f"sqlite:///{ROOT / '.data' / 'miturno.sqlite3'}"),
            secret=os.getenv("JWT_ACCESS_SECRET", ""),
            web_url=os.getenv("WEB_URL", "http://localhost:3001"), api_url=os.getenv("API_URL", "http://localhost:3000"),
            environment=os.getenv("APP_ENV", "development"), encryption_key=os.getenv("ENCRYPTION_KEY", ""),
            mp_access_token=os.getenv("MP_ACCESS_TOKEN", ""), mp_webhook_secret=os.getenv("MP_WEBHOOK_SECRET", ""),
            google_client_id=os.getenv("GOOGLE_CLIENT_ID", ""), google_client_secret=os.getenv("GOOGLE_CLIENT_SECRET", ""),
            resend_api_key=os.getenv("RESEND_API_KEY", ""), email_from=os.getenv("EMAIL_FROM", ""),
            twilio_sid=os.getenv("TWILIO_ACCOUNT_SID", ""), twilio_token=os.getenv("TWILIO_AUTH_TOKEN", ""),
            twilio_from=os.getenv("TWILIO_FROM_NUMBER", ""),
        )
