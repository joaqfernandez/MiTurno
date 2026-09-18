from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from .dependencies import session, current_user, doctor_user
from .models import Appointment, MedicalRecord, MedicalEntry, Patient, Doctor, Attachment, AuditLog
from .schemas import CreateEntry
from .serializers import row

router = APIRouter(prefix="/api/medical-records", tags=["Historia clínica"])


def relationship(db, doctor_id, patient_id):
    return db.scalar(select(Appointment.id).where(Appointment.doctorId == doctor_id, Appointment.patientId == patient_id,
                                                 Appointment.status.in_(["CONFIRMED", "COMPLETED", "NO_SHOW"])).limit(1))


def can_read(db, principal, patient_id):
    if principal.patient and principal.patient.id == patient_id:
        return
    if "ADMIN" in principal.user.roles:
        return
    if principal.doctor and relationship(db, principal.doctor.id, patient_id):
        return
    raise HTTPException(403, "No existe relación asistencial con este paciente")


def audit(db, principal, action, entity, entity_id, request):
    db.add(AuditLog(userId=principal.user.id, action=action, entity=entity, entityId=entity_id,
                    ip=request.client.host if request.client else None))
    db.flush()


def entry_json(db, entry):
    result = row(entry)
    doctor = db.get(Doctor, entry.doctorId)
    result["doctor"] = {key: getattr(doctor, key) for key in ("firstName", "lastName", "licenseNumber")}
    result["attachments"] = [row(item, ("storageKey",)) for item in db.scalars(select(Attachment).where(Attachment.entryId == entry.id))]
    result["amendments"] = [row(item) for item in db.scalars(select(MedicalEntry).where(MedicalEntry.amendsEntryId == entry.id))]
    return result


@router.get("/{patient_id}")
def get_record(patient_id: str, request: Request, principal=Depends(current_user), db=Depends(session)):
    can_read(db, principal, patient_id)
    if not db.get(Patient, patient_id):
        raise HTTPException(404, "Paciente no encontrado")
    record = db.scalar(select(MedicalRecord).where(MedicalRecord.patientId == patient_id))
    audit(db, principal, "medical_record.read", "PatientProfile", patient_id, request)
    if not record:
        return {"id": None, "patientId": patient_id, "entries": []}
    return {**row(record), "entries": [entry_json(db, item) for item in db.scalars(select(MedicalEntry).where(MedicalEntry.recordId == record.id).order_by(MedicalEntry.createdAt.desc()))]}


@router.post("/entries", status_code=201)
def add_entry(body: CreateEntry, request: Request, principal=Depends(doctor_user), db=Depends(session)):
    if not relationship(db, principal.doctor.id, body.patientId):
        raise HTTPException(403, "No existe relación asistencial")
    # Lock por paciente: evita historias duplicadas en dos escrituras simultáneas.
    db.scalar(select(Patient).where(Patient.id == body.patientId).with_for_update())
    record = db.scalar(select(MedicalRecord).where(MedicalRecord.patientId == body.patientId))
    if not record:
        record = MedicalRecord(patientId=body.patientId)
        db.add(record)
        db.flush()
    if body.amendsEntryId:
        original = db.get(MedicalEntry, body.amendsEntryId)
        if not original or original.recordId != record.id:
            raise HTTPException(400, "La enmienda debe pertenecer a esta historia")
    if body.appointmentId:
        appointment = db.get(Appointment, body.appointmentId)
        if not appointment or appointment.patientId != body.patientId or appointment.doctorId != principal.doctor.id:
            raise HTTPException(400, "El turno no pertenece a este paciente y médico")
    entry = MedicalEntry(recordId=record.id, doctorId=principal.doctor.id, **body.model_dump(exclude={"patientId"}))
    db.add(entry)
    db.flush()
    audit(db, principal, "medical_record.write", "MedicalRecordEntry", entry.id, request)
    return entry_json(db, entry)
