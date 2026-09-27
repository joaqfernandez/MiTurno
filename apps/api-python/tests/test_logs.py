"""Los logs no deben contener datos de pacientes ni secretos (docs/BETA.md, Fase 1)."""
import logging
import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from app.database import Database
from app.main import redact_path


def test_database_errors_do_not_include_query_values(tmp_path):
    # Un error de la base (caída, timeout, trigger) llega a la traza del log; no puede arrastrar el DNI o el texto clínico.
    database = Database(tmp_path / "logs.sqlite3")
    with pytest.raises(DBAPIError) as info:
        with database.engine.connect() as connection:
            connection.execute(text("SELECT * FROM no_existe WHERE dni = :dni"), {"dni": "30111222"})
    database.engine.dispose()
    assert "30111222" not in str(info.value)


@pytest.mark.parametrize("path, expected", [
    ("/api/calendar/feed/secreto-del-medico.ics", "/api/calendar/feed/***.ics"),
    ("/api/auth/google/callback?code=codigo-oauth&state=abc", "/api/auth/google/callback"),
    ("/api/appointments/availability/doctor?from=2026-01-01", "/api/appointments/availability/doctor"),
    ("/api/medical-records/patient-own", "/api/medical-records/patient-own"),
])
def test_paths_are_redacted_for_logs(path, expected):
    assert redact_path(path) == expected


def test_uvicorn_access_log_hides_feed_token_and_query(system, caplog):
    # El feed ICS da acceso a la agenda del médico; los códigos OAuth son credenciales de un solo uso.
    with caplog.at_level(logging.INFO, logger="uvicorn.access"):
        for path in ("/api/calendar/feed/test-feed-token.ics", "/api/auth/google/callback?code=codigo-oauth&state=abc"):
            logging.getLogger("uvicorn.access").info('%s - "%s %s HTTP/%s" %d', "127.0.0.1:5000", "GET", path, "1.1", 200)
    assert "test-feed-token" not in caplog.text
    assert "codigo-oauth" not in caplog.text
    assert "/api/calendar/feed/***.ics" in caplog.text
