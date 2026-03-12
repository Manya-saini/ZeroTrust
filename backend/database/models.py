from sqlalchemy import (Column, Integer, String, Boolean, ForeignKey, Text, DateTime)
from sqlalchemy.orm import relationship, declarative_base
from datetime import datetime

Base = declarative_base()

class Department(Base):
    __tablename__ = 'departments'
    id = Column(Integer, primary_key=True)
    name = Column(String(100), unique=True, nullable=False)
    users = relationship('User', back_populates='department')

class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True)
    username = Column(String(100), unique=True, nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    department_id = Column(Integer, ForeignKey('departments.id'))
    manager_id = Column(Integer, ForeignKey('users.id'))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)
    department = relationship('Department', back_populates='users')
    manager = relationship('User', remote_side=[id])
    # ✅ FIX: tell SQLAlchemy to use user_id (not assigned_by) for this relationship
    roles = relationship('UserRole', back_populates='user', foreign_keys='UserRole.user_id')

class Role(Base):
    __tablename__ = 'roles'
    id = Column(Integer, primary_key=True)
    name = Column(String(100), unique=True, nullable=False)
    description = Column(Text)
    parent_role_id = Column(Integer, ForeignKey('roles.id'))
    is_temporary = Column(Boolean, default=False)
    expires_at = Column(DateTime)
    permissions = relationship('RolePermission', back_populates='role')
    entitlements = relationship('RoleEntitlement', back_populates='role')

class Permission(Base):
    __tablename__ = 'permissions'
    id = Column(Integer, primary_key=True)
    name = Column(String(100), unique=True, nullable=False)
    description = Column(Text)
    roles = relationship('RolePermission', back_populates='permission')

class RolePermission(Base):
    __tablename__ = 'role_permissions'
    role_id = Column(Integer, ForeignKey('roles.id'), primary_key=True)
    permission_id = Column(Integer, ForeignKey('permissions.id'), primary_key=True)
    role = relationship('Role', back_populates='permissions')
    permission = relationship('Permission', back_populates='roles')

class UserRole(Base):
    __tablename__ = 'user_roles'
    user_id = Column(Integer, ForeignKey('users.id'), primary_key=True)
    role_id = Column(Integer, ForeignKey('roles.id'), primary_key=True)
    assigned_by = Column(Integer, ForeignKey('users.id'))
    assigned_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime)
    is_active = Column(Boolean, default=True)
    # ✅ FIX: explicit foreign_keys on both relationships to resolve ambiguity
    user = relationship('User', back_populates='roles', foreign_keys=[user_id])
    assigner = relationship('User', foreign_keys=[assigned_by])
    role = relationship('Role')

class Entitlement(Base):
    __tablename__ = 'entitlements'
    id = Column(Integer, primary_key=True)
    name = Column(String(100), unique=True, nullable=False)
    system = Column(String(100), nullable=False)
    description = Column(Text)
    roles = relationship('RoleEntitlement', back_populates='entitlement')

class RoleEntitlement(Base):
    __tablename__ = 'role_entitlements'
    role_id = Column(Integer, ForeignKey('roles.id'), primary_key=True)
    entitlement_id = Column(Integer, ForeignKey('entitlements.id'), primary_key=True)
    role = relationship('Role', back_populates='entitlements')
    entitlement = relationship('Entitlement', back_populates='roles')

class AccessRequest(Base):
    __tablename__ = 'access_requests'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'))
    role_id = Column(Integer, ForeignKey('roles.id'))
    status = Column(String(50), nullable=False)
    requested_at = Column(DateTime, default=datetime.utcnow)
    reviewed_by = Column(Integer, ForeignKey('users.id'))
    reviewed_at = Column(DateTime)
    reason = Column(Text)

class ApprovalHistory(Base):
    __tablename__ = 'approval_history'
    id = Column(Integer, primary_key=True)
    access_request_id = Column(Integer, ForeignKey('access_requests.id'))
    approved_by = Column(Integer, ForeignKey('users.id'))
    approved_at = Column(DateTime)
    status = Column(String(50), nullable=False)
    comments = Column(Text)

class SODPolicy(Base):
    __tablename__ = 'sod_policies'
    id = Column(Integer, primary_key=True)
    role_id_1 = Column(Integer, ForeignKey('roles.id'))
    role_id_2 = Column(Integer, ForeignKey('roles.id'))
    conflict_reason = Column(Text)

class AuditLog(Base):
    __tablename__ = 'audit_logs'
    id = Column(Integer, primary_key=True)
    event_type = Column(String(100), nullable=False)
    user_id = Column(Integer, ForeignKey('users.id'))
    target_id = Column(Integer)
    target_type = Column(String(100))
    description = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)