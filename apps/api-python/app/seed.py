"""Datos ficticios persistidos. Idempotente y prohibido en producción."""
from datetime import datetime, timedelta, timezone
import secrets
from zoneinfo import ZoneInfo
from sqlalchemy import select
from .auth import passwords
from .config import Settings
from .database import Database
from .models import User, Patient, Doctor, Specialty, Schedule, Appointment, MedicalRecord, MedicalEntry, AuditLog, Location, now

PASSWORD = "DemoTurnos2026!"


def seed(database, settings):
    if settings.environment == "production":
        raise ValueError("No se permite cargar datos demo en producción")
    with database.transaction() as db:
        if db.scalar(select(User.id).where(User.email == "ana@example.com")):
            return False
        specialties = [Specialty(name="Clínica médica", slug="clinica-medica"), Specialty(name="Cardiología", slug="cardiologia")]
        db.add_all(specialties)
        db.flush()
        profiles = []
        for email, first, last, role in [
            ("ana@example.com", "Ana", "Castro", "PATIENT"),
            ("lucas@example.com", "Lucas", "Pérez", "PATIENT"),
            ("valeria@example.com", "Valeria", "Roldán", "DOCTOR"),
            ("pedro@example.com", "Pedro", "Gómez", "DOCTOR"),
            ("admin@example.com", "", "", "ADMIN"),
        ]:
            user = User(email=email, passwordHash=passwords.hash(PASSWORD), roles=[role], status="ACTIVE", phone="+5492615550100", emailVerifiedAt=now())
            db.add(user)
            db.flush()
            if role == "ADMIN":
                continue
            if role == "PATIENT":
                profile = Patient(userId=user.id, firstName=first, lastName=last, healthInsurance="Cobertura de ejemplo")
            else:
                profile = Doctor(userId=user.id, firstName=first, lastName=last, licenseNumber=f"DEMO-{first.upper()}",
                                 specialtyIds=[specialties[0 if first == "Valeria" else 1].id], icsFeedToken=secrets.token_urlsafe(32),
                                 bio="Perfil ficticio para probar el funcionamiento de MiTurno.", requiresDeposit=False)
            db.add(profile)
            db.flush()
            profiles.append(profile)
            if role == "DOCTOR":
                for day in range(1, 6):
                    db.add(Schedule(doctorId=profile.id, weekday=day, startTime="09:00", endTime="13:00"))
                db.add(Location(doctorId=profile.id, name="Consultorio de prueba", address="Dirección ficticia 123, Mendoza", weekdays=[1, 2, 3, 4, 5]))
        ana, lucas, valeria, pedro = profiles
        zone = ZoneInfo("America/Argentina/Mendoza")
        next_day = now().astimezone(zone).date() + timedelta(days=1)
        while next_day.weekday() > 4:
            next_day += timedelta(days=1)
        start = datetime.combine(next_day, datetime.min.time().replace(hour=9), zone).astimezone(timezone.utc)
        db.add(Appointment(patientId=ana.id, doctorId=valeria.id, startAt=start, endAt=start + timedelta(minutes=30), status="CONFIRMED", reason="Consulta de prueba"))
        db.add(Appointment(patientId=lucas.id, doctorId=pedro.id, startAt=start + timedelta(hours=1), endAt=start + timedelta(hours=1, minutes=30), status="CONFIRMED", reason="Control de prueba"))
        past = Appointment(patientId=ana.id, doctorId=valeria.id, startAt=start - timedelta(days=7), endAt=start - timedelta(days=7) + timedelta(minutes=30), status="COMPLETED")
        db.add(past)
        db.flush()
        record = MedicalRecord(patientId=ana.id)
        db.add(record)
        db.flush()
        entry = MedicalEntry(recordId=record.id, doctorId=valeria.id, appointmentId=past.id, title="Ejemplo ficticio", content="Entrada de demostración, sin información clínica real.")
        db.add(entry)
        db.flush()
        db.add(AuditLog(userId=valeria.userId, action="medical_record.write", entity="MedicalRecordEntry", entityId=entry.id, details={"source": "development_seed"}))
    return True


def main():
    settings = Settings.load()
    changed = seed(Database(settings.database_url), settings)
    print("Datos ficticios creados." if changed else "La base demo ya existe; se conservaron tus cambios.")
    print("Pacientes: ana@example.com, lucas@example.com")
    print("Médicos: valeria@example.com, pedro@example.com | Admin: admin@example.com")
    print(f"Contraseña de estas cuentas de desarrollo: {PASSWORD}")


if __name__ == "__main__":
    main()
