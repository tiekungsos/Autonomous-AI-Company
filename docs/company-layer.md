# Company layer

Code: `archon/packages/server/src/company/` (symlink `company-layer/`). Workflows: `workflows/company/` (linked into `$ARCHON_HOME/workflows`).

## Persistence (`schema.sql`)
`company_projects` (portfolio, lifecycle `phase`, `paused`, engine, budget, concurrency, codebase/repo pointers), `company_documents` (requirements, SRS, architecture, UX spec, plan, intake JSON, delivery report), `company_milestones`, `company_tasks` (status, role, kind feature|repair, attempts, verdicts, branch, run id), `company_task_deps`, `company_executions` (one row per dispatched Archon run: idempotency key, phase, role, engine, workflow, conversation, run id, status, verdict, tokens, measured and estimated cost), `company_deployments`, `company_events` (audit log). Timestamps are ISO text; ids are UUIDs; the schema is created with `CREATE TABLE IF NOT EXISTS` on Archon's connection (SQLite by default, PostgreSQL with `DATABASE_URL`).

## Scheduler (`scheduler.ts`)
- Runs every `COMPANY_TICK_MS` (5 s) inside the server; `POST /api/company/tick` runs one pass on demand.
- **Observe**: for each open execution, find its run (by conversation) and read Archon's run row; mark `running`, `stale` (no activity for `MAX_AGENT_EXECUTION_MINUTES`; never auto-failed, surfaced to the operator), or terminal. On terminal: read `terminal_record.returns`, `outcome`, token totals and cost; then apply the phase handler.
- **Advance**: per active, unpaused project: `PROJECT_CREATED` → prepare repo + codebase → intake; planning phases reflect the intake run's current node; `AUTONOMOUS_DEVELOPMENT` → dependency resolution and capacity-bounded dispatch; `INTEGRATION` → sync; `AUTOMATED_QA`, `SECURITY_REVIEW`, `STAGING_DEPLOYMENT`, `ACCEPTANCE_VERIFICATION`, `DELIVERY` → one gated execution each (idempotent per round).
- **Limits** (env): `MAX_CONCURRENT_AGENTS=3`, `MAX_TASK_RETRIES=3`, `MAX_REPAIR_ITERATIONS=5`, `MAX_AGENT_EXECUTION_MINUTES=60`. Budget: `budget_usd` per project against measured + estimated spend; exhaustion pauses the project with a reason.
- **Recovery**: executions are durable rows written before dispatch; after a restart the next tick reconciles them against Archon's run rows. A run dispatched before the current server process started, still reported running, whose live-owner endpoint nobody answers (`isRunOwnerAnswering`) was orphaned by the restart: the layer abandons it through Archon's operations (run cancelled, worktree released), records an `execution.orphaned` event, and the normal failure path retries the task within its limits. Gate dispatches are keyed on the project's `phase_entered_at`, so the same phase entry is never dispatched twice even across restarts. A refused dispatch is detected from the orchestrator's typed reply metadata; a silent one times out after 5 minutes.

## Dispatch (`dispatch.ts`)
Same code path as `POST /api/workflows/:name/run`: a new `web-*` conversation on the project's codebase, `handleMessage` with `actor: operator`, `workflowName`, `workflowInputs`, `workflowModelOverrides` (tiers + role aliases). The run is found afterwards through `remote_agent_workflow_runs.conversation_id`.

## API (`routes.ts`)
`GET /api/company/overview | engines | roles | limits | analytics | tasks | tasks/:id | executions | deployments`, `GET/POST /api/company/projects`, `GET/PATCH /api/company/projects/:id`, `POST /api/company/projects/:id/start|pause|resume|cancel`, `GET /api/company/projects/:id/documents/:docId`, `POST /api/company/tick`. All documented in `GET /api/openapi.json`.
