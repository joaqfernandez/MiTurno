import pytest
from sqlalchemy import func, select
from app.models import Appointment, Job, Notification
from app.outbox import appointment_effects
from conftest import reserve


@pytest.mark.parametrize("patient_id,doctor_id", [("missing", "doctor"), ("patient-own", "missing")])
def test_missing_profile_does_not_create_partial_effects(system, patient_id, doctor_id):
    appointment = Appointment(id="invalid-appointment", patientId=patient_id, doctorId=doctor_id, status="CONFIRMED")
    with system.database.transaction() as db:
        with pytest.raises(ValueError, match="paciente y un médico existentes"):
            appointment_effects(db, appointment)
        assert db.scalar(select(func.count()).select_from(Notification)) == 0
        assert db.scalar(select(func.count()).select_from(Job)) == 0


def test_valid_appointment_notifies_both_users_without_duplicates(system):
    response = reserve(system)
    assert response.status_code == 201
    with system.database.transaction() as db:
        appointment = db.get(Appointment, response.json()["id"])
        assert appointment is not None
        appointment_effects(db, appointment)
        notifications = list(db.scalars(select(Notification)))
        assert {item.userId for item in notifications} == {"user-own", "user-doctor"}
        assert len(notifications) == 2
        assert db.scalar(select(func.count()).select_from(Job)) == 3
