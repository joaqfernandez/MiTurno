from datetime import date
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from pydantic import AliasChoices, AwareDatetime, BaseModel, ConfigDict, EmailStr, Field, StrictBool, StrictInt, StrictStr, model_validator, field_validator


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Register(Input):
    email: EmailStr
    password: StrictStr = Field(min_length=8, max_length=128)
    firstName: StrictStr = Field(min_length=1, max_length=100)
    lastName: StrictStr = Field(min_length=1, max_length=100)
    role: Literal["PATIENT", "DOCTOR"]
    licenseNumber: StrictStr | None = Field(default=None, max_length=100)
    phone: StrictStr | None = Field(default=None, max_length=64)

    @model_validator(mode="after")
    def license_required(self):
        if self.role == "DOCTOR" and not (self.licenseNumber or "").strip():
            raise ValueError("La matrícula es obligatoria")
        return self


class Login(Input):
    email: EmailStr
    password: StrictStr = Field(max_length=128)


class Refresh(Input):
    refreshToken: StrictStr = Field(min_length=32, max_length=256)


class DoctorSettings(Input):
    bio: StrictStr | None = Field(default=None, max_length=5000)
    requiresDeposit: StrictBool | None = None
    depositAmount: float | None = Field(default=None, gt=0, le=99999999)
    defaultSlotMinutes: StrictInt | None = Field(default=None, ge=5, le=240)
    cancellationWindowHours: StrictInt | None = Field(default=None, ge=0, le=720)
    timezone: StrictStr | None = None
    specialtyIds: list[StrictStr] | None = Field(default=None, max_length=20)

    @field_validator("timezone")
    @classmethod
    def timezone_valid(cls, value):
        if value is not None:
            try:
                ZoneInfo(value)
            except ZoneInfoNotFoundError:
                raise ValueError("Zona horaria inválida")
        return value


class ScheduleBlock(Input):
    weekday: StrictInt = Field(ge=0, le=6)
    startTime: StrictStr = Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    endTime: StrictStr = Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    slotMinutes: StrictInt | None = Field(default=None, ge=5, le=240)
    validFrom: date | None = None
    validTo: date | None = None

    @model_validator(mode="after")
    def interval_valid(self):
        if self.startTime >= self.endTime or (self.validFrom and self.validTo and self.validFrom > self.validTo):
            raise ValueError("Intervalo inválido")
        return self


class ScheduleInput(Input):
    blocks: list[ScheduleBlock] = Field(max_length=50, validation_alias=AliasChoices("blocks", "schedules"))

    @model_validator(mode="after")
    def no_overlap(self):
        for i, first in enumerate(self.blocks):
            for second in self.blocks[i + 1:]:
                dates_overlap = (first.validFrom or date.min) <= (second.validTo or date.max) and (second.validFrom or date.min) <= (first.validTo or date.max)
                if dates_overlap and first.weekday == second.weekday and first.startTime < second.endTime and first.endTime > second.startTime:
                    raise ValueError("Las franjas no pueden superponerse")
        return self


class OverrideInput(Input):
    type: Literal["BLOCKED", "EXTRA"]
    date: date
    startTime: StrictStr | None = Field(default=None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    endTime: StrictStr | None = Field(default=None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    reason: StrictStr | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def valid_hours(self):
        if bool(self.startTime) != bool(self.endTime) or (self.startTime and self.startTime >= self.endTime):
            raise ValueError("Horas inválidas")
        if self.type == "EXTRA" and not self.startTime:
            raise ValueError("La franja EXTRA requiere horas")
        return self


class LocationInput(Input):
    id: StrictStr | None = None
    name: StrictStr = Field(min_length=1, max_length=200)
    address: StrictStr = Field(min_length=1, max_length=500)
    notes: StrictStr | None = Field(default=None, max_length=1000)
    weekdays: list[StrictInt] = Field(max_length=7)

    @field_validator("weekdays")
    @classmethod
    def weekdays_valid(cls, value):
        if len(set(value)) != len(value) or any(day < 0 or day > 6 for day in value):
            raise ValueError("Días inválidos")
        return value


class LocationsInput(Input):
    locations: list[LocationInput] = Field(max_length=10)


class PhotoInput(Input):
    photoUrl: StrictStr | None = Field(default=None, max_length=400000)

    @field_validator("photoUrl")
    @classmethod
    def photo_valid(cls, value):
        if value and not value.startswith(("https://", "data:image/png;base64,", "data:image/jpeg;base64,", "data:image/webp;base64,")):
            raise ValueError("Foto inválida")
        return value


class Book(Input):
    doctorId: StrictStr = Field(min_length=1, max_length=64)
    startAt: AwareDatetime
    reason: StrictStr | None = Field(default=None, max_length=2000)


class Cancel(Input):
    reason: StrictStr | None = Field(default=None, max_length=1000)


class CreateEntry(Input):
    patientId: StrictStr = Field(min_length=1, max_length=64)
    title: StrictStr = Field(min_length=1, max_length=300)
    content: StrictStr = Field(min_length=1, max_length=50000)
    appointmentId: StrictStr | None = Field(default=None, min_length=1, max_length=64)
    amendsEntryId: StrictStr | None = Field(default=None, min_length=1, max_length=64)


class AppointmentState(Input):
    status: Literal["COMPLETED", "NO_SHOW"]


class UserState(Input):
    status: Literal["ACTIVE", "SUSPENDED"]
