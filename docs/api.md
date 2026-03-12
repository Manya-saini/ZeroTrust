# API Documentation

## User APIs
- POST /users: Create user
- GET /users: List users
- DELETE /users/{id}: Delete user

## Role APIs
- POST /roles: Create role
- GET /roles: List roles
- POST /roles/{id}/permissions: Assign permission to role

## Access Workflow
- POST /request-role: User requests role
- POST /approve-request: Approve access request
- POST /reject-request: Reject access request

## Provisioning
- POST /provision-role: Provision role to user
- POST /revoke-role: Revoke role from user

## Reporting
- GET /reports/access: Access report
- GET /reports/risk: Risk report
- GET /reports/sod: SOD report

## Health
- GET /health: Health check
