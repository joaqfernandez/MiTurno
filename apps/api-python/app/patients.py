"""Contrato de entrada: acá se ve qué puede cambiar un paciente."""

from datetime import date
import re

from pydantic import BaseModel, ConfigDict, Field, field_validator


class UpdatePatient(BaseModel):
    # Rechaza campos desconocidos y evita convertir números/objetos a strings.
    model_config = ConfigDict(extra="forbid", strict=True)

    firstName: str | None = Field(default=None, min_length=1)
    lastName: str | None = Field(default=None, min_length=1)
    documentId: str | None = None
    birthDate: str | None = None
    healthInsurance: str | None = None
    insuranceNumber: str | None = None

    @field_validator("*", mode="before")
    @classmethod
    def reject_explicit_null(cls, value):
        # Omitir un campo lo conserva; enviarlo como null es un error.
        if value is None:
            raise ValueError("No se admite null; omití el campo para conservarlo")
        return value

    @field_validator("birthDate")
    @classmethod
    def validate_birth_date(cls, value):
        if not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", value):
            raise ValueError("Usá YYYY-MM-DD")
        date.fromisoformat(value)  # También rechaza fechas imposibles, como 2025-02-30.
        return value


def patient_response(patient: dict) -> dict:
    # La API Nest serializa Date como ISO UTC. Conservamos ese contrato externo.
    result = dict(patient)
    if result["birthDate"] is not None:
        result["birthDate"] += "T00:00:00.000Z"
    return result
