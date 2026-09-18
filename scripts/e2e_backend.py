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

with TemporaryDirectory(prefix="miturno-e2e-") as directory:
    settings = Settings(f"sqlite:///{Path(directory) / 'e2e.sqlite3'}", "e2e-only-secret-never-use-in-production-123", web_url="http://127.0.0.1:3101", api_url="http://127.0.0.1:3100")
    config = Config(str(BACKEND / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", settings.database_url)
    command.upgrade(config, "head")
    seed(Database(settings.database_url), settings)
    uvicorn.run(create_app(settings=settings), host="127.0.0.1", port=3100)
