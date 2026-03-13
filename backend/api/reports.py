from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from database.init_db import SessionLocal
from database.models import UserRole, AuditLog, SODPolicy, User, Role, Department

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/departments")
def get_departments(db: Session = Depends(get_db)):
    """Live list of all departments — used by frontend so dept names are never hardcoded."""
    return [{"id": d.id, "name": d.name} for d in db.query(Department).all()]


@router.get("/reports/access")
def access_report(db: Session = Depends(get_db)):
    """All user-role assignments with role name resolved."""
    rows = db.query(UserRole).all()
    result = []
    for r in rows:
        role = db.query(Role).filter(Role.id == r.role_id).first()
        result.append({
            "user_id":   r.user_id,
            "role_id":   r.role_id,
            "role_name": role.name if role else str(r.role_id),
            "is_active": r.is_active,
        })
    return result


@router.get("/reports/sod")
def sod_report(db: Session = Depends(get_db)):
    """
    Live SOD violations — computed fresh from user_roles + sod_policies every call.
    No hardcoded data. Updates the moment a role is assigned or revoked.
    """
    policies  = db.query(SODPolicy).all()
    violations = []

    for policy in policies:
        users_r1 = {ur.user_id for ur in db.query(UserRole).filter(
            UserRole.role_id == policy.role_id_1, UserRole.is_active == True).all()}
        users_r2 = {ur.user_id for ur in db.query(UserRole).filter(
            UserRole.role_id == policy.role_id_2, UserRole.is_active == True).all()}
        conflicted = users_r1 & users_r2

        role1 = db.query(Role).filter(Role.id == policy.role_id_1).first()
        role2 = db.query(Role).filter(Role.id == policy.role_id_2).first()

        for uid in conflicted:
            user = db.query(User).filter(User.id == uid).first()
            dept = db.query(Department).filter(Department.id == user.department_id).first() if user else None
            violations.append({
                "user_id":    uid,
                "username":   user.username if user else f"user#{uid}",
                "department": dept.name if dept else "Unknown",
                "role_1":     role1.name if role1 else str(policy.role_id_1),
                "role_2":     role2.name if role2 else str(policy.role_id_2),
                "reason":     policy.conflict_reason,
            })

    return {"sod_violations": violations, "total": len(violations)}


@router.get("/reports/audit")
def audit_report(
    limit: int = Query(default=100, le=500),
    skip:  int = Query(default=0,   ge=0),
    db: Session = Depends(get_db)
):
    """Paginated audit log, newest first, with username resolved."""
    total = db.query(AuditLog).count()
    logs  = db.query(AuditLog).order_by(AuditLog.created_at.desc()).offset(skip).limit(limit).all()

    result = []
    for l in logs:
        user = db.query(User).filter(User.id == l.user_id).first() if l.user_id else None
        result.append({
            "id":         l.id,
            "event_type": l.event_type,
            "user_id":    l.user_id,
            "username":   user.username if user else None,
            "description": l.description,
            "created_at": l.created_at.isoformat() if l.created_at else None,
        })
    return {"total": total, "logs": result}


@router.get("/reports/threats")
def threat_report(db: Session = Depends(get_db)):
    """All threat events from audit log — live, no limit, newest first."""
    risky = ["USER_LOGIN_FAILED", "PERMISSION_ESCALATION", "SUSPICIOUS_ACCESS", "POLICY_VIOLATION"]
    logs  = db.query(AuditLog).filter(AuditLog.event_type.in_(risky))\
              .order_by(AuditLog.created_at.desc()).all()
    result = []
    for l in logs:
        user = db.query(User).filter(User.id == l.user_id).first() if l.user_id else None
        result.append({
            "id":          l.id,
            "event_type":  l.event_type,
            "user_id":     l.user_id,
            "username":    user.username if user else None,
            "description": l.description,
            "severity":    "HIGH" if l.event_type in ["PERMISSION_ESCALATION", "POLICY_VIOLATION"] else "MEDIUM",
            "created_at":  l.created_at.isoformat() if l.created_at else None,
        })
    return result


@router.get("/reports/risk")
def risk_report(db: Session = Depends(get_db)):
    """Risk score per department — live count of threat events per dept's users."""
    depts  = db.query(Department).all()
    result = []
    for dept in depts:
        user_ids = [u.id for u in db.query(User).filter(User.department_id == dept.id).all()]
        count = db.query(AuditLog).filter(
            AuditLog.user_id.in_(user_ids),
            AuditLog.event_type.in_(["POLICY_VIOLATION", "PERMISSION_ESCALATION", "SUSPICIOUS_ACCESS"])
        ).count() if user_ids else 0
        result.append({"department": dept.name, "risk_score": count, "user_count": len(user_ids)})
    return {"risk_scores": result}


@router.get("/sod-policies")
def list_sod_policies(db: Session = Depends(get_db)):
    """List all SOD policies. If empty → run seed_sod.py first."""
    policies = db.query(SODPolicy).all()
    result = []
    for p in policies:
        r1 = db.query(Role).filter(Role.id == p.role_id_1).first()
        r2 = db.query(Role).filter(Role.id == p.role_id_2).first()
        result.append({
            "id": p.id,
            "role_id_1": p.role_id_1,   "role_name_1": r1.name if r1 else str(p.role_id_1),
            "role_id_2": p.role_id_2,   "role_name_2": r2.name if r2 else str(p.role_id_2),
            "conflict_reason": p.conflict_reason,
        })
    return {"total": len(result), "policies": result}


@router.post("/sod-policies")
def create_sod_policy(role_id_1: int, role_id_2: int, conflict_reason: str, db: Session = Depends(get_db)):
    """Add a new SOD conflict between two roles."""
    r1 = db.query(Role).filter(Role.id == role_id_1).first()
    r2 = db.query(Role).filter(Role.id == role_id_2).first()
    if not r1 or not r2:
        return {"error": "Role not found"}
    exists = db.query(SODPolicy).filter(
        ((SODPolicy.role_id_1 == role_id_1) & (SODPolicy.role_id_2 == role_id_2)) |
        ((SODPolicy.role_id_1 == role_id_2) & (SODPolicy.role_id_2 == role_id_1))
    ).first()
    if exists:
        return {"detail": f"Policy already exists between {r1.name} and {r2.name}", "id": exists.id}
    p = SODPolicy(role_id_1=role_id_1, role_id_2=role_id_2, conflict_reason=conflict_reason)
    db.add(p)
    db.commit()
    db.refresh(p)
    return {"detail": f"SOD policy created: {r1.name} <-> {r2.name}", "id": p.id}


@router.get("/debug/user-roles/{user_id}")
def debug_user_roles(user_id: int, db: Session = Depends(get_db)):
    """
    Diagnose SOD for a specific user.
    Shows their roles, all SOD policies, and exactly which policies fire.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return {"error": f"User {user_id} not found"}
    assignments = db.query(UserRole).filter(UserRole.user_id == user_id).all()
    role_details, active_ids = [], []
    for a in assignments:
        role = db.query(Role).filter(Role.id == a.role_id).first()
        role_details.append({"role_id": a.role_id, "role_name": role.name if role else str(a.role_id), "is_active": a.is_active})
        if a.is_active:
            active_ids.append(a.role_id)
    policies = db.query(SODPolicy).all()
    violations = []
    for p in policies:
        if p.role_id_1 in active_ids and p.role_id_2 in active_ids:
            r1 = db.query(Role).filter(Role.id == p.role_id_1).first()
            r2 = db.query(Role).filter(Role.id == p.role_id_2).first()
            violations.append({"role_1": r1.name if r1 else str(p.role_id_1), "role_2": r2.name if r2 else str(p.role_id_2), "reason": p.conflict_reason})
    return {
        "username": user.username,
        "active_role_ids": active_ids,
        "role_assignments": role_details,
        "sod_policies_in_db": len(policies),
        "violations": violations,
        "diagnosis": (
            "sod_policies table is EMPTY — run: docker exec -it iam_backend python seed_sod.py"
            if len(policies) == 0 else
            f"{len(violations)} violation(s) found" if violations else
            f"No violations — these roles are not in conflict with any of the {len(policies)} policies"
        ),
    }