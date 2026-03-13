import os
import logging
from datetime import datetime, timedelta
from celery import Celery
from celery.schedules import crontab

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')

celery_app = Celery('iam_tasks', broker=REDIS_URL, backend=REDIS_URL)

# ── Beat schedule: run tasks automatically on a timer ─────────────────────────
celery_app.conf.beat_schedule = {
    'daily-role-expiration-check': {
        'task': 'tasks.daily_role_expiration_check',
        'schedule': crontab(hour=0, minute=0),   # midnight every day
    },
    'compliance-report-every-6h': {
        'task': 'tasks.compliance_report_generation',
        'schedule': crontab(minute=0, hour='*/6'),  # every 6 hours
    },
    'anomaly-detection-every-hour': {
        'task': 'tasks.anomaly_detection_job',
        'schedule': crontab(minute=0),   # top of every hour
    },
}
celery_app.conf.timezone = 'UTC'


def get_db():
    """Get a DB session inside a Celery task."""
    import sys
    sys.path.insert(0, '/app')
    from database.init_db import SessionLocal
    return SessionLocal()


# ── Task 1: Daily Role Expiration Check ───────────────────────────────────────
@celery_app.task(bind=True, max_retries=3)
def daily_role_expiration_check(self):
    """
    Finds all UserRole records where:
      - is_active = True
      - expires_at < now
    Marks them inactive and writes an audit log entry.
    """
    try:
        from database.models import UserRole, AuditLog
        db = get_db()

        now = datetime.utcnow()
        expired = db.query(UserRole).filter(
            UserRole.is_active == True,
            UserRole.expires_at != None,
            UserRole.expires_at < now
        ).all()

        count = 0
        for ur in expired:
            ur.is_active = False
            db.add(AuditLog(
                event_type="ROLE_REVOKED",
                user_id=ur.user_id,
                target_id=ur.role_id,
                target_type="role",
                description=f"Auto-revoked expired role {ur.role_id} from user {ur.user_id} (expired {ur.expires_at})",
                created_at=now,
            ))
            count += 1

        db.commit()
        db.close()

        logger.info(f"[daily_role_expiration_check] Revoked {count} expired role assignments.")
        return {"revoked": count, "timestamp": now.isoformat()}

    except Exception as exc:
        logger.error(f"[daily_role_expiration_check] Failed: {exc}")
        raise self.retry(exc=exc, countdown=60)


# ── Task 2: Compliance Report Generation ──────────────────────────────────────
@celery_app.task(bind=True, max_retries=3)
def compliance_report_generation(self):
    """
    Generates a compliance snapshot:
      - Total active users
      - Users with no roles (orphaned)
      - SOD violations count
      - Recent policy violations in audit log
    Writes a COMPLIANCE_REPORT audit log entry with the summary.
    """
    try:
        from database.models import User, UserRole, SODPolicy, AuditLog
        db = get_db()
        now = datetime.utcnow()

        total_users  = db.query(User).filter(User.is_active == True).count()
        active_roles = {ur.user_id for ur in db.query(UserRole).filter(UserRole.is_active == True).all()}
        orphaned     = db.query(User).filter(
            User.is_active == True,
            ~User.id.in_(active_roles)
        ).count()

        # SOD violations: users holding both conflicting roles
        policies   = db.query(SODPolicy).all()
        sod_count  = 0
        for policy in policies:
            r1_users = {ur.user_id for ur in db.query(UserRole).filter(
                UserRole.role_id == policy.role_id_1, UserRole.is_active == True).all()}
            r2_users = {ur.user_id for ur in db.query(UserRole).filter(
                UserRole.role_id == policy.role_id_2, UserRole.is_active == True).all()}
            sod_count += len(r1_users & r2_users)

        since = now - timedelta(hours=6)
        policy_violations = db.query(AuditLog).filter(
            AuditLog.event_type == "POLICY_VIOLATION",
            AuditLog.created_at >= since
        ).count()

        summary = (
            f"Compliance Report | Active users: {total_users} | "
            f"Orphaned (no role): {orphaned} | SOD violations: {sod_count} | "
            f"Policy violations (last 6h): {policy_violations}"
        )

        db.add(AuditLog(
            event_type="COMPLIANCE_REPORT",
            user_id=None,
            target_type="system",
            target_id=0,
            description=summary,
            created_at=now,
        ))
        db.commit()
        db.close()

        logger.info(f"[compliance_report_generation] {summary}")
        return {
            "active_users": total_users,
            "orphaned_users": orphaned,
            "sod_violations": sod_count,
            "policy_violations_6h": policy_violations,
            "timestamp": now.isoformat(),
        }

    except Exception as exc:
        logger.error(f"[compliance_report_generation] Failed: {exc}")
        raise self.retry(exc=exc, countdown=60)


# ── Task 3: Anomaly Detection ─────────────────────────────────────────────────
@celery_app.task(bind=True, max_retries=3)
def anomaly_detection_job(self):
    """
    Uses Isolation Forest to detect anomalous users based on:
      - Number of active roles
      - Number of login failures in last 24h
      - Number of permission escalation events

    Flags anomalous users by writing SUSPICIOUS_ACCESS audit log entries.
    """
    try:
        import pandas as pd
        from sklearn.ensemble import IsolationForest
        from database.models import User, UserRole, AuditLog
        db = get_db()
        now = datetime.utcnow()
        since = now - timedelta(hours=24)

        users = db.query(User).filter(User.is_active == True).all()
        if len(users) < 10:
            db.close()
            logger.info("[anomaly_detection_job] Not enough users to run detection.")
            return {"status": "skipped", "reason": "insufficient data"}

        rows = []
        for user in users:
            role_count = db.query(UserRole).filter(
                UserRole.user_id == user.id,
                UserRole.is_active == True
            ).count()

            login_failures = db.query(AuditLog).filter(
                AuditLog.user_id == user.id,
                AuditLog.event_type == "USER_LOGIN_FAILED",
                AuditLog.created_at >= since
            ).count()

            escalations = db.query(AuditLog).filter(
                AuditLog.user_id == user.id,
                AuditLog.event_type == "PERMISSION_ESCALATION",
                AuditLog.created_at >= since
            ).count()

            rows.append({
                "user_id":       user.id,
                "username":      user.username,
                "roles":         role_count,
                "login_fails":   login_failures,
                "escalations":   escalations,
            })

        df = pd.DataFrame(rows)
        features = df[["roles", "login_fails", "escalations"]]

        model = IsolationForest(n_estimators=100, contamination=0.05, random_state=42)
        df["anomaly"] = model.fit_predict(features)   # -1 = anomaly, 1 = normal

        anomalies = df[df["anomaly"] == -1]
        flagged = 0
        for _, row in anomalies.iterrows():
            db.add(AuditLog(
                event_type="SUSPICIOUS_ACCESS",
                user_id=int(row["user_id"]),
                target_type="user",
                target_id=int(row["user_id"]),
                description=(
                    f"Anomaly detected for {row['username']}: "
                    f"{int(row['roles'])} roles, "
                    f"{int(row['login_fails'])} login failures, "
                    f"{int(row['escalations'])} escalations in last 24h"
                ),
                created_at=now,
            ))
            flagged += 1

        db.commit()
        db.close()

        logger.info(f"[anomaly_detection_job] Flagged {flagged} anomalous users out of {len(users)}.")
        return {"total_users": len(users), "anomalies_flagged": flagged, "timestamp": now.isoformat()}

    except Exception as exc:
        logger.error(f"[anomaly_detection_job] Failed: {exc}")
        raise self.retry(exc=exc, countdown=60)