# Deployment

## The platform itself
Self-hosted, single machine: `scripts/start` runs `bun packages/server/src/index.ts` (Archon server + company layer + static console) on `127.0.0.1:3090`, SQLite in `$ARCHON_HOME`. For multi-user or authenticated installs start PostgreSQL (`docker compose up -d postgres`), set `DATABASE_URL`, `BETTER_AUTH_SECRET`, `ARCHON_AUTH_ALLOWED_EMAILS` in `$ARCHON_HOME/.env` and restart; put a reverse proxy in front for network access (see Archon's reverse-proxy guide). Upstream Archon's own Docker image and `deploy/docker-compose.yml` also work for the server; the company layer rides inside the server process.

## Generated projects (staging)
`company-staging-deploy` runs in the project's integration checkout after the quality and security gates:
1. The DevOps agent ensures a `Dockerfile`, a compose file with a health check, a `.env.example` and migration notes, committing fixes.
2. `scripts/compose-up.ts` runs `docker compose -p company-<id> -f <file> up -d --build --remove-orphans`, then polls every published port's health path (default `/health`) for up to four minutes.
3. The verdict (`healthy`, `url`, `services`, log tail) is stored as a `company_deployments` row and shown on the project page and the Deployments tab.
Containers keep running after the run so acceptance verification can hit them; `docker compose -p company-<id> down -v` removes a stack. Ports are published on 127.0.0.1 only; nothing is exposed publicly. Production deployment is disabled by default.
