# Worklog

Chronological record of the build, for whoever continues it (human or AI). Times are Asia/Bangkok (UTC+7). Evidence is cited by Archon run id (`GET /api/workflows/runs/{id}`) or by file. Read [`AGENTS.md`](../AGENTS.md) for the map and rules.

## Current state (updated 2026-10-19 00:15)

- Platform: Archon v0.12.1 (`5f2b4841…`) + Company Layer, running from `scripts/start` on http://127.0.0.1:3090. SQLite at `data/archon-home/archon.db`. Console at `/console/company`.
- Engines: **devin** verified (plugin, sandboxed print mode; implementation model by task size: small `swe-2-high`, medium `deepseek-v4-1-flash-high`, large `gemini-4-argon-high`); **codex** verified (`gpt-5.6-sol`, run `c0526823`; roles pm, projectmanager, security); **claude** verified after the operator's `claude login` (run `aa885301`; roles ceo, architect, designer, reviewer); Devin may run Docker (`assistants.devin.allowDocker`); **pi** unconfigured.
- Tests: scheduler 4/4, engines 4/4, plugin 7 (incl. the `DEVIN_E2E=1` stdio test), API e2e 9/9, auth verification and restart-recovery verification passed (see `docs/delivery-report.md`).
- Real project "Shortlink API" (`0109f6f3-3d6b-47e0-91a5-5206fcb604d3`): intake done (run `6a13d02c`; 4 milestones, 9 tasks, documents persisted). Development: T1 attempts 1–3 failed for three different environment reasons (restart test, Docker/access prompt, workspace writes rejected by the per-turn config); each fixed in turn (see journal). After the third fix the project is resumed (attempts reset) and T1 runs again. `MAX_TASK_RETRIES=3`; **Resume** on the project page resets attempts.
- Not yet exercised on a real project: task integration/merge, QA gate, security review, staging deploy, acceptance, delivery. All are implemented and unit-tested.

## Next steps

1. Watch `scripts/watch-project 0109f6f3-3d6b-47e0-91a5-5206fcb604d3 30 400` (or the project page). If T1 blocks again, read its run's provider events, fix the cause, press Resume.
2. When tasks start merging, confirm `integrateBranch` merged into `main` of `data/archon-home/company/projects/<id>/origin.git` and that T2/T3 ran in parallel (concurrency 2).
3. Watch the gates: `company-quality-gate` (needs the project's own checks to run in a fresh worktree; the discover agent must install deps), `company-security-review` (Codex), `company-staging-deploy` (Docker on the host, compose project `company-<id12>`), acceptance, `company-delivery`.
4. Fill `docs/delivery-report.md` §10 and §13 with the real outcomes; re-run `scripts/test`; `scripts/export-patches`.
6. Optional improvements noted along the way: stream Devin tool activity (read the transcript export incrementally), PR-based integration for GitHub remotes (`archon-pr`/`archon-deliver` are available), per-node token accounting for better cost estimates.

## Journal

### 2026-10-18 22:00–22:20 — discovery
- Host: macOS 26.3, M1 Pro, 16 GB; Docker 29.8, Node 23.7, gh 2.90, Claude Code 2.1.296, Devin CLI 3000.11.92 (logged in), Codex npm binary broken, Pi absent, host Bun 1.1.26.
- Cloned Archon, pinned `v0.12.1`; read `AGENTS.md`, `.archon/architecture.md`, SDLC pack, provider contract, docs (`llms.txt` sets). Audit written to `docs/archon-capability-audit.md`.
- Devin probes: `-p` print mode works; `--sandbox` implies autonomous permission mode; `--export` gives session id, model, token metrics; `-r <session>` resumes in print mode; invalid model → exit 1 "Unknown model"; `--prompt-file` works; SIGTERM ends it.

### 22:20–22:40 — Archon up
- `bun install` with host Bun → workflows failed to parse (`Bun.YAML` missing). Installed Bun 1.4.2 (Archon's `engines.bun`) into `.bun/`; reinstalled; 24 bundled workflows load.
- Isolated home `data/archon-home` (`ARCHON_HOME`), `.env` with Claude global auth, port 3090, telemetry off. Console built and served.
- Smoke repo `data/smoke-repo`: worktree runs need an `origin` → added a local bare remote (pattern reused for company projects). Claude node failed: *OAuth token revoked* (host-wide; `claude -p` fails too). `archon-validate` with all tiers on Devin → run `4d85daa2` completed, `green: true`, 50,253/362 tokens.

### 22:40–23:00 — Devin provider plugin
- `plugins/provider-devin`: descriptor (protocol 2, best-effort structured output, sessionResume, tokenReporting), `sendQuery` spawning `devin -p --prompt-file … --sandbox --respect-workspace-trust false --export …`, failure classes, `checkCredential` via `devin auth status`, `listModels`, `diagnose`. Dev install writes the wrapper executable and receipt under `data/archon-home/plugins`. Registered: `GET /api/providers` lists `devin`.

### 23:00–23:30 — Company Layer and console
- `packages/server/src/company/`: schema (`company_projects/documents/milestones/tasks/task_deps/executions/deployments/events`), db, engines (roles.yaml, availability via `checkCredential`), repo (bare origin per project, branch integration), dispatch (in-process `handleMessage`, same path as `POST /api/workflows/:name/run`), scheduler (tick loop, lifecycle phases, repairs with limits, budget), routes (`/api/company/*`, OpenAPI), index (schema, aliases, scheduler). Mounted from `server/src/index.ts`.
- Company workflow pack written, then restructured into Archon's packaged layout (one folder per workflow with its own `commands/` and `scripts/`). Role aliases seeded into `config.yaml`; `archon validate workflows` → 68 valid.
- Console pages (`routes/company/*`, `skills/company.ts`), rail link, router entry; API-types generator patched to include company routes; `bun run build:web` ok.
- Tests: scheduler lifecycle (faked dispatch/runs/git), plugin unit tests, API e2e. `scripts/*` management scripts.

### 23:30–23:45 — first real project exposed four defects (all fixed)
1. Pack under `archon/.archon/workflows` is project scope of the Archon repo, invisible to other projects → moved to `workflows/company`, linked into `$ARCHON_HOME/workflows/company` (global scope).
2. Runs are created on a worker conversation → match `parent_conversation_id`; refusals read from typed message metadata (`workflow_dispatch_status` / `workflow_result`), not prose.
3. Devin sandbox refused writes to `$ARTIFACTS_DIR` (outside the worktree); print mode cannot confirm → empty reply. AI nodes receive no `ARTIFACTS_DIR` env, so the plugin derives the run's artifact/state dirs from the worktree path and grants `Write(...)` scopes via a per-turn `--config`. Verified: CEO node returned schema-valid JSON (run `6a13d02c`).
4. Gate dispatch keys used an in-memory round counter (lost on restart) → `phase_entered_at` column + durable keys.
- Auth verified on a second instance (`scripts/verify-auth`, PostgreSQL via `docker-compose.yml`): 401 → sign-in 200 → 200; 403 non-allowlisted; 401 wrong password.

### 23:45–00:00 — recovery and evidence
- Orphan reconciliation: a run dispatched before the current server boot, still `running`, whose live-owner endpoint does not answer, is abandoned through Archon's operations and the task retried. `scripts/verify-restart-recovery` during T1: run `578fb3b5` → `execution.orphaned`, re-dispatched as `d96bb0ea`.
- `scripts/stop` now kills the server's process tree (plugin and agent CLIs) so a restart cannot leave Devin writing into a released worktree.
- Cost estimate uses the role's bound model (was the `large` tier only). Delivery report drafted.

### 2026-10-19 00:00–00:15 — operator changes
- Devin tiers mapped to task sizes (planner labels `size`; fallback from `estimate_hours`); `large` tier bound per task at dispatch. Existing tasks backfilled.
- Roles: claude → ceo, architect, designer, reviewer; codex → pm, projectmanager, security. Per-role engine binding within a run (`roleBindings`), `roles.yaml` hot-reload, aliases rewritten at boot. Codex verified (`c0526823`). Claude blocked on login.
- T1 attempt 2 failed: Devin tried Docker, sandbox blocked it, it asked for access, final reply prose. Fixes: brief rules (no Docker, no access requests, always finish with the structured answer; planner must not create Docker-run tasks) and a provider-level JSON follow-up on the same session. T1 attempt 3 dispatched (run `25d55b01`).
- Validator note: the global pack's `@role` aliases are flagged as non-portable by `archon validate`; runtime resolution verified, documented.
- 00:01 T1 attempt 3 (run `25d55b01`) ended red with `red_cause: environment`: Devin's **write tool was rejected inside the worktree**. Cause: the per-turn `--config` carries an explicit `permissions.allow`, which turns workspace edits from auto-approved into allow-listed only. Fix: the plugin now grants the workspace itself (`Write(<cwd>)`, `Write(<cwd>/**)`) besides the run's artifact/state dirs. The structured-output path worked (both loop iterations returned JSON). Project BLOCKED (T1 exhausted 3 attempts) → Resume after the fix.
- 00:20 Two scheduler defects found by the resume: (a) resume readied every blocked task, including ones whose dependency was still open → tasks now return to BACKLOG and dependencies are re-checked right before dispatch; (b) resume reset `attempts` to 0, but `attempts` is the idempotency-key suffix, so the next dispatch collided with the old execution and nothing ran. `attempts` is now monotonic and a new `attempt_base` column marks where the retry allowance restarts. Both covered by tests. Each root cause for the three T1 failures (Docker/access prompt; workspace writes rejected by the per-turn config; dependency/attempt handling on resume) is fixed; T1 attempt 4 dispatched.

### 2026-10-19 00:10–00:30 — operator: Claude login, Docker for Devin
- Operator ran `claude login`. Verified through Archon: one-node Claude workflow run `aa885301` succeeded (`claude/opus`). Claude roles (ceo, architect, designer, reviewer) are now live; the engine still reports `not_checked` (Claude cannot check without spending), which `roleEngineSelectable` accepts.
- Operator authorised Docker for Devin. Devin's config format is `sandbox.excluded: { allow: ["Exec(docker)"], ask: [], deny: [] }` (runs matching commands outside the sandbox) plus `permissions.allow: ["Exec(docker)"]`; probe returned the host Docker version. Plugin option `allowDocker` (descriptor schema) is set in `$ARCHON_HOME/config.yaml` under `assistants.devin.allowDocker: true`; the plugin adds both rules to the per-turn config. Task briefs and the planner prompt now say Docker is available (compose project `t-<task>`, clean up after). Security note: this gives the agent host Docker access (equivalent to broad host access); turn it off by removing the key.
- T1 attempt 4 created every file but committed nothing (`changed_files: 0`): a git worktree stores objects/refs/index in the main repository's `.git`, outside the worktree, so the sandbox blocked `git commit`. The plugin now grants `git rev-parse --git-common-dir` too; reproduced a sandboxed commit inside a worktree successfully.
- Restart-orphaned attempts no longer count against the retry limit (`attempt_base` +1 on orphan). T1 attempt 7 dispatched (run `e1de236f`).
- Mistake corrected: running `plugins/provider-devin/scripts/install.ts` without `ARCHON_HOME` wrote into `~/.archon`; removed those two files and changed the installer default to the workspace's `data/archon-home`.

### 2026-10-19 — published
- Pushed to `git@github.com:tiekungsos/Autonomous-AI-Company.git` (`main`, commit `ec653c5`). `archon/` and `data/` are excluded; the Archon changes ship as `patches/0001-autonomous-ai-company.patch` (verified to apply cleanly to a fresh `v0.12.1`), and `scripts/setup` now clones Archon and applies it when `archon/` is missing. Secret scan of the commit found nothing.
