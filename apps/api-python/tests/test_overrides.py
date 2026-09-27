"""Excepciones de agenda (vacaciones, días libres): rangos de fechas y turnos ya reservados.

Decisión del fundador (2026-09-27): si hay turnos activos dentro de un bloqueo, la API no bloquea
y devuelve la lista para que el médico los cancele. Nada se cancela automáticamente.
"""
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo
import pytest
from alembic import command
from sqlalchemy import text
from app.database import Database
from app.models import Doctor, ScheduleOverride, User
from conftest import future_slots, reserve
from test_migrations import alembic_config

ZONE = ZoneInfo("America/Argentina/Mendoza")  # Zona por defecto del médico de prueba.


def local_day(iso):
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(ZONE).date()


def slots_on(system, day):
    start = datetime.combine(day, time.min, ZONE)
    response = system.client.get("/api/appointments/availability/doctor", params={"from": start.isoformat(), "to": (start + timedelta(days=1)).isoformat()})
    assert response.status_code == 200, response.text
    return response.json()


def block(system, name="doctor", **body):
    return system.client.post("/api/doctors/me/overrides", json={"type": "BLOCKED", **body}, headers=system.headers(name))


def listed(system, name="doctor"):
    response = system.client.get("/api/doctors/me/overrides", headers=system.headers(name))
    assert response.status_code == 200, response.text
    return response.json()


def test_range_blocks_every_day_and_only_those_days(system):
    first = local_day(future_slots(system)[0]["startAt"])
    response = block(system, date=first.isoformat(), endDate=(first + timedelta(days=2)).isoformat(), reason="Vacaciones")
    assert response.status_code == 201, response.text
    for offset in range(3):
        assert slots_on(system, first + timedelta(days=offset)) == []
    assert slots_on(system, first + timedelta(days=3)) != []
    assert [(item["date"], item["endDate"], item["reason"]) for item in listed(system)] == [
        (first.isoformat(), (first + timedelta(days=2)).isoformat(), "Vacaciones")]
    # Borrar la excepción devuelve los turnos libres de todo el rango.
    assert system.client.delete(f"/api/doctors/me/overrides/{response.json()['id']}", headers=system.headers("doctor")).status_code == 200
    assert slots_on(system, first + timedelta(days=1)) != []


def test_single_day_block_keeps_end_date_equal_to_start(system):
    first = local_day(future_slots(system)[0]["startAt"])
    item = block(system, date=first.isoformat()).json()
    assert item["endDate"] == item["date"] == first.isoformat()


def test_block_over_booked_appointment_is_rejected_with_the_list(system):
    booked = reserve(system).json()
    day = local_day(booked["startAt"])
    response = block(system, date=(day - timedelta(days=1)).isoformat(), endDate=(day + timedelta(days=1)).isoformat())
    assert response.status_code == 409
    body = response.json()
    assert body["code"] == "APPOINTMENTS_IN_RANGE"
    assert "1 turno" in body["message"]
    assert [item["id"] for item in body["appointments"]] == [booked["id"]]
    assert body["appointments"][0]["patient"]["lastName"] == "Castro"
    # Nada quedó bloqueado ni cancelado.
    assert listed(system) == []
    agenda = system.client.get("/api/appointments/me", headers=system.headers()).json()
    assert [item["status"] for item in agenda if item["id"] == booked["id"]] == ["CONFIRMED"]
    # Cancelado el turno, el mismo bloqueo se acepta.
    assert system.client.delete(f"/api/appointments/{booked['id']}", headers=system.headers("doctor")).status_code == 200
    assert block(system, date=(day - timedelta(days=1)).isoformat(), endDate=(day + timedelta(days=1)).isoformat()).status_code == 201


def test_partial_block_only_conflicts_with_overlapping_hours(system):
    booked = reserve(system).json()
    start = datetime.fromisoformat(booked["startAt"].replace("Z", "+00:00")).astimezone(ZONE)
    end = datetime.fromisoformat(booked["endAt"].replace("Z", "+00:00")).astimezone(ZONE)
    day = start.date().isoformat()
    # Termina justo cuando empieza el turno: no se superponen.
    assert block(system, date=day, startTime="00:00", endTime=start.strftime("%H:%M")).status_code == 201
    assert block(system, date=day, startTime=end.strftime("%H:%M"), endTime="23:59").status_code == 201
    overlapping = block(system, date=day, startTime=start.strftime("%H:%M"), endTime=(start + timedelta(minutes=1)).strftime("%H:%M"))
    assert overlapping.status_code == 409
    assert [item["id"] for item in overlapping.json()["appointments"]] == [booked["id"]]


def test_cancelled_appointments_and_extra_hours_do_not_conflict(system):
    booked = reserve(system).json()
    day = local_day(booked["startAt"]).isoformat()
    assert system.client.post("/api/doctors/me/overrides", json={"type": "EXTRA", "date": day, "startTime": "14:00", "endTime": "15:00"},
                              headers=system.headers("doctor")).status_code == 201
    assert system.client.delete(f"/api/appointments/{booked['id']}", headers=system.headers()).status_code == 200
    assert block(system, date=day).status_code == 201


@pytest.mark.parametrize("body, message", [
    ({"date": "2030-01-10", "endDate": "2030-01-09"}, "anterior"),
    ({"date": "2030-01-01", "endDate": "2031-01-02"}, "un año"),
    ({"date": "2020-01-01", "endDate": "2020-01-05"}, "ya pasaron"),
])
def test_invalid_ranges_are_rejected(system, body, message):
    response = block(system, **body)
    assert response.status_code == 400
    body = response.json()
    assert message in str(body.get("message") or body.get("detail"))
    assert listed(system) == []


def test_list_hides_past_exceptions_and_other_doctors(system):
    first = local_day(future_slots(system)[0]["startAt"])
    later = block(system, date=(first + timedelta(days=5)).isoformat()).json()
    sooner = block(system, date=first.isoformat(), endDate=(first + timedelta(days=1)).isoformat()).json()
    with system.database.transaction() as db:
        db.add(ScheduleOverride(id="past", doctorId="doctor", type="BLOCKED", date=date(2020, 1, 1), endDate=date(2020, 1, 1)))
    assert [item["id"] for item in listed(system)] == [sooner["id"], later["id"]]
    # Un paciente no puede listar ni borrar excepciones.
    assert system.client.get("/api/doctors/me/overrides", headers=system.headers()).status_code == 403
    assert system.client.delete(f"/api/doctors/me/overrides/{later['id']}", headers=system.headers()).status_code == 403


def test_database_rejects_inverted_range(system):
    with pytest.raises(Exception, match="(?i)check|constraint"):
        with system.database.transaction() as db:
            db.add(ScheduleOverride(doctorId="doctor", type="BLOCKED", date=date(2030, 1, 10), endDate=date(2030, 1, 9)))


def test_downgrade_splits_ranges_so_no_blocked_day_is_lost(tmp_path):
    url = f"sqlite:///{tmp_path / 'ranges.sqlite3'}"
    config = alembic_config(url)
    command.upgrade(config, "0006")
    database = Database(url)
    try:
        with database.transaction() as db:
            db.add(User(id="u", email="d@example.com", roles=["DOCTOR"], status="ACTIVE"))
            db.flush()
            db.add(Doctor(id="d", userId="u", firstName="A", lastName="B", licenseNumber="L", specialtyIds=[], icsFeedToken="t"))
            db.flush()
            db.add(ScheduleOverride(doctorId="d", type="BLOCKED", date=date(2030, 1, 1), endDate=date(2030, 1, 3), reason="Vacaciones"))
        command.downgrade(config, "0005")
        with database.engine.connect() as connection:
            rows = connection.execute(text("SELECT date, reason FROM schedule_overrides ORDER BY date")).all()
        assert [(str(day), reason) for day, reason in rows] == [("2030-01-01", "Vacaciones"), ("2030-01-02", "Vacaciones"), ("2030-01-03", "Vacaciones")]
    finally:
        database.engine.dispose()
