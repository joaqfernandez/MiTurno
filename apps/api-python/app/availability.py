"""Disponibilidad por zona horaria; nunca materializa millones de slots."""
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from fastapi import HTTPException
from sqlalchemy import select
from .models import Appointment, Schedule, ScheduleOverride, now

ACTIVE = ("CONFIRMED", "PENDING_PAYMENT")


def validate_range(start, end):
    if not start.tzinfo or not end.tzinfo or end <= start or end - start > timedelta(days=93):
        raise HTTPException(400, "Usá un rango con zona horaria de hasta 93 días")


def slots(db, doctor, start, end, clock=None):
    validate_range(start, end)
    clock = clock or now()
    zone = ZoneInfo(doctor.timezone)
    day, last = start.astimezone(zone).date(), end.astimezone(zone).date()
    schedules = list(db.scalars(select(Schedule).where(Schedule.doctorId == doctor.id)))
    overrides = list(db.scalars(select(ScheduleOverride).where(ScheduleOverride.doctorId == doctor.id, ScheduleOverride.date >= day, ScheduleOverride.date <= last)))
    occupied = list(db.scalars(select(Appointment).where(Appointment.doctorId == doctor.id, Appointment.status.in_(ACTIVE), Appointment.startAt < end, Appointment.endAt > start)))
    result = {}
    while day <= last:
        exceptions = [item for item in overrides if item.date == day]
        if any(item.type == "BLOCKED" and not item.startTime for item in exceptions):
            day += timedelta(days=1)
            continue
        spans = [(item.startTime, item.endTime, item.slotMinutes or doctor.defaultSlotMinutes)
                 for item in schedules if item.weekday == (day.weekday() + 1) % 7
                 and (not item.validFrom or day >= item.validFrom) and (not item.validTo or day <= item.validTo)]
        spans += [(item.startTime, item.endTime, doctor.defaultSlotMinutes) for item in exceptions if item.type == "EXTRA"]

        def instant(hhmm):
            local = datetime.combine(day, datetime.strptime(hhmm, "%H:%M").time(), zone)
            utc = local.astimezone(timezone.utc)
            return utc if utc.astimezone(zone).replace(tzinfo=None) == local.replace(tzinfo=None) else None

        for first, last_time, minutes in spans:
            cursor, limit = instant(first), instant(last_time)
            if not cursor or not limit or minutes <= 0:
                continue
            while cursor + timedelta(minutes=minutes) <= limit:
                finish = cursor + timedelta(minutes=minutes)
                blocked = any(item.type == "BLOCKED" and instant(item.startTime) and instant(item.endTime)
                              and cursor < instant(item.endTime) and finish > instant(item.startTime) for item in exceptions if item.startTime)
                taken = any(cursor < item.endAt and finish > item.startAt for item in occupied)
                if cursor >= start and finish <= end and cursor > clock and not blocked and not taken:
                    result[cursor] = {"startAt": cursor, "endAt": finish}
                cursor = finish
        day += timedelta(days=1)
    return [result[key] for key in sorted(result)]
