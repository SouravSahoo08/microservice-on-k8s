# TaskFlow

A minimal 3-tier task-management app, built specifically to be a clean
target for a Kubernetes deployment exercise. It intentionally contains
**no Dockerfiles and no Kubernetes manifests** — that part is left for
you to design and build as the actual hands-on project.

## Architecture (3 tiers)

```
[ frontend ]  --HTTP-->  [ backend API ]  --SQL-->  [ Postgres ]
 static HTML/JS            Node/Express            relational DB
```

- **frontend/** — a single static `index.html` page (no build step,
  no framework). Talks to the backend over `/api/*`.
- **backend/** — a small Node/Express REST API with 4 endpoints
  (`GET/POST /api/tasks`, `PUT/DELETE /api/tasks/:id`) plus a
  `/health` endpoint. Reads all DB connection info from environment
  variables. Listens on port **4000** by default (override with the
  `PORT` env var) — this is the port your Dockerfile should `EXPOSE`
  and the `targetPort` your backend Service should point at.
- **frontend/** — a single static `index.html` page with **no server
  of its own**. To containerize it you need to add a way to serve
  static files — the two common choices:
  - **nginx** (an `nginx:alpine` base image with a minimal
    `nginx.conf` serving `/usr/share/nginx/html` on port 80), or
  - **Node** static server (e.g. the `serve` package) if you'd rather
    stay in one language across both images.

  Either is fine for this exercise; nginx is the more common choice
  and also gives you a natural place to add a reverse-proxy rule for
  `/api` (see "Frontend → backend routing in K8s" below).
- **database** — plain Postgres. No files needed for this tier; the
  backend creates its own `tasks` table on startup. Standard
  `postgres:16` image and default port **5432** are a safe
  assumption. You'll bring the actual Postgres instance in via K8s
  (e.g. a StatefulSet or a managed image) yourself.

## Environment variables (backend)

Defined in `backend/.env.example`. In Kubernetes, everything except
`DB_USER`/`DB_PASSWORD` is a good fit for a **ConfigMap**; those two
should go in a **Secret**.

**Following are a demo set of values and should be considered only for reference.**

| Variable      | Default     | Suggested K8s object |
|---------------|-------------|-----------------------|
| `PORT`        | `4000`      | ConfigMap (or leave as image default) |
| `DB_HOST`     | `localhost` | ConfigMap — set to your Postgres Service name |
| `DB_PORT`     | `5432`      | ConfigMap |
| `DB_USER`     | `taskflow`  | Secret |
| `DB_PASSWORD` | `taskflow`  | Secret |
| `DB_NAME`     | `taskflow`  | ConfigMap |

## Running it locally (optional, for sanity-checking before you containerize)

You'll need a local Postgres instance, or you can point `DB_HOST` at
any reachable Postgres.

```bash
cd backend
cp .env.example .env   # edit if your DB creds differ
npm install
npm start
```

Then open `frontend/index.html` directly in a browser, or serve it
with any static file server. The frontend calls `/api/tasks` by
default — either serve it behind the same origin as the backend, or
set `window.API_BASE_URL` to the backend's full URL before it loads.

## Frontend → backend routing in K8s

The frontend calls the backend at a relative path, `/api/tasks` (see
`frontend/index.html`) — it does **not** hardcode a host. That means
in Kubernetes you have two options, and you'll need to pick one:

1. **Ingress path routing** (recommended, most realistic): route
   `/` to the frontend Service and `/api` to the backend Service on
   the same Ingress/host, so relative paths just work with zero
   frontend changes.
2. **Runtime-injected base URL**: set `window.API_BASE_URL` to the
   backend's full URL (e.g. via an nginx `sub_filter`, an entrypoint
   script that writes a small `config.js`, or a ConfigMap mounted as
   a file) before `index.html` loads, if you're exposing the two
   Services separately instead of through one Ingress.

Either is a valid design choice to make and explain — just don't
skip it, since without one of these the deployed frontend won't be
able to reach the backend.

## What's deliberately left for you to build (the actual project)

This is where the Kubernetes hands-on work happens:

1. **Dockerfiles** for `frontend/` and `backend/`, and pushing images
   to a registry (ECR, Docker Hub, etc.)
2. **Kubernetes manifests** (or Helm chart) covering:
   - Deployments + Services for `frontend` and `backend`
   - A ConfigMap for non-secret env vars (`DB_HOST`, `DB_PORT`, `DB_NAME`)
   - A Secret for `DB_USER` / `DB_PASSWORD`
   - A StatefulSet (or separate Deployment + PVC) for Postgres
   - An Ingress (or NodePort/LoadBalancer Service) to expose the frontend
   - Optionally: an HPA on the backend, readiness/liveness probes using
     `/health`, resource requests/limits
3. **Infra provisioning** — e.g. Terraform for the EKS/EC2 cluster,
   VPC, and security groups underneath it, tying into your existing
   Terraform work
4. **CI/CD** (optional stretch) — a pipeline that builds images and
   applies manifests on push

## Endpoints reference

| Method | Path              | Description          |
|--------|-------------------|-----------------------|
| GET    | `/health`         | Health check          |
| GET    | `/api/tasks`      | List all tasks        |
| POST   | `/api/tasks`      | Create a task (`{title}`) |
| PUT    | `/api/tasks/:id`  | Update a task (`{done}`) |
| DELETE | `/api/tasks/:id`  | Delete a task          |
