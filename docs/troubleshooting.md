# Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `GET /api/workflows` returns `YAML parse error: Bun.YAML.parse` | Host Bun is older than Archon's pin. Use the project-local Bun (`scripts/setup`, `.bun/bin/bun` 1.4.2). |
| Run fails `Cannot determine git remote` | Worktree isolation needs an `origin`. Company projects always get one (bare origin or the given URL); for your own codebases add a remote. |
| Node fails `provider reported auth: OAuth token revoked` (Claude) | Run `claude login` on the host; Archon uses Claude Code's global login (`CLAUDE_USE_GLOBAL_AUTH=true`). Until then `auto` selects Devin. |
| Engine shown unavailable | Settings → Coding engines → Re-check. Devin: `devin auth login`. Pi: set a model (`assistants.pi.model`) and a vendor key. Codex: `archon provider add codex` / login. |
| Project paused with "Budget exhausted" | Raise `budget_usd` (project page → PATCH) and Resume. Spend = measured + estimated. |
| Project BLOCKED | Read `blocked_reason` and the task's last error on the board; fix the cause (often requirements) and press Resume; blocked tasks go back to READY with attempts reset. |
| Execution `stale` | No run activity for `MAX_AGENT_EXECUTION_MINUTES`. Open the run page: cancel it (the next tick records the failure and retries within limits) or wait. Nothing is auto-failed. |
| Staging unhealthy | Deployments tab shows the compose log tail; `docker compose -p company-<id> logs`. The DevOps repair task retries after fixes. |
| Workflow validation errors for `@role` aliases | Aliases are seeded at server boot into `$ARCHON_HOME/config.yaml`; restart the server or add them in Settings → AI. |
| Console shows old pages | Rebuild: `cd archon && bun run build:web`, then restart. |
| Server will not start | `scripts/logs -n 100`; `startup_failed` names the module. `scripts/doctor` checks prerequisites. |
