# Archon capability audit

Base: Archon `v0.12.1` (commit `5f2b4841aaca38180c0abbd32bc6345593292019`, 2026-10-17), source install with Bun 1.1.26 on macOS 26.3 (arm64).
Audit method: read `AGENTS.md`, `.archon/architecture.md`, `packages/*/src`, the bundled SDLC pack and the docs site sources. Every claim below names the owning file.

Classification: **EXISTING** (reuse as is), **EXTEND** (concept exists, needs a thin addition), **INTEGRATE** (reachable through a supported seam), **NEW** (no Archon counterpart), **DO NOT DUPLICATE** (already sufficient, must be reused).

## Engine and persistence

| Requirement | Class | Archon owner | Decision |
|---|---|---|---|
| Workflow engine, DAG execution, loops, retries, budgets | DO NOT DUPLICATE | `packages/workflows/src/{executor,dag-executor,in-process-engine}.ts` | Company layer never executes AI work itself; it dispatches runs. |
| Workflow definitions (YAML, `inputs:`/`returns:`/`outcome_field`) | EXISTING | `packages/workflows/src/schemas`, docs `guides/authoring-workflows.md` | Company workflows are plain YAML under `.archon/workflows/company/`. |
| Run persistence, resume, cancellation | DO NOT DUPLICATE | `packages/core/src/db/workflows.ts`, `core/src/workflows/{sql-host,continuation-host}.ts` | Company tables store only the run id and read `status`/`outcome`/`terminal_record` from Archon's row. |
| Workflow event log, artifacts, SSE | EXISTING | `remote_agent_workflow_events`, `GET /api/runs/:id/artifacts`, `/api/stream/*` | Dashboard links to the existing run pages for logs and artifacts. |
| Execution status vs authored outcome | EXISTING | `outcome_field`, `terminal_record.returns` | The company scheduler reads the authored outcome, never run status alone. |
| Git worktree isolation per run | DO NOT DUPLICATE | `packages/isolation`, `IIsolationProvider` | Every coding task runs as a worktree run. |
| Durable state documents | EXISTING | `archon state`, `remote_agent_state_revisions` | Not needed for the company model (relational tables are simpler for Kanban queries). |
| Database (SQLite default, PostgreSQL optional), additive schema rule | EXTEND | `packages/core/src/db/connection.ts`, `adapters/*` | Company tables (`company_*`) are created with `CREATE TABLE IF NOT EXISTS` on the same connection, never touching Archon tables. |

## Providers and coding engines

| Requirement | Class | Archon owner | Decision |
|---|---|---|---|
| Claude Code, Codex, Pi providers | EXISTING | `packages/providers/src/{claude,codex,community/pi}` | Used through `provider:`/`model:` and run-level `tiers`/`aliases`. |
| OpenCode, Copilot (deprecated community) | EXISTING | `packages/providers/src/community/*` | Not used. |
| Devin CLI | NEW (via INTEGRATE seam) | Provider plugin contract: `packages/provider-contract/src/plugin`, `docs/contributing/adding-a-community-provider.mdx` | `plugins/provider-devin/` implements `IAgentProvider`, served over stdio with `serveProvider`; installed by a receipt under `$ARCHON_HOME/plugins/installed/`. No registry patch. |
| OpenHands | NOT IMPLEMENTED (optional) | same seam | Documented as a future plugin; not built. |
| Per-role model selection | EXISTING | run request `tiers`, `aliases`, `config.assistant` (`POST /api/workflows/:name/run`) | Role profiles map to aliases (`@ceo`, `@developer`, ...) passed per run. |
| Provider credentials | DO NOT DUPLICATE | `archon ai`, `/api/auth/providers`, `~/.archon/.env` | Company layer stores no credentials. Devin uses its own `devin auth`. |
| Engine availability detection | EXISTING | `GET /api/providers`, `archon doctor`, provider `checkCredential` | The dashboard lists only providers the registry reports. |

## Surfaces

| Requirement | Class | Archon owner | Decision |
|---|---|---|---|
| REST API (Hono, OpenAPI, generated web types) | EXTEND | `packages/server/src/routes/api.ts`, `scripts/generate-api-types.ts` | `/api/company/*` routes are registered on the same `OpenAPIHono` app from a new module `packages/server/src/company/`. |
| Web console (React, react-router, cache store, skills layer) | EXTEND | `packages/web/src/experiments/console` | New routes under `/console/company/*` and one rail link. Existing pages untouched. |
| Run monitor, run detail, artifacts tab, attention queue | DO NOT DUPLICATE | `routes/RunDetailPage.tsx`, `/api/runs/attention` | Company pages link into these. |
| Project registration (codebases, clone from URL, local path) | DO NOT DUPLICATE | `POST /api/codebases` | A company project owns one Archon codebase. |
| Authentication (Better Auth, Postgres only), trusted header | EXISTING | `packages/server/src/auth` | Company routes sit under `/api/*`, so the existing gate applies. Roles: Archon users have roles (`archon user role`). |
| Chat platforms, webhooks, triggers | EXISTING | `packages/adapters`, `routes/webhooks.ts`, `archon trigger` | Not needed for the vertical slice; usable later. |

## SDLC behaviour

| Requirement | Class | Archon owner | Decision |
|---|---|---|---|
| Planning | EXISTING | `archon-plan-block` (`.archon/workflows/sdlc/plan`) | Reused inside `company-task-execution` via `include:`. |
| Implementation loop until green | EXISTING | `archon-implement` (loop + `assert-changed` guard) | Reused as `include:` or `workflow:` child. |
| Validation (discover and run the project's own checks) | EXISTING | `archon-validate` | Reused as the independent quality gate; its `green`/`red_cause` verdict feeds repair tasks. |
| Code review | EXISTING | `archon-review-block` | Reused in `company-quality-gate`. |
| Intake/triage, ship, deliver (PR + CI loop), merge queue | EXISTING | `archon-intake`, `archon-ship-block`, `archon-deliver-block` | Used when a project has a GitHub remote; local-only projects stop at the integration branch. |
| Requirements analysis, SRS, architecture, task graph | NEW (as workflows) | n/a | `company-project-intake` and `company-plan` workflows with `output_format` JSON that the company layer persists. |
| Staging deployment | NEW (as workflow) | bash/script nodes | `company-staging-deploy` builds and runs `docker compose` with a project-scoped name and checks health. |
| Repair loop with limits | EXTEND | engine loops have `max_iterations`; cross-run limits do not exist | Company scheduler owns `MAX_TASK_RETRIES` and `MAX_REPAIR_ITERATIONS` across runs. |
| Dependency-aware multi-project scheduler, concurrency caps, budgets | NEW | n/a (Archon caps are per provider, `MAX_CONCURRENT_CONVERSATIONS`) | `packages/server/src/company/scheduler.ts`, one tick loop in the server process, idempotent dispatch keyed by task attempt. |
| AI organisation roles | NEW | n/a | `agents/roles.yaml` (role, instructions, engine, model, timeout, budget). |
| Cost tracking | EXTEND | node results carry `tokens`/`costUsd` when providers report them | Company layer sums what runs report and labels it measured vs estimated. |

## Upstream files modified

Kept to the minimum needed to mount the new module. Each is listed in `docs/upstream-upgrade.md`; `scripts/export-patches` regenerates `patches/0001-autonomous-ai-company.patch` against the base tag.

1. `packages/server/src/index.ts` (+5): import and one call `startCompanyLayer(app, { webAdapter, lockManager })`.
2. `packages/server/src/scripts/generate-api-types.ts` (+2): include the company routes in the generated console API types.
3. `packages/web/src/experiments/console/ConsoleApp.tsx` (+2): the `company/*` route.
4. `packages/web/src/experiments/console/components/ProjectRail.tsx` (+2): the "AI Company" navigation link.
5. `packages/web/src/lib/api.generated.d.ts`: regenerated artifact.

Everything else is additive: `packages/server/src/company/`, `packages/web/src/experiments/console/routes/company/`, `packages/web/src/experiments/console/skills/company.ts`; outside the tree `workflows/company/` (home-scoped pack) and `plugins/provider-devin/`.
