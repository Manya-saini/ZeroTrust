from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database.init_db import SessionLocal
from database.models import Role, Permission, RolePermission

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/roles")
def create_role(name: str, description: str = None, parent_role_id: int = None, db: Session = Depends(get_db)):
    role = Role(name=name, description=description, parent_role_id=parent_role_id)
    db.add(role)
    db.commit()
    db.refresh(role)
    return role

@router.get("/roles")
def get_roles(db: Session = Depends(get_db)):
    return db.query(Role).all()

@router.post("/roles/{id}/permissions")
def assign_permission(id: int, permission_id: int, db: Session = Depends(get_db)):
    role = db.query(Role).filter(Role.id == id).first()
    permission = db.query(Permission).filter(Permission.id == permission_id).first()
    if not role or not permission:
        raise HTTPException(status_code=404, detail="Role or Permission not found")
    rp = RolePermission(role_id=role.id, permission_id=permission.id)
    db.add(rp)
    db.commit()
    return {"detail": "Permission assigned to role"}
