from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from database.init_db import SessionLocal
from database.models import UserRole, Role, User, AuditLog, SODPolicy

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _sod_conflicts(user_id: int, new_role_id: int, db: Session):
    existing_role_ids = {
        ur.role_id for ur in db.query(UserRole).filter(
            UserRole.user_id == user_id, UserRole.is_active == True
        ).all()
    }
    policies = db.query(SODPolicy).filter(
        (SODPolicy.role_id_1 == new_role_id) | (SODPolicy.role_id_2 == new_role_id)
    ).all()
    conflicts = []
    for p in policies:
        conflict_role_id = p.role_id_2 if p.role_id_1 == new_role_id else p.role_id_1
        if conflict_role_id in existing_role_ids:
            r = db.query(Role).filter(Role.id == conflict_role_id).first()
            conflicts.append({
                "conflicting_role_id":   conflict_role_id,
                "conflicting_role_name": r.name if r else str(conflict_role_id),
                "reason": p.conflict_reason,
            })
    return conflicts


@router.post("/provision-role")
def provision_role(
    user_id: int, role_id: int, assigned_by: int,
    force: bool = False, db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == user_id).first()
    role = db.query(Role).filter(Role.id == role_id).first()
    if not user: raise HTTPException(404, "User not found")
    if not role: raise HTTPException(404, "Role not found")

    if db.query(UserRole).filter(UserRole.user_id == user_id, UserRole.role_id == role_id, UserRole.is_active == True).first():
        raise HTTPException(400, "Role already assigned to this user")

    conflicts = _sod_conflicts(user_id, role_id, db)

    if conflicts and not force:
        db.add(AuditLog(
            event_type="POLICY_VIOLATION", user_id=user_id,
            target_id=role_id, target_type="role",
            description=(f"BLOCKED — SOD violation: tried to assign '{role.name}' to "
                         f"{user.username}. Conflicts: " +
                         ", ".join(f"{c['conflicting_role_name']} ({c['reason']})" for c in conflicts)),
            created_at=datetime.utcnow(),
        ))
        db.commit()
        return {"detail": "SOD violation — assignment blocked. Pass force=true to override.", "sod_conflicts": conflicts}

    db.add(UserRole(user_id=user_id, role_id=role_id, assigned_by=assigned_by,
                    is_active=True, assigned_at=datetime.utcnow()))

    event = "PERMISSION_ESCALATION" if conflicts else "ROLE_ASSIGNED"
    db.add(AuditLog(
        event_type=event, user_id=user_id, target_id=role_id, target_type="role",
        description=(f"Role '{role.name}' assigned to {user.username} by user#{assigned_by}" +
                     (f" [SOD OVERRIDE: {', '.join(c['conflicting_role_name'] for c in conflicts)}]" if conflicts else "")),
        created_at=datetime.utcnow(),
    ))
    db.commit()
    return {"detail": f"Role '{role.name}' provisioned to {user.username}", "sod_warnings": conflicts or None}


@router.post("/revoke-role")
def revoke_role(user_id: int, role_id: int, revoked_by: int = 0, db: Session = Depends(get_db)):
    ur = db.query(UserRole).filter(UserRole.user_id == user_id, UserRole.role_id == role_id, UserRole.is_active == True).first()
    if not ur: raise HTTPException(404, "Active role assignment not found")

    user = db.query(User).filter(User.id == user_id).first()
    role = db.query(Role).filter(Role.id == role_id).first()
    ur.is_active = False
    db.add(AuditLog(
        event_type="ROLE_REVOKED", user_id=user_id, target_id=role_id, target_type="role",
        description=(f"Role '{role.name if role else role_id}' revoked from "
                     f"{user.username if user else user_id}" +
                     (f" by user#{revoked_by}" if revoked_by else " (system)")),
        created_at=datetime.utcnow(),
    ))
    db.commit()
    return {"detail": f"Role '{role.name if role else role_id}' revoked"}