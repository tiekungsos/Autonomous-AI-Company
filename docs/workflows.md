# Workflows

All AI work runs as Archon workflows. Bundled SDLC pack (reused, unmodified): `archon-plan`, `archon-implement`, `archon-validate`, `archon-review`/`archon-review-block`, `archon-deliver`, `archon-ship`, `archon-pr`, `archon-intake`, `archon-triage`, `archon-merge-queue` and friends (`archon workflow list`).

Company pack (`workflows/company/`, linked to `$ARCHON_HOME/workflows/company` so Archon discovers it as home-scoped (`source: global`) workflows for every project). Role nodes select their model through `@role` aliases (`@ceo`, `@qa`, ...). Archon's validator reports those aliases as non-portable for a global workflow (it wants tiers or literal models there); on this install the aliases are written into the config from `agents/roles.yaml` at every boot and every dispatch also passes them per run, and real runs resolve them (recorded in `run.metadata.model_bindings`). The remaining validator entries for the pack are that rule only:

| Workflow | Inputs | Returns (`outcome_field`) | Purpose |
|---|---|---|---|
| `company-project-intake` | project_name, description, requirements, tech_stack, repository_url | compose (`feasible`): assumptions, risks, acceptance criteria, stack, commands, milestones, tasks with dependencies, document list | CEO → PM → Architect (+ Designer) → Project Manager; documents written to `$ARTIFACTS_DIR` |
| `company-task-execution` | task_brief, work_order, project_commands | verdict (`green`): stage, red_cause, summary, branch, head, pushed, changed_files | `include: archon-implement` → `archon-validate` → `archon-review-block` → push branch |
| `company-quality-gate` | acceptance_criteria, project_commands, staging_url | result (`green`): repairs[] | `archon-validate` + QA acceptance verification |
| `company-security-review` | – | review (`clean`): findings[severity, title, file, fix] | OWASP/dependency/config/secret review, read-only |
| `company-staging-deploy` | compose_project, project_commands | verify (`healthy`): url, services | DevOps prepares Dockerfile/compose, `docker compose up --build`, health wait; runs in the live integration checkout (`worktree.enabled: false`) |
| `company-delivery` | delivery_context | verdict (`green`): branch, head | Technical writer docs + delivery report, committed and pushed |
| `company-new-project` | – (chat) | create (`created`): project_id, started, url | Guided intake chat: `@pm` interviews with selectable options (`loop_group` of an AI `ask` node + a `wait: attention` multi_select, `notes` carried between passes), writes the requirements, asks for confirmation, then `scripts/create-project.ts` calls `POST /api/company/projects` (`start` unless the user chose draft). Triggered by the router from a plain request such as "อยากสร้างระบบ ..."; questions are answered in the project's RUNS tab (Needs your input) or by typing in the chat |

Conventions: typed `output_format` on every producing node; deterministic scripts (`scripts/*.ts`, Bun) compose verdicts; agents judge. Retries and loops come from the included blocks (`archon-implement` loops up to 5 fresh-context iterations); cross-run retry limits are the company scheduler's. Run any of them by hand from the console or `archon workflow run company-security-review` in a project checkout.

Authoring reference: `archon/packages/docs-web/src/content/docs/guides/authoring-workflows.md`.
