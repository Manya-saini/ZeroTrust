"""
Run this ONCE inside the backend container to seed SOD policies:

    docker exec -it iam_backend python seed_sod.py

This seeds conflict rules between every pair of the 5 seeded roles.
After running, assign any 2 roles to the same user and the SOD violation
will appear in the dashboard on the next refresh.
"""
import sys, os
sys.path.insert(0, '/app')

from database.init_db import SessionLocal
from database.models import Role, SODPolicy

CONFLICTS = [
    ("Developer",               "Finance Analyst",         "Developers must not approve financial transactions (access control separation)"),
    ("Developer",               "Security Administrator",  "Developers must not administer security controls they operate under (privilege separation)"),
    ("DevOps Engineer",         "Finance Analyst",         "Infrastructure access must be separated from financial data access"),
    ("DevOps Engineer",         "Security Administrator",  "Operational access must be separated from security policy enforcement"),
    ("Finance Analyst",         "HR Manager",              "Financial and HR data must be accessed by separate roles (data segregation)"),
    ("Finance Analyst",         "Security Administrator",  "Financial auditors must not control security systems they are audited by"),
    ("HR Manager",              "Security Administrator",  "HR must not administer security controls that protect HR data"),
    ("HR Manager",              "Developer",               "HR managers must not have code deployment access"),
    ("Security Administrator",  "Developer",               "Security admins must not develop code in systems they secure"),
    ("DevOps Engineer",         "HR Manager",              "Infrastructure access must be separated from HR data access"),
]

def seed():
    db = SessionLocal()

    # Load roles into a name→id map
    roles = {r.name: r.id for r in db.query(Role).all()}
    print(f"Roles in DB: {list(roles.keys())}")

    if not roles:
        print("ERROR: No roles found. Run generate_data.py first.")
        db.close()
        sys.exit(1)

    # Clear existing SOD policies
    deleted = db.query(SODPolicy).delete()
    db.commit()
    print(f"Cleared {deleted} existing SOD policies")

    added = 0
    skipped = 0
    for role1_name, role2_name, reason in CONFLICTS:
        r1 = roles.get(role1_name)
        r2 = roles.get(role2_name)
        if not r1 or not r2:
            print(f"  SKIP (role not found): {role1_name} <-> {role2_name}")
            skipped += 1
            continue
        db.add(SODPolicy(role_id_1=r1, role_id_2=r2, conflict_reason=reason))
        print(f"  + SOD: {role1_name} <-> {role2_name}")
        added += 1

    db.commit()
    db.close()

    print(f"\nDone: {added} SOD policies seeded, {skipped} skipped.")
    print("\nTest it:")
    print("  1. Pick any user in the dashboard")
    print("  2. Assign them TWO roles from the conflict list above via Swagger POST /provision-role")
    print("  3. Hit Refresh — the SOD Violations tab will show the conflict immediately")

if __name__ == "__main__":
    seed()