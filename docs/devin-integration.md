# Devin CLI integration

Devin CLI (`devin`, Cognition) is integrated as an **Archon provider plugin** (`plugins/provider-devin`), through the supported extension seam (`@archon/provider-contract/plugin`, protocol 2). No Archon registry code was patched.

## Verified on this host
- `devin 3000.11.92`, logged in via `devin auth status` (exit 0).
- Non-interactive execution: `devin -p --prompt-file <file> --sandbox --respect-workspace-trust false --export <file>` (exit 0 on success; stdout = final answer). `--sandbox` (macOS seatbelt) confines writes to the workspace and implies the autonomous permission mode (`--permission-mode` is ignored with it, Devin prints a warning).
- `--model <id>` is honoured (`devin models list` names them); an unknown model exits 1 with `Error: Unknown model` on stderr.
- `--export` writes an ATIF transcript with `session_id`, `agent.model_name`, `steps` and `final_metrics` (prompt/completion/cached tokens). `-r <session_id>` resumes a session in print mode.
- `SIGTERM` ends the process (used for cancellation).
- A bundled Archon workflow (`archon-validate`) completed green with every tier bound to Devin (`devin/swe-2-high`), and the company intake workflow runs its CEO/PM/Architect/Planner nodes on Devin models.

## Adapter (`plugins/provider-devin/src/provider.ts`)
| Required operation | Implementation |
|---|---|
| validateInstallation | `resolveDevinBinary` (config `binPath` → `DEVIN_BIN_PATH` → PATH → `~/.local/bin/devin`), `diagnose()` (version + auth) |
| validateAuthentication | `checkCredential()` runs `devin auth status`; exit 0 ⇒ `usable` (native), else `not_connected` |
| executeTask | `sendQuery()` spawns the CLI in the run's worktree with the prompt file; structured output requests append the JSON schema (best-effort) and parse the reply |
| getExecutionStatus | streamed `state_update`, then `result` and `settled` chunks (Archon records them per node) |
| collectOutput | `result.text`, `structuredOutput`, `tokens` (input/output/cacheRead/total), `numTurns`, `resolvedModel`, `sessionId` |
| collectArtifacts | git diff and changed files are captured by Archon's worktree (`push-branch` script reports branch, head, changed file count); artifacts go to `$ARTIFACTS_DIR` |
| cancelExecution | abort signal → SIGTERM, SIGKILL after 5 s; no `settled` is manufactured |

Failures are typed: missing binary ⇒ `misconfigured`; timeout/spawn failure ⇒ `transient`; non-zero exit ⇒ `unknown` with the stderr tail as evidence (Archon decides retry from the class). Capabilities declared: `sessionResume`, `structuredOutput: best-effort`, `tokenReporting`, `sandbox`, `envInjection`; no MCP/skills/plugins/native tools/container exec.

## Sandbox write scopes
Devin's sandbox only allows writes inside the workspace plus granted `Write(...)` permission scopes, and print mode cannot answer a confirmation prompt. Archon nodes write run artifacts outside the worktree (`$ARTIFACTS_DIR`, `$STATE_DIR`, `$ADOPTED_RUN_DIR`), and an AI node's subprocess receives only the run identity (`ARCHON_NODE_EXECUTION`, `WORKFLOW_ID`), not those paths. The adapter therefore derives them from Archon's workspace layout (worktree at `<project root>/worktrees/...` ⇒ artifacts at `<project root>/artifacts/runs/<runId>`, state at `<project root>/state`; otherwise a glob under `$ARCHON_HOME/workspaces` for the run id), writes a per-turn config (the user's `~/.config/devin/config.json` merged with `permissions.allow += ["Write(<dir>)", "Write(<dir>/**)"]`) and passes it with `--config`. Without this grant a turn that writes a document ends with an empty reply (observed on the first intake run; now surfaced as the `devin.empty_reply` warning).

## Bypass mode (opt-in, off)
`ARCHON_DEVIN_PERMISSION_MODE=bypass` in `$ARCHON_HOME/.env` (then `scripts/restart`) runs Devin with `--permission-mode dangerous` and without `--sandbox`: every tool call is approved and the agent can write anywhere the user account can. It is read from the plugin's environment so it also reaches adopted runs. Off by default; the sandboxed mode with the per-turn grants (worktree, git dir, run artifacts, `~/.docker`, `Exec(docker)`) covers the work seen so far.

## Install / update
`bun scripts/install.ts` (run by `scripts/setup`) writes `$ARCHON_HOME/plugins/archon-provider-devin` (a wrapper that execs `bun --no-env-file src/main.ts`) and the receipt `$ARCHON_HOME/plugins/installed/local/autonomous-ai-company/plugins/provider-devin/receipt.json`, then restart the server. Config per install/run (`assistants.devin` or node config): `model`, `sandbox` (default true), `binPath`, `timeoutMs`.

## Limitations
- Print mode streams only the final answer; tool calls are not live-streamed (the transcript export is read after the turn). Long turns rely on Devin's own progress; Archon's `idle_timeout` is not set on company nodes.
- Cost is not reported by Devin; the company layer estimates it from tokens and the published list prices and labels it as an estimate.
- Devin Cloud sessions (`--cloud`) are not used.
