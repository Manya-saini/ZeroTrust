# ZeroTrust Platform

A full-stack ZeroTrust Platform built with modern tools, supporting user provisioning, authentication, analytics, and workflow automation. The project is containerized for easy deployment and includes backend, frontend, database, infrastructure, and documentation components.

---

## Project Structure

```
├── backend/           # Python FastAPI backend, Celery tasks, database models
│   ├── api/           # API endpoints: provisioning, reports, roles, users, workflow
│   ├── database/      # Database models, schema, data generation
│   ├── analytics.py   # Analytics logic
│   ├── main.py        # FastAPI app entrypoint
│   ├── tasks.py       # Celery task definitions
│   ├── seed_sod.py    # Seed Segregation of Duties data
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/          # Next.js React frontend with Tailwind CSS
│   ├── components/    # UI components (Dashboard, etc.)
│   ├── pages/         # Next.js pages (_app.tsx, index.tsx)
│   ├── styles/        # Global styles
│   ├── package.json   # Frontend dependencies
│   └── Dockerfile
├── infrastructure/    # Nginx reverse proxy configuration
│   └── nginx.conf
├── docs/              # API and project documentation
│   ├── api.md
│   └── README.md
├── docker-compose.yml # Multi-container orchestration
└── README.md          # Project overview (this file)
```

---


## Features

- **User Management**: Provisioning, roles, workflows, and reporting via FastAPI endpoints
- **Authentication & Authorization**: Integrated Keycloak for SSO, RBAC, and OAuth2
- **Database**: PostgreSQL for persistent storage
- **Task Scheduling**: Celery worker and beat for background jobs and scheduled tasks
- **Analytics**: Python-based analytics for ZeroTrust data
- **Frontend**: Next.js React app with Tailwind CSS for modern UI
- **Reverse Proxy**: Nginx for routing and serving frontend/backend
- **Containerization**: Docker and Docker Compose for easy deployment

---

## Technology Stack

- **Backend**: Python 3.11+, FastAPI, Celery, Redis, SQLAlchemy
- **Frontend**: Next.js, React, Tailwind CSS
- **Database**: PostgreSQL
- **Authentication**: Keycloak
- **Infrastructure**: Nginx, Docker, Docker Compose

---


## How It Works

1. **Backend**: Exposes REST APIs for user, role, workflow, and reporting. Handles business logic, analytics, and task scheduling.
2. **Frontend**: Provides a dashboard and user interface, communicating with backend APIs.
3. **Database**: Stores ZeroTrust data, seeded via scripts.
4. **Keycloak**: Manages authentication, user federation, and RBAC.
5. **Celery**: Executes background tasks and scheduled jobs.
6. **Nginx**: Routes requests to frontend and backend, serves static assets.
7. **Docker Compose**: Orchestrates all services for local development and deployment.

---

## Setup & Running

### Prerequisites
- Docker & Docker Compose installed

### Steps

1. **Clone the repository**
	```sh
	git clone <repo-url>
	cd Project8
	```

2. **Start all services**
	```sh
	docker-compose up --build
	```


3. **Access the platform**
	- Frontend: [http://localhost](http://localhost)
	- Backend API: [http://localhost:8000](http://localhost:8000)
	- Keycloak: [http://localhost:8080](http://localhost:8080)

4. **Database**
	- PostgreSQL is available at port 5432
	- Default credentials:
	  - DB: `zerotrust_db`
	  - User: `zerotrust_admin`
	  - Password: `zerotrust_password`

5. **Celery Workers**
	- Background tasks and scheduled jobs are managed automatically

---

## Environment Variables


See `docker-compose.yml` for all environment variables. Key ones:
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `KEYCLOAK_URL`: Keycloak server URL
- `NEXT_PUBLIC_API_URL`: Backend API URL for frontend

---


## API Documentation

- See [docs/api.md](docs/api.md) for detailed API endpoints and usage.

---


## License

This project is licensed under the MIT License:

```
MIT License

Copyright (c) 2026 <Your Name>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Contributing

Pull requests and issues are welcome. Please see [docs/README.md](docs/README.md) for contribution guidelines.

---


## Credits

- Python, FastAPI, Celery, Redis, SQLAlchemy
- Next.js, React, Tailwind CSS
- PostgreSQL, Keycloak, Nginx
- Docker, Docker Compose

---


## Contact

For questions or support, open an issue or contact the maintainer.
