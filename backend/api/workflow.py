from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database.init_db import SessionLocal
from database.models import AccessRequest, ApprovalHistory, User, Role
from datetime import datetime

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/request-role")
def request_role(user_id: int, role_id: int, reason: str, db: Session = Depends(get_db)):
    req = AccessRequest(user_id=user_id, role_id=role_id, status="pending", reason=reason)
    db.add(req)
    db.commit()
    db.refresh(req)
    return req

@router.post("/approve-request")
def approve_request(request_id: int, approved_by: int, db: Session = Depends(get_db)):
    req = db.query(AccessRequest).filter(AccessRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    req.status = "approved"
    req.reviewed_by = approved_by
    req.reviewed_at = datetime.utcnow()
    db.commit()
    history = ApprovalHistory(access_request_id=request_id, approved_by=approved_by, status="approved")
    db.add(history)
    db.commit()
    return {"detail": "Request approved"}

@router.post("/reject-request")
def reject_request(request_id: int, rejected_by: int, comments: str, db: Session = Depends(get_db)):
    req = db.query(AccessRequest).filter(AccessRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    req.status = "rejected"
    req.reviewed_by = rejected_by
    req.reviewed_at = datetime.utcnow()
    db.commit()
    history = ApprovalHistory(access_request_id=request_id, approved_by=rejected_by, status="rejected", comments=comments)
    db.add(history)
    db.commit()
    return {"detail": "Request rejected"}
