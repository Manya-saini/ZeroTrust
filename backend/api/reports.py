from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database.init_db import SessionLocal
from database.models import AccessRequest, UserRole, AuditLog

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get("/reports/access")
def access_report(db: Session = Depends(get_db)):
    return db.query(UserRole).all()

@router.get("/reports/risk")
def risk_report(db: Session = Depends(get_db)):
    # Placeholder: risk scoring logic will be added
    return {"risk_scores": []}

@router.get("/reports/sod")
def sod_report(db: Session = Depends(get_db)):
    # Placeholder: SOD policy violations logic will be added
    return {"sod_violations": []}
