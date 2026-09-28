""".env.example está en un repositorio público: nunca lleva secretos y documenta todas las variables que usa la API."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[3]
EXAMPLE = ROOT / ".env.example"
SECRET = re.compile(r"SECRET|TOKEN|KEY|SID|PASSWORD")


def assignments():
    # Solo líneas activas (las comentadas son ejemplos de la web sin valores secretos).
    return dict(line.split("=", 1) for line in EXAMPLE.read_text(encoding="utf-8").splitlines() if re.match(r"^[A-Z_]+=", line))


def test_secret_variables_are_empty():
    filled = [name for name, value in assignments().items() if SECRET.search(name) and value.strip()]
    assert not filled, f"Variables secretas con valor en .env.example (repo público): {filled}"


def test_every_variable_the_api_reads_is_documented():
    code = "".join(path.read_text(encoding="utf-8") for path in (ROOT / "apps" / "api-python" / "app").glob("*.py"))
    used = set(re.findall(r'getenv\("([A-Z_]+)"', code))
    assert used, "No se encontraron variables en app/"
    assert used <= set(assignments()), f"Faltan en .env.example: {sorted(used - set(assignments()))}"
