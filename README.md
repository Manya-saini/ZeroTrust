# IAM Governance Platform

This project implements a full enterprise-level Identity and Access Management (IAM) Governance Platform inspired by SailPoint, Okta, and Microsoft Entra.

## Project Structure

- backend: FastAPI, Celery, Redis, Keycloak integration
- frontend: Next.js, React, TypeScript, TailwindCSS, Shadcn UI, Recharts
- database: PostgreSQL schema and migrations
- infrastructure: Dockerfiles, Docker Compose, Nginx
- docs: Documentation

## Features
- Identity lifecycle management
- Role-based access control (RBAC)
- Role request workflow
- Entitlement management
- Separation of duties engine
- Provisioning and revocation engine
- Access certification campaigns
- Audit logging
- Security analytics (Isolation Forest, Random Forest)
- Automation (background jobs)

## Deployment
- Local: Docker Compose
- Cloud: Vercel (frontend), Render/Railway (backend), Supabase/Neon (database)

## Documentation
See docs/ for detailed setup, architecture, API usage, and governance workflows.
