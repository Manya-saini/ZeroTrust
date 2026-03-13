from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from database.init_db import SessionLocal
from database.models import AccessRequest, ApprovalHistory, User, Role, AuditLog, UserRole

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/request-role")
def request_role(user_id: int, role_id: int, reason: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    role = db.query(Role).filter(Role.id == role_id).first()
    if not user: raise HTTPException(404, "User not found")
    if not role: raise HTTPException(404, "Role not found")

    if db.query(AccessRequest).filter(
        AccessRequest.user_id == user_id, AccessRequest.role_id == role_id,
        AccessRequest.status == "pending"
    ).first():
        raise HTTPException(400, "Pending request already exists for this user/role")

    req = AccessRequest(user_id=user_id, role_id=role_id, status="pending",
                        reason=reason, requested_at=datetime.utcnow())
    db.add(req)
    db.flush()

    db.add(AuditLog(
        event_type="ROLE_REQUESTED", user_id=user_id, target_id=role_id, target_type="role",
        description=f"{user.username} requested role '{role.name}'. Reason: {reason}",
        created_at=datetime.utcnow(),
    ))
    db.commit()
    db.refresh(req)
    return req


@router.get("/requests")
def list_requests(status: str = None, db: Session = Depends(get_db)):
    q = db.query(AccessRequest)
    if status:
        q = q.filter(AccessRequest.status == status)
    result = []
    for r in q.order_by(AccessRequest.requested_at.desc()).all():
        user = db.query(User).filter(User.id == r.user_id).first()
        role = db.query(Role).filter(Role.id == r.role_id).first()
        result.append({
            "id": r.id,
            "user_id": r.user_id,
            "username": user.username if user else f"user#{r.user_id}",
            "role_id": r.role_id,
            "role_name": role.name if role else f"role#{r.role_id}",
            "status": r.status,
            "reason": r.reason,
            "requested_at": r.requested_at.isoformat() if r.requested_at else None,
            "reviewed_at": r.reviewed_at.isoformat() if r.reviewed_at else None,
        })
    return result


@router.post("/approve-request")
def approve_request(request_id: int, approved_by: int, db: Session = Depends(get_db)):
    req = db.query(AccessRequest).filter(AccessRequest.id == request_id).first()
    if not req: raise HTTPException(404, "Request not found")
    if req.status != "pending": raise HTTPException(400, f"Request is already {req.status}")

    now = datetime.utcnow()
    req.status = "approved"
    req.reviewed_by = approved_by
    req.reviewed_at = now

    user = db.query(User).filter(User.id == req.user_id).first()
    role = db.query(Role).filter(Role.id == req.role_id).first()

    # Auto-provision role on approval
    if not db.query(UserRole).filter(UserRole.user_id == req.user_id,
                                     UserRole.role_id == req.role_id,
                                     UserRole.is_active == True).first():
        db.add(UserRole(user_id=req.user_id, role_id=req.role_id,
                        assigned_by=approved_by, is_active=True, assigned_at=now))

    db.add(ApprovalHistory(access_request_id=request_id, approved_by=approved_by,
                           approved_at=now, status="approved"))
    db.add(AuditLog(
        event_type="ROLE_ASSIGNED", user_id=req.user_id, target_id=req.role_id, target_type="role",
        description=(f"Request #{request_id} APPROVED: role '{role.name if role else req.role_id}' "
                     f"granted to {user.username if user else req.user_id} by user#{approved_by}"),
        created_at=now,
    ))
    db.commit()
    return {"detail": "Request approved and role provisioned"}


@router.post("/reject-request")
def reject_request(request_id: int, rejected_by: int, comments: str, db: Session = Depends(get_db)):
    req = db.query(AccessRequest).filter(AccessRequest.id == request_id).first()
    if not req: raise HTTPException(404, "Request not found")
    if req.status != "pending": raise HTTPException(400, f"Request is already {req.status}")

    now = datetime.utcnow()
    req.status = "rejected"
    req.reviewed_by = rejected_by
    req.reviewed_at = now

    user = db.query(User).filter(User.id == req.user_id).first()
    role = db.query(Role).filter(Role.id == req.role_id).first()

    db.add(ApprovalHistory(access_request_id=request_id, approved_by=rejected_by,
                           approved_at=now, status="rejected", comments=comments))
    db.add(AuditLog(
        event_type="ROLE_REVOKED", user_id=req.user_id, target_id=req.role_id, target_type="role",
        description=(f"Request #{request_id} REJECTED: role '{role.name if role else req.role_id}' "
                     f"denied for {user.username if user else req.user_id}. Reason: {comments}"),
        created_at=now,
    ))
    db.commit()
    return {"detail": "Request rejected"}