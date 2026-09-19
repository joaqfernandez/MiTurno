from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, select, or_
from .dependencies import session, doctor_user
from .models import Doctor, User, Specialty, Schedule, ScheduleOverride, Location
from .schemas import DoctorSettings, ScheduleInput, OverrideInput, LocationsInput, PhotoInput
from .serializers import doctor as serialize, row

router = APIRouter(prefix="/api", tags=["Médicos"])


@router.get("/specialties")
def specialties(db=Depends(session)):
    return [row(item) for item in db.scalars(select(Specialty).order_by(Specialty.name))]


@router.get("/doctors")
def search(specialty: str | None = None, q: str = Query(default="", max_length=100), db=Depends(session)):
    query = select(Doctor).join(User, User.id == Doctor.userId).where(User.status == "ACTIVE")
    if q:
        query = query.where(or_(Doctor.firstName.ilike(f"%{q}%"), Doctor.lastName.ilike(f"%{q}%")))
    doctors = [serialize(db, item) for item in db.scalars(query.order_by(Doctor.lastName).limit(500))]
    return [item for item in doctors if not specialty or any(s["slug"] == specialty for s in item["specialties"])]


@router.get("/doctors/me/settings")
def settings(user=Depends(doctor_user), db=Depends(session)):
    return {key: getattr(user.doctor, key) for key in DoctorSettings.model_fields}


def save_settings(body, user, db):
    changes = body.model_dump(exclude_unset=True)
    for key, value in changes.items():
        if value is None and key not in ("bio", "depositAmount"):
            raise HTTPException(400, f"{key} no admite null")
    requires = changes.get("requiresDeposit", user.doctor.requiresDeposit)
    amount = changes.get("depositAmount", user.doctor.depositAmount)
    if requires and (amount is None or amount <= 0):
        raise HTTPException(400, "Configurá un importe positivo para cobrar seña")
    ids = changes.get("specialtyIds")
    if ids is not None and len(set(ids)) != len(list(db.scalars(select(Specialty.id).where(Specialty.id.in_(ids))))):
        raise HTTPException(400, "Especialidad inválida")
    db.scalar(select(Doctor).where(Doctor.id == user.doctor.id).with_for_update())
    for key, value in changes.items():
        setattr(user.doctor, key, value)
    db.flush()
    return settings(user, db)


@router.patch("/doctors/me/settings")
def update_settings(body: DoctorSettings, user=Depends(doctor_user), db=Depends(session)):
    return save_settings(body, user, db)


@router.patch("/doctors/{doctor_id}/settings")
def update_settings_by_id(doctor_id: str, body: DoctorSettings, user=Depends(doctor_user), db=Depends(session)):
    if doctor_id != user.doctor.id:
        raise HTTPException(403, "Perfil ajeno")
    return save_settings(body, user, db)


@router.get("/doctors/me/schedule")
def schedule(user=Depends(doctor_user), db=Depends(session)):
    return [{key: value for key, value in row(item).items() if key in ("weekday", "startTime", "endTime", "slotMinutes", "validFrom", "validTo")}
            for item in db.scalars(select(Schedule).where(Schedule.doctorId == user.doctor.id).order_by(Schedule.weekday, Schedule.startTime))]


@router.put("/doctors/me/schedule")
def save_schedule(body: ScheduleInput, user=Depends(doctor_user), db=Depends(session)):
    db.scalar(select(Doctor).where(Doctor.id == user.doctor.id).with_for_update())
    db.execute(delete(Schedule).where(Schedule.doctorId == user.doctor.id))
    for block in body.blocks:
        db.add(Schedule(doctorId=user.doctor.id, **block.model_dump()))
    db.flush()
    return schedule(user, db)


@router.put("/doctors/{doctor_id}/schedule")
def save_schedule_by_id(doctor_id: str, body: ScheduleInput, user=Depends(doctor_user), db=Depends(session)):
    if doctor_id != user.doctor.id:
        raise HTTPException(403, "Perfil ajeno")
    return save_schedule(body, user, db)


@router.get("/doctors/me/overrides")
def overrides(user=Depends(doctor_user), db=Depends(session)):
    return [row(item) for item in db.scalars(select(ScheduleOverride).where(ScheduleOverride.doctorId == user.doctor.id))]


@router.post("/doctors/me/overrides", status_code=201)
def create_override(body: OverrideInput, user=Depends(doctor_user), db=Depends(session)):
    db.scalar(select(Doctor).where(Doctor.id == user.doctor.id).with_for_update())
    item = ScheduleOverride(doctorId=user.doctor.id, **body.model_dump())
    db.add(item)
    db.flush()
    return row(item)


@router.delete("/doctors/me/overrides/{override_id}")
def remove_override(override_id: str, user=Depends(doctor_user), db=Depends(session)):
    db.scalar(select(Doctor).where(Doctor.id == user.doctor.id).with_for_update())
    result = db.execute(delete(ScheduleOverride).where(ScheduleOverride.id == override_id, ScheduleOverride.doctorId == user.doctor.id))
    if result.rowcount != 1:
        raise HTTPException(404, "Excepción no encontrada")
    return {"ok": True}


@router.get("/doctors/me/locations")
def locations(user=Depends(doctor_user), db=Depends(session)):
    return [row(item, ("doctorId",)) for item in db.scalars(select(Location).where(Location.doctorId == user.doctor.id))]


@router.put("/doctors/me/locations")
def save_locations(body: LocationsInput, user=Depends(doctor_user), db=Depends(session)):
    db.execute(delete(Location).where(Location.doctorId == user.doctor.id))
    for item in body.locations:
        db.add(Location(doctorId=user.doctor.id, **item.model_dump(exclude={"id"})))
    db.flush()
    return locations(user, db)


@router.get("/doctors/me/photo")
def photo(user=Depends(doctor_user)):
    return {"photoUrl": user.doctor.photoUrl}


@router.put("/doctors/me/photo")
def save_photo(body: PhotoInput, user=Depends(doctor_user)):
    user.doctor.photoUrl = body.photoUrl
    return {"photoUrl": body.photoUrl}


@router.get("/doctors/{doctor_id}")
def detail(doctor_id: str, db=Depends(session)):
    item = db.scalar(select(Doctor).join(User).where(Doctor.id == doctor_id, User.status == "ACTIVE"))
    if not item:
        raise HTTPException(404, "Médico no encontrado")
    return serialize(db, item)
