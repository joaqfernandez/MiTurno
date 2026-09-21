"""Comandos del backend, independientes de la activación manual del virtualenv."""
from pathlib import Path
import os
import secrets
import subprocess
import sys
import venv

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "apps" / "api-python"
PYTHON = BACKEND / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def main():
    action = sys.argv[1] if len(sys.argv) > 1 else "dev"
    if action == "setup":
        if not PYTHON.exists():
            venv.create(BACKEND / ".venv", with_pip=True)
        if subprocess.run([str(PYTHON), "-m", "pip", "--version"], capture_output=True).returncode:
            subprocess.run([str(PYTHON), "-m", "ensurepip", "--upgrade"], check=True)
        subprocess.run([str(PYTHON), "-m", "pip", "install", "-r", "requirements.txt"], cwd=BACKEND, check=True)
        environment = BACKEND / ".env"
        if not environment.exists():
            environment.write_text(
                "DATABASE_URL=postgresql+psycopg://turnos:turnos_dev@127.0.0.1:55432/miturno_python\n"
                f"JWT_ACCESS_SECRET={secrets.token_hex(32)}\nENCRYPTION_KEY={secrets.token_hex(32)}\n"
                "APP_ENV=development\nWEB_URL=http://localhost:3001\nAPI_URL=http://localhost:3000\n"
                "GOOGLE_CLIENT_ID=\nGOOGLE_CLIENT_SECRET=\n"
                "GOOGLE_LOGIN_REDIRECT_URI=http://localhost:3000/api/auth/google/callback\n"
                "GOOGLE_REDIRECT_URI=http://localhost:3000/api/calendar/google/callback\n"
            )
            environment.chmod(0o600)
        print("Entorno listo. Ejecutá npm run db:migrate y npm run db:seed con Docker iniciado.")
        return
    if not PYTHON.exists():
        raise SystemExit("Primero ejecutá: npm run setup:api")
    commands = {
        "dev": ["-m", "uvicorn", "app.main:create_app", "--factory", "--reload", "--host", "127.0.0.1", "--port", "3000"],
        "migrate": ["-m", "alembic", "upgrade", "head"],
        "seed": ["-m", "app.seed"],
        "test": ["-m", "pytest"],
        "worker": ["-m", "app.worker"],
    }
    if action not in commands:
        raise SystemExit(f"Comando desconocido: {action}")
    try:
        result = subprocess.run([str(PYTHON), *commands[action], *sys.argv[2:]], cwd=BACKEND)
        raise SystemExit(result.returncode)
    except KeyboardInterrupt:
        raise SystemExit(0)


if __name__ == "__main__":
    main()
