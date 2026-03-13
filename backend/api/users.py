from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime
from database.init_db import SessionLocal
from database.models import User, Department, AuditLog

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/users")
def create_user(username: str, email: str, password_hash: str, department_id: int,
                db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(400, "Username already exists")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(400, "Email already exists")

    user = User(username=username, email=email, password_hash=password_hash,
                department_id=department_id, is_active=True,
                created_at=datetime.utcnow(), updated_at=datetime.utcnow())
    db.add(user)
    db.flush()  # get user.id before commit

    dept = db.query(Department).filter(Department.id == department_id).first()
    db.add(AuditLog(
        event_type="USER_CREATED", user_id=user.id, target_id=user.id, target_type="user",
        description=f"New user created: {username} ({email}), dept: {dept.name if dept else department_id}",
        created_at=datetime.utcnow(),
    ))
    db.commit()
    db.refresh(user)
    return user


@router.get("/users")
def get_users(
    skip:   int = Query(default=0,   ge=0),
    limit:  int = Query(default=50,  ge=1, le=500),
    search: str = Query(default=""),
    db: Session = Depends(get_db)
):
    q = db.query(User)
    if search:
        q = q.filter(User.username.ilike(f"%{search}%") | User.email.ilike(f"%{search}%"))
    total = q.count()
    users = q.order_by(User.id).offset(skip).limit(limit).all()

    result = []
    for u in users:
        dept = db.query(Department).filter(Department.id == u.department_id).first()
        result.append({
            "id":            u.id,
            "username":      u.username,
            "email":         u.email,
            "department_id": u.department_id,
            "department":    dept.name if dept else None,
            "is_active":     u.is_active,
            "created_at":    u.created_at.isoformat() if u.created_at else None,
        })
    return {"total": total, "skip": skip, "limit": limit, "users": result}


@router.delete("/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    db.add(AuditLog(
        event_type="USER_DEACTIVATED", user_id=user_id, target_id=user_id, target_type="user",
        description=f"User deleted: {user.username} ({user.email})",
        created_at=datetime.utcnow(),
    ))
    db.delete(user)
    db.commit()
    return {"detail": f"User {user.username} deleted"}