from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database.init_db import SessionLocal
from database.models import AccessRequest, UserRole, AuditLog, SODPolicy, User, Role, Department

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get("/reports/access")
def access_report(db: Session = Depends(get_db)):
    rows = db.query(UserRole).all()
    return [{"user_id": r.user_id, "role_id": r.role_id, "is_active": r.is_active} for r in rows]

@router.get("/reports/sod")
def sod_report(db: Session = Depends(get_db)):
    policies = db.query(SODPolicy).all()
    violations = []
    for policy in policies:
        users_r1 = {ur.user_id for ur in db.query(UserRole).filter(
            UserRole.role_id == policy.role_id_1, UserRole.is_active == True).all()}
        users_r2 = {ur.user_id for ur in db.query(UserRole).filter(
            UserRole.role_id == policy.role_id_2, UserRole.is_active == True).all()}
        conflicted = users_r1 & users_r2
        role1 = db.query(Role).filter(Role.id == policy.role_id_1).first()
        role2 = db.query(Role).filter(Role.id == policy.role_id_2).first()
        for uid in list(conflicted)[:20]:
            user = db.query(User).filter(User.id == uid).first()
            violations.append({
                "user_id": uid,
                "username": user.username if user else f"user{uid}",
                "role_1": role1.name if role1 else str(policy.role_id_1),
                "role_2": role2.name if role2 else str(policy.role_id_2),
                "reason": policy.conflict_reason,
            })
    return {"sod_violations": violations, "total": len(violations)}

@router.get("/reports/audit")
def audit_report(limit: int = 50, db: Session = Depends(get_db)):
    logs = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit).all()
    return [{"id": l.id, "event_type": l.event_type, "user_id": l.user_id,
             "description": l.description,
             "created_at": l.created_at.isoformat() if l.created_at else None} for l in logs]

@router.get("/reports/threats")
def threat_report(db: Session = Depends(get_db)):
    risky = ["USER_LOGIN_FAILED", "PERMISSION_ESCALATION", "SUSPICIOUS_ACCESS", "POLICY_VIOLATION"]
    logs = db.query(AuditLog).filter(AuditLog.event_type.in_(risky))\
              .order_by(AuditLog.created_at.desc()).limit(30).all()
    return [{"id": l.id, "event_type": l.event_type, "user_id": l.user_id,
             "description": l.description,
             "severity": "HIGH" if l.event_type in ["PERMISSION_ESCALATION", "POLICY_VIOLATION"] else "MEDIUM",
             "created_at": l.created_at.isoformat() if l.created_at else None} for l in logs]

@router.get("/reports/risk")
def risk_report(db: Session = Depends(get_db)):
    depts = db.query(Department).all()
    result = []
    for dept in depts:
        user_ids = [u.id for u in db.query(User).filter(User.department_id == dept.id).all()]
        violations = db.query(AuditLog).filter(
            AuditLog.user_id.in_(user_ids),
            AuditLog.event_type.in_(["POLICY_VIOLATION", "PERMISSION_ESCALATION", "SUSPICIOUS_ACCESS"])
        ).count() if user_ids else 0
        result.append({"department": dept.name, "risk_score": violations, "user_count": len(user_ids)})
    return {"risk_scores": result}