from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database.init_db import SessionLocal
from database.models import UserRole, Role, User

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/provision-role")
def provision_role(user_id: int, role_id: int, assigned_by: int, db: Session = Depends(get_db)):
    ur = UserRole(user_id=user_id, role_id=role_id, assigned_by=assigned_by, is_active=True)
    db.add(ur)
    db.commit()
    return {"detail": "Role provisioned to user"}

@router.post("/revoke-role")
def revoke_role(user_id: int, role_id: int, db: Session = Depends(get_db)):
    ur = db.query(UserRole).filter(UserRole.user_id == user_id, UserRole.role_id == role_id, UserRole.is_active == True).first()
    if not ur:
        raise HTTPException(status_code=404, detail="Active role assignment not found")
    ur.is_active = False
    db.commit()
    return {"detail": "Role revoked from user"}
