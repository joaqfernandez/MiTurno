from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, update
from .dependencies import session, admin_user
from .models import User, Doctor, RefreshToken, AuditLog, Job, now
from .schemas import UserState
from .serializers import row

router = APIRouter(prefix="/api/admin", tags=["Administración"])


@router.get("/doctors")
def doctors(user=Depends(admin_user), db=Depends(session)):
    return [{**row(doctor, ("icsFeedToken",)), "email": account.email, "status": account.status}
            for doctor, account in db.execute(select(Doctor, User).join(User).order_by(Doctor.createdAt).limit(500))]


@router.patch("/users/{user_id}/status")
def set_status(user_id: str, body: UserState, request: Request, user=Depends(admin_user), db=Depends(session)):
    account = db.scalar(select(User).where(User.id == user_id).with_for_update().execution_options(populate_existing=True))
    if not account or account.id == user.user.id:
        raise HTTPException(400, "Usuario no válido para esta operación")
    account.status = body.status
    if body.status == "SUSPENDED":
        account.sessionVersion += 1
        db.execute(update(RefreshToken).where(RefreshToken.userId == user_id).values(revokedAt=now()))
    db.add(AuditLog(userId=user.user.id, action="user.status", entity="User", entityId=user_id, details={"status": body.status}, ip=request.client.host if request.client else None))
    return {"id": account.id, "status": account.status}


@router.get("/jobs")
def jobs(user=Depends(admin_user), db=Depends(session)):
    return [row(job) for job in db.scalars(select(Job).where(Job.status != "DONE").order_by(Job.createdAt).limit(200))]


@router.post("/jobs/{job_id}/retry")
def retry(job_id: str, user=Depends(admin_user), db=Depends(session)):
    job = db.scalar(select(Job).where(Job.id == job_id).with_for_update())
    if not job or job.status not in ("FAILED", "PENDING"):
        raise HTTPException(409, "El trabajo no se puede reintentar")
    job.status, job.attempts, job.availableAt = "PENDING", 0, now()
    return {"ok": True}
