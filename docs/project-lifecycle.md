# Project lifecycle

`PROJECT_CREATED → REQUIREMENTS_ANALYSIS → SRS_GENERATION → ARCHITECTURE_DESIGN → DEVELOPMENT_PLANNING → TASK_BREAKDOWN → AUTONOMOUS_DEVELOPMENT → INTEGRATION → AUTOMATED_QA → SECURITY_REVIEW → STAGING_DEPLOYMENT → ACCEPTANCE_VERIFICATION → DELIVERY → COMPLETED`, plus `BLOCKED` and `CANCELLED`.

| Phase | Driven by | Exit |
|---|---|---|
| PROJECT_CREATED | scheduler: repository + bare origin (or clone of `repository_url`), Archon codebase registration | intake dispatched |
| REQUIREMENTS_ANALYSIS … TASK_BREAKDOWN | the intake run's current node (ceo, pm, architect/designer, planner, compose) | run terminal: documents, milestones, tasks persisted; `feasible: false` ⇒ BLOCKED |
| AUTONOMOUS_DEVELOPMENT | dependency-aware dispatch of `company-task-execution`; green ⇒ merge into the integration branch; red ⇒ retry with context (≤ MAX_TASK_RETRIES) ⇒ BLOCKED | no open tasks: any BLOCKED ⇒ project BLOCKED, else INTEGRATION |
| INTEGRATION | fast-forward the integration checkout to origin | AUTOMATED_QA |
| AUTOMATED_QA | `company-quality-gate` | green ⇒ SECURITY_REVIEW; else repair tasks ⇒ AUTONOMOUS_DEVELOPMENT (≤ MAX_REPAIR_ITERATIONS) |
| SECURITY_REVIEW | `company-security-review` | no critical/high ⇒ STAGING_DEPLOYMENT; else repair tasks |
| STAGING_DEPLOYMENT | `company-staging-deploy` (skipped with a record when the architecture declared no Docker) | healthy ⇒ ACCEPTANCE_VERIFICATION; else DevOps repair task |
| ACCEPTANCE_VERIFICATION | `company-quality-gate` with `staging_url` | green ⇒ DELIVERY |
| DELIVERY | `company-delivery`, merge, delivery report stored | COMPLETED |

Task statuses: `BACKLOG, READY, QUEUED, RUNNING, REVIEW, TESTING, COMPLETED, FAILED, BLOCKED, CANCELLED`. Operator actions: **Start** (draft → active), **Pause** (no new dispatch; running work continues), **Resume** (resets blocked tasks and attempts, starts a new round), **Cancel** (cancels running Archon runs, cancels open tasks). Budget exhaustion pauses the project with the reason; raise the budget and resume.

Every transition writes a `company_events` row shown on the project page; every dispatched run is linked to Archon's run page (step, logs, artifacts, provider events, cancel/resume).
