# Delivery report

Status legend: **IMPLEMENTED** (code exists), **TESTED** (automated test passes), **VERIFIED** (observed working against real services on this host), **BLOCKED** (needs something only the operator can supply), **NOT IMPLEMENTED**.

## 1. Archon
- Version: `v0.12.1`, commit `5f2b4841aaca38180c0abbd32bc6345593292019`, installed from source at `archon/` (branch `company`). Bun 1.4.2 (project-local). VERIFIED: `GET /api/health` ok, 24 bundled workflows discovered with no errors, console served at `/console`.
- Bundled workflow execution: VERIFIED — `archon-validate` run `4d85daa2` completed, outcome `succeeded`, `green: true`, with every tier bound to Devin (50,253 input / 362 output tokens reported).

## 2. Company layer
Archon server module (`packages/server/src/company`), routes `/api/company/*` (17 paths in the OpenAPI document), SQLite/PostgreSQL tables `company_*`, scheduler tick loop, in-process dispatch, git integration, role profiles. IMPLEMENTED + TESTED (scheduler lifecycle, retry limit, budget, idempotency; API e2e: 9 tests).

## 3. Features
| Feature | Status | Evidence |
|---|---|---|
| Project submission (console form + API, upload spec, engine/budget/concurrency, Start button) | VERIFIED | `POST /api/company/projects`, console `/console/company/projects/new` |
| Automatic requirements analysis, SRS, architecture, UX, planning, task graph (`company-project-intake`) | see section 10 | |
| Agent roles and assignment (12 roles, per-engine models, aliases seeded into Archon config) | VERIFIED | `GET /api/company/roles`, `$ARCHON_HOME/config.yaml` aliases, console AI Company page |
| Automatic Archon workflow dispatch with idempotency keys | VERIFIED | execution rows + run ids on the project page |
| Devin CLI engine (provider plugin, sandboxed print mode, resume, usage, per-turn write scopes) | VERIFIED | `GET /api/providers` lists `devin`; run `4d85daa2`; `DEVIN_E2E=1` stdio-wire test (session id, tokens, single `settled`); CEO node of intake run `6a13d02c` returned schema-valid JSON after the sandbox write-scope fix |
| Codex engine (PM, Project Manager, Security roles) | VERIFIED | one-node workflow run `c0526823` completed with `codex/gpt-5.6-sol` through Archon's Codex provider (existing `~/.codex/auth.json`) |
| Claude engine (CEO, Architect, Designer, Reviewer roles) | VERIFIED | after the operator's `claude login`: one-node workflow run `aa885301` succeeded with `claude/opus` |
| Pi engine | NOT CONFIGURED | needs a model and vendor key in Archon's AI settings |
| Dependency-aware scheduling, concurrency caps, retries, repair tasks, blocked state | TESTED | `scheduler.test.ts` |
| Worktree isolation and branch integration into the integration branch | IMPLEMENTED | `repo.ts`; see section 10 for the real run |
| Independent QA (`archon-validate` + acceptance), security review, staging deploy, acceptance, delivery | IMPLEMENTED (workflows validate) | section 10 |
| Dashboard: Overview, Projects, AI Company, AI Agents, Task Board, Workflows, Repositories, Deployments, Analytics, Settings | VERIFIED | screenshots in this session; console built |
| Analytics with measured vs estimated cost | IMPLEMENTED | `GET /api/company/analytics` |
| Administrator authentication (Better Auth + PostgreSQL) gating company routes | VERIFIED | `scripts/verify-auth`: 401 → sign-in 200 → 200; wrong password 401; non-allowlisted sign-up 403 |
| Service restart recovery | VERIFIED | `scripts/verify-restart-recovery` during task T1: run `578fb3b5` detected as orphaned after the restart, abandoned through Archon (cancelled), `execution.orphaned` event recorded, T1 re-dispatched as run `d96bb0ea` (attempt 2) |
| Budget enforcement | TESTED | scheduler test "pauses a project when its budget is exhausted" |

## 4. Services running
`scripts/start`: Archon server + company layer on http://127.0.0.1:3090 (SQLite, `data/archon-home`). Optional: `scripts/verify-auth` instance on :3091 with PostgreSQL (`docker compose`, container `autonomous-ai-company-postgres`).

## 5. Dashboard URL
http://127.0.0.1:3090/console/company (Archon console: http://127.0.0.1:3090/console)

## 6. API endpoints
`GET /api/company/overview | engines | roles | limits | analytics | tasks | tasks/{id} | executions | deployments`, `GET/POST /api/company/projects`, `GET/PATCH /api/company/projects/{id}`, `POST /api/company/projects/{id}/start|pause|resume|cancel`, `GET /api/company/projects/{id}/documents/{docId}`, `POST /api/company/tick`. Full schema: `GET /api/openapi.json`.

## 7–9. Agents and engines
See `docs/agents.md` and `docs/devin-integration.md`. Engines verified on this host: **devin** (primary; implementation model by task size: small `swe-2-high`, medium `deepseek-v4-1-flash-high`, large `gemini-4-argon-high`) and **codex** (`gpt-5.6-sol`, PM/Project Manager/Security roles). `claude` (CEO/Architect/Designer/Reviewer roles) is configured but its CLI login is revoked on this host; `pi` needs a model and key.

## 10. End-to-end validation (real project)
Project "Shortlink API" (`0109f6f3`, Python/FastAPI/SQLite/Docker, engine `auto` → devin, budget $25, concurrency 2), created through `POST /api/company/projects` with `start: true`.

Findings fixed during the run (each verified by re-running):
1. Company workflows must be home-scoped (`$ARCHON_HOME/workflows/company`), not placed under Archon's own `.archon/workflows` (project scope only). Detected by `GET /api/workflows`; fixed by `scripts/setup` linking the pack.
2. Archon runs background workflows on a worker conversation; the run must be matched through `parent_conversation_id`, and a refused dispatch is read from the orchestrator's typed message metadata rather than prose.
3. Devin's sandbox blocks writes outside the worktree without `Write(...)` grants, and print mode cannot confirm; AI nodes receive no `ARTIFACTS_DIR`, so the adapter derives the run's artifact/state directories from Archon's workspace layout and grants them per turn.
4. Gate dispatch keys must be durable across restarts (`phase_entered_at`), not an in-memory round counter.

Progress:
- Intake run `6a13d02c` completed (CEO, PM, Architect, Project Manager on Devin; 574,599 input / 45,801 output tokens): 4 milestones, 9 tasks with 12 dependency edges, documents `ceo-brief.md`, `srs.md` (14.8 KB), `architecture.md` (23 KB), `plan.md`, `intake.json` persisted and readable in the console.
- Development: T1 (project skeleton, /health, Dockerfile, Compose) dispatched as `company-task-execution`; restart-recovery check performed on it (see the table).
_Continued below._

## 11. Automated test results
`scripts/test` on 2026-10-18 (all against real SQLite, real routes, no mocked integrations in the e2e layer):
- Company layer unit tests: 4 passed, 0 failed (42 assertions) — lifecycle to COMPLETED, retry limit → BLOCKED → resume, budget pause, idempotent dispatch.
- Devin plugin tests: 6 passed, 0 failed, 1 skipped by default; the skipped stdio-wire test passed with `DEVIN_E2E=1` (real Devin turn through the installed executable).
- API end-to-end: 9 passed, 0 failed (37 assertions).
- `archon validate workflows`: 68 valid, 0 errors (6 company workflows included).
- Server package type-check clean for the company module; console `bun run build:web` succeeds.

## 12. Security checks
Loopback binding; sandboxed Devin with explicit write scopes; untrusted-input quoting in prompts; no credentials stored by the layer; auth gate verified; audit log (`company_events`). See `docs/security.md`.

## 13. Deployment verification
_Recorded from the project's staging phase._

## 14. Known limitations
- Devin print mode streams only the final message; tool activity is visible in Archon's run page only as state updates.
- Cost for Devin is estimated from tokens and list prices (measured cost only when a provider reports it).
- Projects with a GitHub remote are merged into their default branch by the company layer; protected-branch/PR flows (archon-deliver, archon-pr) are available but not wired into the lifecycle.
- The staging deploy runs in the live integration checkout, so only one deployment per project at a time.

## 15. Remaining blockers
- None external. Remaining work is running the real project through integration, gates, staging and delivery.

## 16–18. Operations
Start: `scripts/start`. Stop: `scripts/stop` (and `kill $(cat data/archon-auth.pid)` for the auth instance; `docker compose down` for PostgreSQL). Upgrade: `docs/upstream-upgrade.md`.
