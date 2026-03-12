-- IAM Governance Platform Database Schema

CREATE TABLE departments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    department_id INTEGER REFERENCES departments(id),
    manager_id INTEGER REFERENCES users(id),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    parent_role_id INTEGER REFERENCES roles(id),
    is_temporary BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMP
);

CREATE TABLE permissions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT
);

CREATE TABLE role_permissions (
    role_id INTEGER REFERENCES roles(id),
    permission_id INTEGER REFERENCES permissions(id),
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
    user_id INTEGER REFERENCES users(id),
    role_id INTEGER REFERENCES roles(id),
    assigned_by INTEGER REFERENCES users(id),
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE entitlements (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    system VARCHAR(100) NOT NULL,
    description TEXT
);

CREATE TABLE role_entitlements (
    role_id INTEGER REFERENCES roles(id),
    entitlement_id INTEGER REFERENCES entitlements(id),
    PRIMARY KEY (role_id, entitlement_id)
);

CREATE TABLE access_requests (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    role_id INTEGER REFERENCES roles(id),
    status VARCHAR(50) NOT NULL,
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_by INTEGER REFERENCES users(id),
    reviewed_at TIMESTAMP,
    reason TEXT
);

CREATE TABLE approval_history (
    id SERIAL PRIMARY KEY,
    access_request_id INTEGER REFERENCES access_requests(id),
    approved_by INTEGER REFERENCES users(id),
    approved_at TIMESTAMP,
    status VARCHAR(50) NOT NULL,
    comments TEXT
);

CREATE TABLE sod_policies (
    id SERIAL PRIMARY KEY,
    role_id_1 INTEGER REFERENCES roles(id),
    role_id_2 INTEGER REFERENCES roles(id),
    conflict_reason TEXT
);

CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    user_id INTEGER REFERENCES users(id),
    target_id INTEGER,
    target_type VARCHAR(100),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_users_department ON users(department_id);
CREATE INDEX idx_user_roles_active ON user_roles(is_active);
CREATE INDEX idx_access_requests_status ON access_requests(status);
CREATE INDEX idx_audit_logs_event_type ON audit_logs(event_type);
