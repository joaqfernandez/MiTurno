"""Backend del test de navegador: base temporal independiente, sin tocar desarrollo."""
from pathlib import Path
from tempfile import TemporaryDirectory
import sys

BACKEND = Path(__file__).resolve().parents[1] / "apps" / "api-python"
sys.path.insert(0, str(BACKEND))
from alembic import command
from alembic.config import Config
import uvicorn
from app.config import Settings
from app.database import Database
from app.main import create_app
from app.seed import seed
from app.google_auth import GoogleLogin
from app.models import User
from sqlalchemy import select
from fastapi.responses import HTMLResponse
from urllib.parse import urlencode
from html import escape


class BrowserGoogle(GoogleLogin):
    # Only this test entrypoint injects a fake provider. Production has no bypass.
    def auth_url(self, state, nonce):
        return f"{self.settings.api_url}/test-google?" + urlencode({"state": state})

    def exchange(self, code, nonce):
        if code not in ("ana", "valeria", "admin"):
            raise ValueError("Unknown test account")
        return {"sub": f"browser-{code}", "email": f"{code}@example.com"}


with TemporaryDirectory(prefix="miturno-e2e-") as directory:
    settings = Settings(f"sqlite:///{Path(directory) / 'e2e.sqlite3'}", "e2e-only-secret-never-use-in-production-123", web_url="http://127.0.0.1:3101", api_url="http://127.0.0.1:3100")
    config = Config(str(BACKEND / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", settings.database_url)
    command.upgrade(config, "head")
    seed(Database(settings.database_url), settings)
    settings.google_client_id, settings.google_client_secret = "browser-client", "browser-secret"
    database = Database(settings.database_url)
    with database.transaction() as db:
        for name in ("ana", "valeria", "admin"):
            user = db.scalar(select(User).where(User.email == f"{name}@example.com"))
            user.googleSubject = f"browser-{name}"
    database.engine.dispose()
    app = create_app(settings=settings, login_provider=BrowserGoogle(settings))
    @app.get("/test-google", response_class=HTMLResponse)
    def consent(state: str):
        return f'''<form action="/api/auth/google/callback">
          <input type="hidden" name="state" value="{escape(state, quote=True)}">
          <label>Cuenta de prueba<select name="code"><option>ana</option><option>valeria</option><option>admin</option></select></label>
          <button>Autorizar prueba</button></form>'''
    uvicorn.run(app, host="127.0.0.1", port=3100)
