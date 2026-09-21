"""Modelos del monolito. JSON conserva el contrato de roles/especialidades con la web."""
from datetime import datetime, timezone
from uuid import uuid4
from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, Integer, JSON, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import TypeDecorator


def now():
    return datetime.now(timezone.utc)


class UTCDateTime(TypeDecorator):
    impl = DateTime(timezone=True)
    cache_ok = True

    def process_result_value(self, value, dialect):
        return value.replace(tzinfo=timezone.utc) if value and value.tzinfo is None else value


class Base(DeclarativeBase):
    pass


class Entity:
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid4()))
    createdAt: Mapped[datetime] = mapped_column(UTCDateTime, default=now)


class User(Entity, Base):
    __tablename__ = "users"
    email: Mapped[str] = mapped_column(String(320), unique=True)
    passwordHash: Mapped[str | None] = mapped_column(Text)
    googleSubject: Mapped[str | None] = mapped_column(String(255), unique=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(64))
    roles: Mapped[list] = mapped_column(JSON, default=lambda: ["PATIENT"])
    status: Mapped[str] = mapped_column(String(32), default="ACTIVE")
    sessionVersion: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    updatedAt: Mapped[datetime] = mapped_column(UTCDateTime, default=now, onupdate=now)


class RefreshToken(Entity, Base):
    __tablename__ = "refresh_tokens"
    userId: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    tokenHash: Mapped[str] = mapped_column(String(64), unique=True)
    expiresAt: Mapped[datetime] = mapped_column(UTCDateTime)
    revokedAt: Mapped[datetime | None] = mapped_column(UTCDateTime)


class Patient(Entity, Base):
    __tablename__ = "patient_profiles"
    userId: Mapped[str] = mapped_column(ForeignKey("users.id"), unique=True)
    firstName: Mapped[str] = mapped_column(String(100))
    lastName: Mapped[str] = mapped_column(String(100))
    documentId: Mapped[str | None] = mapped_column(String(64), unique=True)
    birthDate: Mapped[datetime | None] = mapped_column(UTCDateTime)
    healthInsurance: Mapped[str | None] = mapped_column(String(200))
    insuranceNumber: Mapped[str | None] = mapped_column(String(100))
    updatedAt: Mapped[datetime] = mapped_column(UTCDateTime, default=now, onupdate=now)


class Specialty(Entity, Base):
    __tablename__ = "specialties"
    name: Mapped[str] = mapped_column(String(100), unique=True)
    slug: Mapped[str] = mapped_column(String(100), unique=True)


class Doctor(Entity, Base):
    __tablename__ = "doctor_profiles"
    userId: Mapped[str] = mapped_column(ForeignKey("users.id"), unique=True)
    firstName: Mapped[str] = mapped_column(String(100))
    lastName: Mapped[str] = mapped_column(String(100))
    licenseNumber: Mapped[str] = mapped_column(String(100), unique=True)
    bio: Mapped[str | None] = mapped_column(Text)
    photoUrl: Mapped[str | None] = mapped_column(Text)
    specialtyIds: Mapped[list] = mapped_column(JSON, default=list)
    requiresDeposit: Mapped[bool] = mapped_column(Boolean, default=False)
    depositAmount: Mapped[float | None] = mapped_column(Numeric(10, 2))
    depositCurrency: Mapped[str] = mapped_column(String(3), default="ARS")
    defaultSlotMinutes: Mapped[int] = mapped_column(Integer, default=30)
    cancellationWindowHours: Mapped[int] = mapped_column(Integer, default=24)
    timezone: Mapped[str] = mapped_column(String(100), default="America/Argentina/Mendoza")
    icsFeedToken: Mapped[str | None] = mapped_column(String(128), unique=True)
    __table_args__ = (CheckConstraint('"defaultSlotMinutes" > 0'), CheckConstraint('"cancellationWindowHours" >= 0'))


class Location(Entity, Base):
    __tablename__ = "locations"
    doctorId: Mapped[str] = mapped_column(ForeignKey("doctor_profiles.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    address: Mapped[str] = mapped_column(String(500))
    notes: Mapped[str | None] = mapped_column(String(1000))
    weekdays: Mapped[list] = mapped_column(JSON, default=list)


class Schedule(Entity, Base):
    __tablename__ = "doctor_schedules"
    doctorId: Mapped[str] = mapped_column(ForeignKey("doctor_profiles.id"), index=True)
    weekday: Mapped[int] = mapped_column(Integer)
    startTime: Mapped[str] = mapped_column(String(5))
    endTime: Mapped[str] = mapped_column(String(5))
    slotMinutes: Mapped[int | None] = mapped_column(Integer)
    validFrom: Mapped[datetime | None] = mapped_column(Date)
    validTo: Mapped[datetime | None] = mapped_column(Date)
    __table_args__ = (CheckConstraint('weekday BETWEEN 0 AND 6'), CheckConstraint('"slotMinutes" IS NULL OR "slotMinutes" > 0'))


class ScheduleOverride(Entity, Base):
    __tablename__ = "schedule_overrides"
    doctorId: Mapped[str] = mapped_column(ForeignKey("doctor_profiles.id"), index=True)
    type: Mapped[str] = mapped_column(String(16))
    date: Mapped[datetime] = mapped_column(Date)
    startTime: Mapped[str | None] = mapped_column(String(5))
    endTime: Mapped[str | None] = mapped_column(String(5))
    reason: Mapped[str | None] = mapped_column(String(500))


class Appointment(Entity, Base):
    __tablename__ = "appointments"
    patientId: Mapped[str] = mapped_column(ForeignKey("patient_profiles.id"), index=True)
    doctorId: Mapped[str] = mapped_column(ForeignKey("doctor_profiles.id"), index=True)
    startAt: Mapped[datetime] = mapped_column(UTCDateTime, index=True)
    endAt: Mapped[datetime] = mapped_column(UTCDateTime)
    status: Mapped[str] = mapped_column(String(32), default="CONFIRMED", index=True)
    reason: Mapped[str | None] = mapped_column(String(2000))
    notes: Mapped[str | None] = mapped_column(Text)
    cancelledAt: Mapped[datetime | None] = mapped_column(UTCDateTime)
    cancellationReason: Mapped[str | None] = mapped_column(String(1000))
    updatedAt: Mapped[datetime] = mapped_column(UTCDateTime, default=now, onupdate=now)
    __table_args__ = (CheckConstraint('"endAt" > "startAt"'),)


class Payment(Entity, Base):
    __tablename__ = "payments"
    appointmentId: Mapped[str] = mapped_column(ForeignKey("appointments.id"), unique=True)
    provider: Mapped[str] = mapped_column(String(32), default="mercadopago")
    preferenceId: Mapped[str | None] = mapped_column(String(128))
    externalPaymentId: Mapped[str | None] = mapped_column(String(128), unique=True)
    checkoutUrl: Mapped[str | None] = mapped_column(Text)
    amount: Mapped[float] = mapped_column(Numeric(10, 2))
    currency: Mapped[str] = mapped_column(String(3), default="ARS")
    status: Mapped[str] = mapped_column(String(32), default="PENDING")
    paidAt: Mapped[datetime | None] = mapped_column(UTCDateTime)
    rawWebhookPayload: Mapped[dict | None] = mapped_column(JSON)


class MedicalRecord(Entity, Base):
    __tablename__ = "medical_records"
    patientId: Mapped[str] = mapped_column(ForeignKey("patient_profiles.id"), unique=True)
    allergies: Mapped[str | None] = mapped_column(Text)
    chronicConditions: Mapped[str | None] = mapped_column(Text)
    currentMedication: Mapped[str | None] = mapped_column(Text)


class MedicalEntry(Entity, Base):
    __tablename__ = "medical_record_entries"
    recordId: Mapped[str] = mapped_column(ForeignKey("medical_records.id"), index=True)
    doctorId: Mapped[str] = mapped_column(ForeignKey("doctor_profiles.id"))
    appointmentId: Mapped[str | None] = mapped_column(ForeignKey("appointments.id"))
    title: Mapped[str] = mapped_column(String(300))
    content: Mapped[str] = mapped_column(Text)
    amendsEntryId: Mapped[str | None] = mapped_column(ForeignKey("medical_record_entries.id"))


class Attachment(Entity, Base):
    __tablename__ = "attachments"
    entryId: Mapped[str] = mapped_column(ForeignKey("medical_record_entries.id"))
    fileName: Mapped[str] = mapped_column(String(255))
    mimeType: Mapped[str] = mapped_column(String(128))
    sizeBytes: Mapped[int] = mapped_column(Integer)
    storageKey: Mapped[str] = mapped_column(String(512), unique=True)


class CalendarAccount(Entity, Base):
    __tablename__ = "calendar_accounts"
    doctorId: Mapped[str] = mapped_column(ForeignKey("doctor_profiles.id"), index=True)
    provider: Mapped[str] = mapped_column(String(32), default="google")
    externalEmail: Mapped[str] = mapped_column(String(320))
    accessTokenEnc: Mapped[str] = mapped_column(Text)
    refreshTokenEnc: Mapped[str] = mapped_column(Text)
    tokenExpiresAt: Mapped[datetime] = mapped_column(UTCDateTime)
    calendarId: Mapped[str] = mapped_column(String(200), default="primary")
    __table_args__ = (UniqueConstraint("doctorId", "provider", "externalEmail"),)


class CalendarEvent(Entity, Base):
    __tablename__ = "calendar_events"
    appointmentId: Mapped[str] = mapped_column(ForeignKey("appointments.id"))
    accountId: Mapped[str] = mapped_column(ForeignKey("calendar_accounts.id"))
    externalEventId: Mapped[str] = mapped_column(String(128))
    __table_args__ = (UniqueConstraint("appointmentId", "accountId"),)


class OAuthState(Entity, Base):
    __tablename__ = "oauth_states"
    tokenHash: Mapped[str] = mapped_column(String(64), unique=True)
    userId: Mapped[str] = mapped_column(ForeignKey("users.id"))
    doctorId: Mapped[str] = mapped_column(ForeignKey("doctor_profiles.id"))
    expiresAt: Mapped[datetime] = mapped_column(UTCDateTime)
    usedAt: Mapped[datetime | None] = mapped_column(UTCDateTime)


class Notification(Entity, Base):
    __tablename__ = "notifications"
    userId: Mapped[str] = mapped_column(ForeignKey("users.id"))
    channel: Mapped[str] = mapped_column(String(16), default="EMAIL")
    template: Mapped[str] = mapped_column(String(100))
    payload: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(32), default="QUEUED")
    sentAt: Mapped[datetime | None] = mapped_column(UTCDateTime)
    error: Mapped[str | None] = mapped_column(Text)
    dedupeKey: Mapped[str] = mapped_column(String(255), unique=True)


class Job(Entity, Base):
    __tablename__ = "jobs"
    kind: Mapped[str] = mapped_column(String(64))
    entityId: Mapped[str] = mapped_column(String(64))
    dedupeKey: Mapped[str] = mapped_column(String(255), unique=True)
    status: Mapped[str] = mapped_column(String(16), default="PENDING", index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    availableAt: Mapped[datetime] = mapped_column(UTCDateTime, default=now)
    lockedAt: Mapped[datetime | None] = mapped_column(UTCDateTime)
    error: Mapped[str | None] = mapped_column(Text)


class AuditLog(Entity, Base):
    __tablename__ = "audit_logs"
    userId: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(100))
    entity: Mapped[str] = mapped_column(String(100))
    entityId: Mapped[str | None] = mapped_column(String(64))
    details: Mapped[dict | None] = mapped_column("metadata", JSON)
    ip: Mapped[str | None] = mapped_column(String(64))


class OAuthRequest(Entity, Base):
    __tablename__ = "oauth_requests"
    tokenHash: Mapped[str] = mapped_column(String(64), unique=True)
    bindingHash: Mapped[str] = mapped_column(String(64))
    purpose: Mapped[str] = mapped_column(String(16))
    userId: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    sessionVersion: Mapped[int | None] = mapped_column(Integer)
    nonce: Mapped[str] = mapped_column(String(128))
    expiresAt: Mapped[datetime] = mapped_column(UTCDateTime, index=True)
