from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database.init_db import SessionLocal
from database.models import User, Department

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/users")
def create_user(username: str, email: str, password_hash: str, department_id: int, db: Session = Depends(get_db)):
    user = User(username=username, email=email, password_hash=password_hash, department_id=department_id)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@router.get("/users")
def get_users(db: Session = Depends(get_db)):
    return db.query(User).all()

@router.delete("/users/{id}")
def delete_user(id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()
    return {"detail": "User deleted"}
