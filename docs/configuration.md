# Configuration

| Where | What |
|---|---|
| `.env` (top level) | `ARCHON_HOME`, `ARCHON_PORT`, `BUN` for the scripts (`.env.example`) |
| `$ARCHON_HOME/.env` | Archon server env: `PORT`, `HOST`, `DEFAULT_AI_ASSISTANT`, provider auth posture, web auth (`DATABASE_URL`, `BETTER_AUTH_SECRET`), and the company limits below (`infrastructure/archon-home.env.example`) |
| `$ARCHON_HOME/config.yaml` | Archon model tiers and aliases. The company layer seeds one alias per role at boot (`@ceo`, `@pm`, …) from `agents/roles.yaml` and never overwrites an alias you changed (console → Settings → AI) |
| `agents/roles.yaml` | Role profiles: title, alias, preferred engine, model per engine, instructions, responsibilities; per-engine `tiers` for the bundled `small/medium/large` references; `defaults.fallback` engine order |
| Project (console or `PATCH /api/company/projects/:id`) | engine (`auto|devin|claude|codex|pi`), `budget_usd`, `max_concurrency`, requirements |

Company limits (environment, read at boot):

```
MAX_CONCURRENT_AGENTS=3          # open executions across all projects
MAX_TASK_RETRIES=3               # attempts per task before BLOCKED
MAX_REPAIR_ITERATIONS=5          # repair tasks per project before BLOCKED
MAX_AGENT_EXECUTION_MINUTES=60   # inactivity after which an execution is marked stale (never auto-failed)
COMPANY_TICK_MS=5000
COMPANY_SCHEDULER=off            # optional: disable the loop (tests)
COMPANY_ROLES_PATH=…             # optional: alternative roles.yaml
COMPANY_DATA_DIR=…               # optional: where project repositories live (default $ARCHON_HOME/company)
```

Task sizes and Devin models: the planner estimates hours per task; the scheduler stores a size (≤ 1.5 h small, ≤ 4 h medium, otherwise large) and, on Devin, binds the `large` tier that `archon-implement` runs on to that size's model from `tiers.devin` (defaults: small → `swe-2-high`, medium → `deepseek-v4-1-flash-high`, large → `gemini-4-argon-high`). Edit `agents/roles.yaml`; it is re-read when it changes, no restart needed.

Engine selection: an explicit project/task engine is used when its credential verified; `auto` takes the role's preferred engine, then `defaults.fallback` in order, skipping engines whose own `checkCredential` did not report `usable`. The chosen engine is bound for the whole run through Archon's run-level `tiers` and `aliases`, so bundled workflows (`model: large`) and company workflows (`model: "@developer"`) both land on it.
