from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from .dependencies import session, current_user, doctor_user
from .models import Appointment, MedicalRecord, MedicalEntry, Patient, Doctor, Attachment, AuditLog
from .schemas import CreateEntry
from .serializers import row

router = APIRouter(prefix="/api/medical-records", tags=["Historia clínica"])


ENTRY_APPOINTMENT_STATES = ("CONFIRMED", "COMPLETED", "NO_SHOW")


def relationship(db, doctor_id, patient_id, *, lock=False):
    query = select(Appointment.id).where(Appointment.doctorId == doctor_id, Appointment.patientId == patient_id,
                                       Appointment.status.in_(ENTRY_APPOINTMENT_STATES)).order_by(Appointment.id).limit(1)
    # Una cancelación concurrente debe esperar a la escritura autorizada, o ganar
    # antes de esta consulta y hacer que se vuelva a evaluar el estado del turno.
    return db.scalar(query.with_for_update(read=True) if lock else query)


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


def entry_json(db, entry, principal):
    result = row(entry)
    result["canAmend"] = bool(principal.doctor and principal.doctor.id == entry.doctorId)
    doctor = db.get(Doctor, entry.doctorId)
    result["doctor"] = {key: getattr(doctor, key) for key in ("firstName", "lastName", "licenseNumber")}
    result["attachments"] = [row(item, ("storageKey",)) for item in db.scalars(select(Attachment).where(Attachment.entryId == entry.id))]
    result["amendments"] = [row(item) for item in db.scalars(select(MedicalEntry).where(
        MedicalEntry.amendsEntryId == entry.id, MedicalEntry.recordId == entry.recordId))]
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
    return {**row(record), "entries": [entry_json(db, item, principal) for item in db.scalars(select(MedicalEntry).where(MedicalEntry.recordId == record.id).order_by(MedicalEntry.createdAt.desc()))]}


@router.post("/entries", status_code=201)
def add_entry(body: CreateEntry, request: Request, principal=Depends(doctor_user), db=Depends(session)):
    # Lock por paciente: evita historias duplicadas en dos escrituras simultáneas.
    db.scalar(select(Patient).where(Patient.id == body.patientId).with_for_update())
    if not relationship(db, principal.doctor.id, body.patientId, lock=True):
        raise HTTPException(403, "No existe relación asistencial")
    record = db.scalar(select(MedicalRecord).where(MedicalRecord.patientId == body.patientId))
    appointment_id = body.appointmentId
    if body.amendsEntryId is not None:
        original = db.get(MedicalEntry, body.amendsEntryId)
        if not original or not record or original.recordId != record.id:
            raise HTTPException(400, "La enmienda debe pertenecer a esta historia")
        if original.doctorId != principal.doctor.id:
            raise HTTPException(403, "Solo el autor puede enmendar esta entrada; registrá una nueva evolución")
        if "appointmentId" in body.model_fields_set and appointment_id != original.appointmentId:
            raise HTTPException(400, "La enmienda debe conservar el turno de la entrada original")
        appointment_id = original.appointmentId
    if appointment_id is not None:
        appointment = db.scalar(select(Appointment).where(Appointment.id == appointment_id).with_for_update(read=True))
        if not appointment or appointment.patientId != body.patientId or appointment.doctorId != principal.doctor.id:
            raise HTTPException(400, "El turno no pertenece a este paciente y médico")
        # Se permite corregir una entrada previa aunque su turno se haya cancelado.
        if body.amendsEntryId is None and appointment.status not in ENTRY_APPOINTMENT_STATES:
            raise HTTPException(400, "El turno debe estar confirmado, atendido o registrado como ausente")
    if not record:
        record = MedicalRecord(patientId=body.patientId)
        db.add(record)
        db.flush()
    entry = MedicalEntry(recordId=record.id, doctorId=principal.doctor.id, appointmentId=appointment_id,
                         **body.model_dump(exclude={"patientId", "appointmentId"}))
    db.add(entry)
    db.flush()
    audit(db, principal, "medical_record.write", "MedicalRecordEntry", entry.id, request)
    return entry_json(db, entry, principal)
