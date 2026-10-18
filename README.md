# Autonomous AI Company

An autonomous AI software company built **on top of [Archon](https://github.com/coleam00/Archon) v0.12.1**: a human submits a software project through the Archon console, and a configurable organisation of AI roles (CEO, Product Manager, Project Manager, Architect, Designer, Tech Lead, Developers, QA, Security, DevOps, Reviewer, Technical Writer) plans it, builds it task by task in isolated git worktrees, validates and reviews it, repairs failures within configured limits, deploys it to an isolated Docker staging environment, verifies it, and delivers documentation. Archon's workflow engine executes every piece of AI work; the **Company Layer** decides what to run, when, with which engine, and whether the result is good enough.

Primary coding engine: **Devin CLI** (as a first-class Archon provider plugin). Additional engines: Claude Code, Codex, Pi (Archon's maintained providers). Everything runs self-hosted on this machine.

## Layout

```
autonomous-ai-company/
├── archon/                 pinned upstream checkout (v0.12.1) on branch `company` with minimal patches
│   ├── packages/server/src/company/   the Company Layer (routes, scheduler, dispatch, persistence)
│   └── packages/web/src/experiments/console/routes/company/   the Company Management console pages
├── company-layer -> archon/packages/server/src/company   (symlink)
├── workflows/company/      the company workflow pack (intake, task execution, gates, deploy, delivery);
│                           linked into $ARCHON_HOME/workflows/company by scripts/setup (home-scoped Archon workflows)
├── plugins/provider-devin/ Devin CLI provider plugin (Archon provider contract, protocol 2)
├── agents/roles.yaml       AI role profiles: instructions, engine, model per engine, budgets
├── scripts/                setup · start · stop · restart · status · logs · test · doctor · watch-project · verify-auth · export-patches
├── tests/                  API end-to-end tests against a running platform
├── docs/                   architecture, audit, lifecycle, security, deployment, upgrade, ...
├── infrastructure/         env examples; docker-compose.yml (optional PostgreSQL for web auth)
├── data/                   runtime state (Archon home, project repositories, logs); git-ignored
└── .bun/                   project-local Bun 1.4.2 (the version Archon pins); git-ignored
```

## Quick start

```bash
scripts/setup      # installs Bun 1.4.2 locally, Archon deps, builds the console, installs the Devin plugin receipt
devin auth login   # once, if not already logged in (Devin is the primary engine)
scripts/start      # Archon server + company layer on http://127.0.0.1:3090
scripts/status
```

Open **http://127.0.0.1:3090/console/company** → *Projects* → *New project* → fill name, requirements (problem, why, outcome, invariants, acceptance), optional repository URL and stack, choose an engine, budget and concurrency → **Start autonomous development**.

Watch progress on the project page (lifecycle, task board, executions with links to Archon run logs and artifacts), on *AI Agents* (live executions) and *AI Company* (organisation with real assignments). `scripts/watch-project <id>` prints the same from the terminal.

```bash
scripts/test       # company unit tests, Devin plugin tests, API e2e tests
scripts/logs       # follow the server log
scripts/stop
```

## What happens after you press Start

1. **Intake** (`company-project-intake`): CEO feasibility and scope → PM writes the SRS → Architect designs the system and names the real build/test commands → Designer specifies screens when there is a UI → Project Manager produces milestones and a dependency-aware task backlog. Documents land as artifacts; the task graph is persisted.
2. **Autonomous development**: ready tasks (dependencies merged) are dispatched up to the concurrency caps as `company-task-execution` runs, each in its own worktree: `archon-implement` (loop until focused checks pass) → `archon-validate` (the project's own checks, independently) → `archon-review-block` (specialist reviewers) → push. Green branches are merged into the integration branch; red ones are retried with the failure context up to `MAX_TASK_RETRIES`, then blocked.
3. **Quality gate** on the integrated branch (checks + acceptance criteria verification) → **security review** → **staging deployment** (`docker compose -p company-<id>`, health check, bound to 127.0.0.1) → **acceptance verification** against staging → **delivery** (docs, delivery report, merged). Failed gates create repair tasks (bounded by `MAX_REPAIR_ITERATIONS`) and send the project back to development.
4. A project is **COMPLETED** only after every gate passed. Otherwise it is **BLOCKED** with the reason, and *Resume* resets blocked tasks for another round.

## For the next engineer or AI agent

Start with [AGENTS.md](AGENTS.md) (map, commands, rules) and [docs/worklog.md](docs/worklog.md) (what was done, current state, next steps).

## Documentation

See `docs/`: [architecture](docs/architecture.md) · [capability audit](docs/archon-capability-audit.md) · [company layer](docs/company-layer.md) · [installation](docs/installation.md) · [configuration](docs/configuration.md) · [agents](docs/agents.md) · [Devin integration](docs/devin-integration.md) · [workflows](docs/workflows.md) · [project lifecycle](docs/project-lifecycle.md) · [security](docs/security.md) · [deployment](docs/deployment.md) · [testing](docs/testing.md) · [troubleshooting](docs/troubleshooting.md) · [upstream upgrade](docs/upstream-upgrade.md) · [delivery report](docs/delivery-report.md) · [worklog](docs/worklog.md)
