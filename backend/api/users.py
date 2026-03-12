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
def create_user(
    username: str,
    email: str,
    password_hash: str,
    department_id: int,
    db: Session = Depends(get_db)
):
    # Check duplicates
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(status_code=400, detail="Username already exists")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="Email already exists")

    user = User(
        username=username,
        email=email,
        password_hash=password_hash,
        department_id=department_id,
        is_active=True,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # ✅ Write audit log so it shows in the UI
    db.add(AuditLog(
        event_type="USER_CREATED",
        user_id=user.id,
        target_id=user.id,
        target_type="user",
        description=f"New user created: {username} ({email}) in dept {department_id}",
        created_at=datetime.utcnow(),
    ))
    db.commit()

    return user

@router.get("/users")
def get_users(
    skip: int = Query(default=0,   ge=0,   description="Number of records to skip"),
    limit: int = Query(default=50, ge=1,   le=500, description="Max records to return"),
    search: str = Query(default="",        description="Filter by username or email"),
    db: Session = Depends(get_db)
):
    query = db.query(User)
    if search:
        query = query.filter(
            User.username.ilike(f"%{search}%") |
            User.email.ilike(f"%{search}%")
        )
    total = query.count()
    users = query.offset(skip).limit(limit).all()
    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "users": users,
    }

@router.delete("/users/{id}")
def delete_user(id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # ✅ Write audit log before deleting
    db.add(AuditLog(
        event_type="USER_DEACTIVATED",
        user_id=id,
        target_id=id,
        target_type="user",
        description=f"User deleted: {user.username} ({user.email})",
        created_at=datetime.utcnow(),
    ))

    db.delete(user)
    db.commit()
    return {"detail": f"User {user.username} deleted"}