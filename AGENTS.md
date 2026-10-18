# Working on the Autonomous AI Company (read this first)

This workspace turns **Archon v0.12.1** into an autonomous AI software company. Archon executes every AI workflow; the **Company Layer** (inside Archon's server) decides what to run, with which engine, and whether results are good enough. Everything below is what a new agent needs to continue the work without re-discovering it. The chronological record of what was done, why, and what is still open is in [`docs/worklog.md`](docs/worklog.md); read its "Current state" and "Next steps" sections before changing anything.

Repository: git@github.com:tiekungsos/Autonomous-AI-Company.git (`main`). `archon/` is not in it: `scripts/setup` clones Archon at `patches/BASE` and applies `patches/*.patch`. Before committing, run `scripts/export-patches` so the patch matches `archon/`.

## Map

| Path | What it is | Notes |
|---|---|---|
| `archon/` | upstream Archon checkout, tag `v0.12.1`, branch `company` | git-ignored by this repo; only four upstream files are modified (`docs/upstream-upgrade.md`); `scripts/export-patches` captures all changes into `patches/` |
| `archon/packages/server/src/company/` (symlink `company-layer/`) | the Company Layer: `schema.sql`, `db.ts`, `types.ts`, `engines.ts`, `repo.ts`, `dispatch.ts`, `scheduler.ts`, `routes.ts`, `index.ts`, tests | mounted by one call in `archon/packages/server/src/index.ts` |
| `archon/packages/web/src/experiments/console/routes/company/` + `skills/company.ts` | Company Management console pages (`/console/company/*`) | rebuild with `cd archon && bun run build:web` |
| `workflows/company/` | the company workflow pack (one folder per workflow with `commands/` and `scripts/`) | linked into `$ARCHON_HOME/workflows/company` (home scope) by `scripts/setup`; Archon shows them as `source: global` |
| `plugins/provider-devin/` | Devin CLI as an Archon provider plugin (`IAgentProvider` over stdio, protocol 2) | installed by receipt (`bun scripts/install.ts`); server restart loads it |
| `agents/roles.yaml` | AI roles: engine, model per engine, instructions; `tiers.<engine>` (for Devin = task sizes) | re-read on change (mtime); aliases are written into Archon's config at every server boot |
| `scripts/` | `setup start stop restart status logs test doctor watch-project verify-auth verify-restart-recovery export-patches` | all source `scripts/common.sh`; `stop` kills the server **and its agent subprocesses** (recorded pid tree only) |
| `tests/` | API end-to-end tests against the running server | `scripts/test` runs them after the unit and plugin tests |
| `data/` (git-ignored) | `archon-home/` (`ARCHON_HOME`: SQLite `archon.db`, workspaces, worktrees, artifacts, plugin receipts, `company/projects/<id>/` repositories), `logs/`, pid files | never delete while runs exist; inspect with `sqlite3 data/archon-home/archon.db` |
| `docs/` | architecture, capability audit, lifecycle, security, deployment, testing, troubleshooting, upgrade, delivery report, **worklog** | keep `delivery-report.md` and `worklog.md` current |

## Run, test, debug

```bash
scripts/start            # Archon + company layer on http://127.0.0.1:3090 (console: /console/company)
scripts/status           # health, providers, company counts
scripts/logs -n 200      # server log (JSON lines)
scripts/test             # company unit tests (one Bun process per file), plugin tests, API e2e
scripts/watch-project <project-id> [interval] [max]   # prints phase/tasks/open executions
scripts/verify-auth      # PostgreSQL + Better Auth instance on :3091, proves the auth gate
scripts/verify-restart-recovery   # restart while a task runs, proves orphan reconciliation
scripts/export-patches   # regenerate patches/ from archon/ against the base tag
```

- Use the project-local Bun: `export PATH=$PWD/.bun/bin:$PATH` (Archon pins 1.4.2; the host Bun lacks `Bun.YAML`).
- Archon CLI from source: `cd archon && bun run cli <cmd>` with `ARCHON_HOME=$PWD/../data/archon-home`. Validate workflows from a project checkout, e.g. `cd data/smoke-repo && bun --cwd ../../archon/packages/cli src/cli.ts validate workflows`.
- A run's evidence: `GET /api/workflows/runs/{id}` (status, outcome, `terminal_record`, `metadata.model_bindings`, token totals), `GET /api/workflows/runs/{id}/provider-events` (every provider chunk, including the Devin plugin's `warning` chunks), `GET /api/runs/{id}/artifacts`, and the console run page. Worktrees live under `data/archon-home/workspaces/<project>/worktrees/`.
- The Devin plugin streams tool calls live from Devin's session DB (`plugins/provider-devin/src/live.ts`); keep every call closed exactly once.
- Devin's own record of a turn: `~/.local/share/devin/cli/sessions.db` (`sessions.working_directory` = the worktree; `tool_call_state` holds every tool call and whether it was rejected). Use it when a Devin node ends with prose or a missing file.
- Company state: `GET /api/company/projects/{id}` (project, tasks, dependencies, documents, executions, deployments, events, spend). `POST /api/company/tick` runs one scheduler pass.
- Before every restart after editing `packages/server/src/company`, run `cd archon/packages/server && bun x tsc --noEmit` (a syntax error stops the server from booting).
- The server must be restarted for code changes in `packages/server/src/company` or the plugin; `agents/roles.yaml` and `workflows/company/*` are read live (workflows at dispatch, roles on change).

## Conventions and rules

- Archon's own `archon/AGENTS.md` governs code inside `archon/` (KISS, typed invariants, additive schema, no prose parsing of model output, never guess run ownership). The company code follows it.
- Keep the upstream footprint at the four patched files. Everything else is additive. Document any new upstream edit in `docs/upstream-upgrade.md` and re-run `scripts/export-patches`.
- Company tables are `company_*` only, created with `CREATE TABLE IF NOT EXISTS`; new columns go through the guarded `ALTER TABLE ... ADD COLUMN` list in `db.ts` (`ensureSchema`). Never touch `remote_agent_*` tables except reads.
- Dispatch is idempotent: task attempts are keyed `task:<id>:attempt:<n>` where `attempts` only ever increases (resume sets `attempt_base`, the retry limit counts `attempts - attempt_base`); gate phases are keyed on `project.phase_entered_at`, which `updateProject` restamps on every phase change. Do not add in-memory counters and never reset `attempts`.
- Retries after a red validate/review adopt the previous run (`adoptRunId` → Archon `workflowAdoptRunId`): same worktree and branch, its artifacts in `$ADOPTED_RUN_DIR`, its AI policy inherited (so no model overrides are sent). Other failures start fresh from the base branch.
- Run success ≠ work success: read the run's authored `outcome` and `terminal_record.returns`, never `status` alone.
- Bun module mocks leak across test files: run each `*.test.ts` in its own process (as `scripts/test` does), and spread the real module when mocking (`{ ...realModule, override }`).
- Devin provider: print mode, `--sandbox`, prompt via `--prompt-file`, `--export` for session id and usage, per-turn `--config` granting `Write(...)` for the worktree, the repository's git common dir (or commits fail), and the run's artifact/state dirs; `assistants.devin.allowDocker: true` (in `$ARCHON_HOME/config.yaml`) adds `Exec(docker)` to `permissions.allow` and `sandbox.excluded.allow`; one JSON follow-up on the same session when a structured reply is missing. Agents must never ask for access (print mode cannot answer); the task brief says so.
- Model/engine choice lives in `agents/roles.yaml`: `tiers.devin` doubles as task sizes (small/medium/large → model); each role alias binds its own engine when that engine is selectable (credential usable, or Claude's unverifiable login), else the run engine.
- Do not set `PORT` in `$ARCHON_HOME/.env`: the server's env is inherited by agents and check scripts, and generated projects read `${PORT}`. Archon defaults to 3090.
- Agents may leave containers behind; list them with `docker ps --format '{{.Names}} {{.Label "com.docker.compose.project.working_dir"}}'` and remove only those whose working dir is under `data/archon-home`.
- Secrets: none are stored by the company layer; `.env` files and `data/` are git-ignored; never print credential values.

## Test mode (on as of 2026-10-19)

`COMPANY_MODEL_OVERRIDE=devin/swe-2-high` is set in `data/archon-home/.env`: every role, tier and task size runs on Devin SWE-2 High (free). The per-role engines (Claude, Codex) and per-size Devin models in `agents/roles.yaml` are inactive until that line is removed and the server restarted.

## Known gaps (as of 2026-10-19)

- `archon validate workflows` reports the `@role` aliases of the global pack as non-portable (it wants tiers/literals for global workflows); runtime resolution is verified by real runs. Accepted and documented in `docs/workflows.md`.
- Devin reports no cost; the layer estimates from tokens and list prices per role model.
- Devin print mode streams only the final message; progress shows as `state_update` chunks.
