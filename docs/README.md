# IAM Governance Platform Documentation

## Overview
This platform simulates enterprise-level IAM governance, including identity lifecycle, RBAC, workflows, entitlements, SOD, provisioning, revocation, certification, audit logging, analytics, and automation.

## Setup
1. Clone the repository.
2. Run `docker-compose up --build` from the infrastructure folder.
3. Access the dashboard at http://localhost.

## Architecture
- Backend: FastAPI, Celery, Redis, Keycloak
- Frontend: Next.js, React, TailwindCSS, Shadcn UI, Recharts
- Database: PostgreSQL
- Infrastructure: Docker, Nginx

## API Endpoints
See backend/main.py and docs/api.md for full endpoint list.

## Governance Workflows
- Access requests
- Approvals
- Provisioning
- Revocation
- Certification

## Security Analytics
- Anomaly detection (Isolation Forest, Random Forest)
- Risk scoring

## Deployment
- Local: Docker Compose
- Cloud: Vercel, Render, Railway, Supabase, Neon

## Sample Data
- Synthetic enterprise dataset
- CERT Insider Threat Dataset

## Compliance
- Automated access reviews
- Audit logging

## Contributing
See docs/contributing.md

## License
Open source, see LICENSE file.
