import random
import string
from database.models import User, Department, Role, Permission, Entitlement
from database.init_db import SessionLocal

def generate_synthetic_data():
    db = SessionLocal()
    departments = [Department(name=name) for name in ["Engineering", "Finance", "HR", "Security", "Operations"]]
    db.add_all(departments)
    db.commit()
    roles = [Role(name=name) for name in ["Developer", "DevOps Engineer", "Finance Analyst", "HR Manager", "Security Administrator"]]
    db.add_all(roles)
    db.commit()
    permissions = [Permission(name=f"perm_{i}") for i in range(1, 101)]
    db.add_all(permissions)
    db.commit()
    entitlements = [Entitlement(name=f"entitlement_{i}", system="GitHub") for i in range(1, 51)]
    db.add_all(entitlements)
    db.commit()
    for i in range(1, 1001):
        dept = random.choice(departments)
        username = f"user{i}"
        email = f"user{i}@enterprise.com"
        password_hash = ''.join(random.choices(string.ascii_letters + string.digits, k=32))
        user = User(username=username, email=email, password_hash=password_hash, department_id=dept.id)
        db.add(user)
    db.commit()
    db.close()

if __name__ == "__main__":
    generate_synthetic_data()
