# Architecture

```
HUMAN OWNER ── Archon console (/console/company) ── /api/company/* ──┐
                                                                      │  Company Layer (packages/server/src/company)
   routes.ts ── db.ts (company_* tables on Archon's DB) ── scheduler.ts ── dispatch.ts ── engines.ts ── repo.ts
                                                           │                 │
                                                           │  tick loop      │ handleMessage() (same path as POST /api/workflows/:name/run)
                                                           ▼                 ▼
                                               Archon engine: workflow runs, worktrees, events, artifacts, resume, cancel
                                                           │
                              ┌────────────────────────────┼───────────────────────────────┐
                              ▼                            ▼                               ▼
                 company-project-intake        company-task-execution              company-quality-gate / -security-review /
                 (CEO, PM, Architect,          (archon-implement → archon-validate  -staging-deploy / -delivery
                  Designer, Project Manager)    → archon-review-block → push)
                              │                            │                               │
                              └─────────── provider registry: devin (plugin) · claude · codex · pi ───────────┘
                                                           │
                                           git worktrees → origin (local bare or remote) → integration branch → docker compose staging
```

**Archon owns execution.** Every AI step is a node of an Archon workflow run: persistence, resume, cancellation, event log, artifacts, provider streaming, worktree isolation, budgets and retries are Archon's. The company layer never calls a model itself.

**The company layer owns decisions.** Organisation roles, project portfolio, requirements and documents, milestones and tasks with dependencies, scheduling across projects (capacity, budgets, idempotent dispatch), observation of run outcomes (authored `outcome`/`returns`, never run status alone), integration of green branches, repair loops with hard limits, staging deployments and delivery verification, reporting.

## Components

| Component | Location | Role |
|---|---|---|
| Routes | `company/routes.ts` | `/api/company/*` on Archon's `OpenAPIHono` app (OpenAPI, generated console types, same auth gate) |
| Persistence | `company/db.ts`, `company/schema.sql` | `company_*` tables on Archon's SQLite/PostgreSQL connection; additive, never touches `remote_agent_*` |
| Scheduler | `company/scheduler.ts` | tick loop: observe open executions → advance each active project through the lifecycle |
| Dispatch | `company/dispatch.ts` | in-process launch through `handleMessage` with typed `workflowName`, `workflowInputs`, `workflowModelOverrides`; one web conversation per execution; run id reconciled afterwards |
| Engines | `company/engines.ts` | role profiles from `agents/roles.yaml`; provider availability via each provider's `checkCredential`; engine selection and `tiers`/`aliases` bindings |
| Repositories | `company/repo.ts` | project checkout + bare origin under `$ARCHON_HOME/company/projects/<id>/`; merge of pushed task branches; conflict detection |
| Workflow pack | `workflows/company/*` (→ `$ARCHON_HOME/workflows/company`) | packaged home-scoped workflows with their own `commands/` and `scripts/`; reuse the SDLC pack through `include:` |
| Devin provider | `plugins/provider-devin` | `IAgentProvider` served over stdio (`serveProvider`), installed by receipt |
| Console | `console/routes/company/*` | Overview, Projects, AI Company, AI Agents, Task Board, Workflows, Repositories, Deployments, Analytics, Settings |

## Data flow for one task

1. Scheduler marks a `BACKLOG` task `READY` when all dependencies are `COMPLETED`; checks global and project capacity and the budget; inserts an execution row with idempotency key `task:<id>:attempt:<n>`.
2. `dispatchWorkflow` creates a conversation on the project's codebase and calls Archon's orchestrator with `company-task-execution`, the task brief as `$INPUTS.task_brief`, and tiers/aliases binding every role to the chosen engine.
3. Archon creates a worktree on a fresh branch, runs implement → validate → review, pushes the branch, and records the typed verdict as the run's `returns`.
4. The next tick reads the run row, its terminal record and usage, stores verdict/tokens/cost on the execution, and merges the branch into the integration branch on green (or records the red cause and re-queues within limits).

## Upstream footprint

Three upstream files are modified (see `docs/upstream-upgrade.md`): `packages/server/src/index.ts` (+5 lines), `packages/server/src/scripts/generate-api-types.ts` (+2), `packages/web/src/experiments/console/ConsoleApp.tsx` (+2), `packages/web/src/experiments/console/components/ProjectRail.tsx` (+2). Everything else is additive.
