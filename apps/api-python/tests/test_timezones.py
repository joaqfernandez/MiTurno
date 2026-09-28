"""Zona horaria de cada médico: los horarios se cargan en hora local y los turnos se guardan en UTC.

Los demás tests usan Mendoza (UTC-3, sin horario de verano). Acá se prueban otras zonas y los cambios de
horario reales, para que un médico en Chile o en otro país no vea turnos corridos, repetidos o inexistentes.
"""
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo
import pytest
from sqlalchemy import delete, select
from app.models import Appointment, Doctor, Schedule
from conftest import reserve

UTC = timezone.utc


def configure(system, zone, weekday_hours):
    """Zona del médico y horario semanal {weekday: (inicio, fin)}; weekday 0 = domingo como en el modelo."""
    with system.database.transaction() as db:
        db.get(Doctor, "doctor").timezone = zone
        db.execute(delete(Schedule).where(Schedule.doctorId == "doctor"))
        for weekday, (start, end) in weekday_hours.items():
            db.add(Schedule(doctorId="doctor", weekday=weekday, startTime=start, endTime=end))


def every_day(start, end):
    return {weekday: (start, end) for weekday in range(7)}


def day_slots(system, day, zone):
    first = datetime.combine(day, time.min, ZoneInfo(zone))
    response = system.client.get("/api/appointments/availability/doctor",
                                 params={"from": first.isoformat(), "to": (first + timedelta(days=1)).isoformat()})
    assert response.status_code == 200, response.text
    return [(parse(item["startAt"]), parse(item["endAt"])) for item in response.json()]


def parse(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def local_times(slots, zone):
    return [start.astimezone(ZoneInfo(zone)).strftime("%H:%M") for start, _ in slots]


def future_weekday(weekday):
    """Próxima fecha (a más de 3 días) con ese weekday del modelo (0 = domingo)."""
    day = date.today() + timedelta(days=4)
    while (day.weekday() + 1) % 7 != weekday:
        day += timedelta(days=1)
    return day


def test_doctor_in_another_zone_offers_its_local_hours(system):
    configure(system, "America/Bogota", every_day("09:00", "11:00"))  # UTC-5, sin horario de verano.
    day = future_weekday(2)
    slots = day_slots(system, day, "America/Bogota")
    assert local_times(slots, "America/Bogota") == ["09:00", "09:30", "10:00", "10:30"]
    assert slots[0][0] == datetime.combine(day, time(14, 0), UTC)


def test_booking_is_stored_in_utc_and_returned_as_the_same_instant(system):
    configure(system, "America/Bogota", every_day("09:00", "11:00"))
    start, end = day_slots(system, future_weekday(3), "America/Bogota")[0]
    booked = reserve(system, start=start.isoformat())
    assert booked.status_code == 201, booked.text
    assert (parse(booked.json()["startAt"]), parse(booked.json()["endAt"])) == (start, end)
    with system.database.transaction() as db:
        stored = db.scalar(select(Appointment.startAt).where(Appointment.id == booked.json()["id"]))
    assert stored == start


def test_offsets_follow_each_day_across_chile_daylight_saving_end(system):
    # Chile vuelve a UTC-4 el 4/4/2027: 09:00 local es 12:00 UTC el sábado 3 y 13:00 UTC el domingo 4.
    configure(system, "America/Santiago", every_day("09:00", "10:00"))
    assert day_slots(system, date(2027, 4, 3), "America/Santiago")[0][0] == datetime(2027, 4, 3, 12, 0, tzinfo=UTC)
    assert day_slots(system, date(2027, 4, 4), "America/Santiago")[0][0] == datetime(2027, 4, 4, 13, 0, tzinfo=UTC)


def test_spring_forward_gap_is_never_offered(system):
    # Nueva York adelanta el reloj el 14/3/2027 a las 02:00: las 02:00 y 02:30 locales no existen ese día.
    configure(system, "America/New_York", {0: ("01:00", "04:00")})
    slots = day_slots(system, date(2027, 3, 14), "America/New_York")
    assert local_times(slots, "America/New_York") == ["01:00", "01:30", "03:00", "03:30"]
    assert all(end - start == timedelta(minutes=30) for start, end in slots)
    assert all(earlier[1] <= later[0] for earlier, later in zip(slots, slots[1:]))


def test_fall_back_repeated_hour_offers_distinct_real_slots(system):
    # Nueva York atrasa el reloj el 1/11/2026: la hora 01:00-02:00 local ocurre dos veces.
    configure(system, "America/New_York", {0: ("00:30", "03:00")})
    slots = day_slots(system, date(2026, 11, 1), "America/New_York")
    assert local_times(slots, "America/New_York") == ["00:30", "01:00", "01:30", "01:00", "01:30", "02:00", "02:30"]
    assert all(end - start == timedelta(minutes=30) for start, end in slots)
    assert all(earlier[1] <= later[0] for earlier, later in zip(slots, slots[1:]))
    # Las dos «01:00» son turnos distintos: reservar una no bloquea la otra.
    first, second = slots[1][0], slots[3][0]
    assert second - first == timedelta(hours=1)
    assert reserve(system, start=first.isoformat()).status_code == 201
    assert reserve(system, "other", start=second.isoformat()).status_code == 201


def test_day_block_uses_the_doctors_local_date(system):
    # En Auckland (UTC+13) la fecha local va un día adelante de UTC: bloquear el día local no toca el anterior ni el siguiente.
    configure(system, "Pacific/Auckland", every_day("09:00", "10:00"))
    day = future_weekday(1)
    assert system.client.post("/api/doctors/me/overrides", json={"type": "BLOCKED", "date": day.isoformat()},
                              headers=system.headers("doctor")).status_code == 201
    assert day_slots(system, day, "Pacific/Auckland") == []
    for other in (day - timedelta(days=1), day + timedelta(days=1)):
        assert local_times(day_slots(system, other, "Pacific/Auckland"), "Pacific/Auckland") == ["09:00", "09:30"]


def test_block_detects_appointments_by_local_date_in_far_zones(system):
    configure(system, "Pacific/Auckland", every_day("09:00", "10:00"))
    day = future_weekday(4)
    start = day_slots(system, day, "Pacific/Auckland")[0][0]
    assert start.date() == day - timedelta(days=1)  # En UTC el turno cae el día anterior.
    assert reserve(system, start=start.isoformat()).status_code == 201
    response = system.client.post("/api/doctors/me/overrides", json={"type": "BLOCKED", "date": day.isoformat()}, headers=system.headers("doctor"))
    assert response.status_code == 409
    assert system.client.post("/api/doctors/me/overrides", json={"type": "BLOCKED", "date": (day - timedelta(days=1)).isoformat()},
                              headers=system.headers("doctor")).status_code == 201


@pytest.mark.parametrize("zone, status", [("America/Santiago", 200), ("Mars/Olympus", 400), ("", 400)])
def test_doctor_timezone_must_be_a_real_zone(system, zone, status):
    response = system.client.patch("/api/doctors/me/settings", json={"timezone": zone}, headers=system.headers("doctor"))
    assert response.status_code == status
