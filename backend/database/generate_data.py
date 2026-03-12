import random
import string
import os
import sys
from datetime import datetime, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from database.models import (
    User, Department, Role, Permission, Entitlement,
    UserRole, RolePermission, SODPolicy, AuditLog, AccessRequest
)
from database.init_db import SessionLocal

def generate_synthetic_data():
    db = SessionLocal()

    if db.query(Department).first():
        print("Data already seeded, skipping.")
        db.close()
        return

    dept_names = ["Engineering", "Finance", "HR", "Security", "Operations"]
    departments = [Department(name=n) for n in dept_names]
    db.add_all(departments)
    db.commit()
    print(f"✓ {len(departments)} departments")

    role_names = ["Developer", "DevOps Engineer", "Finance Analyst", "HR Manager", "Security Administrator"]
    roles = [Role(name=n) for n in role_names]
    db.add_all(roles)
    db.commit()
    print(f"✓ {len(roles)} roles")

    permissions = [Permission(name=f"perm_{i}") for i in range(1, 101)]
    db.add_all(permissions)
    db.commit()
    for role in roles:
        for p in random.sample(permissions, k=random.randint(5, 20)):
            db.add(RolePermission(role_id=role.id, permission_id=p.id))
    db.commit()
    print(f"✓ {len(permissions)} permissions assigned")

    entitlements = [Entitlement(name=f"entitlement_{i}", system="GitHub") for i in range(1, 51)]
    db.add_all(entitlements)
    db.commit()
    print(f"✓ {len(entitlements)} entitlements")

    users = []
    for i in range(1, 1001):
        dept = random.choice(departments)
        user = User(
            username=f"user{i}",
            email=f"user{i}@enterprise.com",
            password_hash=''.join(random.choices(string.ascii_letters + string.digits, k=32)),
            department_id=dept.id,
            is_active=random.random() > 0.08,
        )
        db.add(user)
        users.append(user)
    db.commit()
    print("✓ 1000 users")

    # Each user gets 1-2 roles
    for user in users:
        for role in random.sample(roles, k=random.randint(1, 2)):
            db.add(UserRole(
                user_id=user.id,
                role_id=role.id,
                assigned_by=users[0].id,
                is_active=True,
                assigned_at=datetime.utcnow() - timedelta(days=random.randint(0, 180)),
            ))
    db.commit()
    print("✓ User-role assignments")

    sod_conflicts = [
        (roles[0], roles[2], "Developer must not have Finance Analyst access"),
        (roles[1], roles[3], "DevOps Engineer must not manage HR"),
        (roles[2], roles[4], "Finance Analyst must not have Security Admin rights"),
        (roles[3], roles[4], "HR Manager must not have Security Admin rights"),
    ]
    for r1, r2, reason in sod_conflicts:
        db.add(SODPolicy(role_id_1=r1.id, role_id_2=r2.id, conflict_reason=reason))
    db.commit()
    print(f"✓ {len(sod_conflicts)} SOD policies")

    statuses = ["pending", "approved", "rejected"]
    for _ in range(80):
        user = random.choice(users)
        role = random.choice(roles)
        status = random.choices(statuses, weights=[0.3, 0.5, 0.2])[0]
        db.add(AccessRequest(
            user_id=user.id, role_id=role.id, status=status,
            reason=f"Requires {role.name} access for project work",
            requested_at=datetime.utcnow() - timedelta(days=random.randint(0, 30)),
        ))
    db.commit()
    print("✓ 80 access requests")

    event_types = [
        "USER_LOGIN", "USER_LOGIN_FAILED", "ROLE_ASSIGNED", "ROLE_REVOKED",
        "PERMISSION_ESCALATION", "SUSPICIOUS_ACCESS", "POLICY_VIOLATION",
        "USER_CREATED", "USER_DEACTIVATED", "ENTITLEMENT_CHANGED"
    ]
    for _ in range(200):
        user = random.choice(users)
        event = random.choice(event_types)
        db.add(AuditLog(
            event_type=event, user_id=user.id,
            target_type="user" if "USER" in event else "role",
            target_id=random.randint(1, 100),
            description=f"{event} triggered for {user.username}",
            created_at=datetime.utcnow() - timedelta(hours=random.randint(0, 168)),
        ))
    db.commit()
    print("✓ 200 audit log entries")

    db.close()
    print("\n✅ Database seeded successfully!")

if __name__ == "__main__":
    generate_synthetic_data()