# AI agents (roles)

Roles are logical agents instantiated on demand as workflow nodes; no process exists for an idle role. Each profile in `agents/roles.yaml` defines: `title`, `alias` (Archon alias), `engine` (preferred), `model` and `models` (model per engine), `responsibilities`, optional `instructions`, and the defaults `timeout_minutes`, `max_tokens`, `fallback`.

| Role | Alias | Used by | Default engine/model |
|---|---|---|---|
| CEO | `@ceo` | intake: feasibility, scope, assumptions, risks | claude / opus (Claude Code CLI) |
| Product Manager | `@pm` | intake: SRS, personas, stories, acceptance criteria | codex / gpt-5.6 |
| Project Manager | `@projectmanager` | intake: milestones, task graph, dependencies | codex / gpt-5.6 |
| Architect | `@architect` | intake: stack, boundaries, data model, API, commands | claude / opus |
| UI/UX Designer | `@designer` | intake when the SRS declares a UI | claude / sonnet |
| Tech Lead | `@techlead` | reserved for plan review (bundled `archon-plan-block` runs under `large`) | devin / swe-2-high |
| Developer (+ specialisations) | `@developer` | task execution (`archon-implement`) | devin, model by task size: small swe-2-high · medium deepseek-v4-1-flash-high · large gemini-4-argon-high |
| QA Engineer | `@qa` | quality gate acceptance verification; `archon-validate` under `medium` | devin / swe-2-high |
| Security Engineer | `@security` | security review | codex / gpt-5.6 |
| DevOps Engineer | `@devops` | staging deployment preparation | devin / swe-2-high |
| Code Reviewer | `@reviewer` | the `@reviewer` alias; the bundled `archon-review-block` lenses run on the run engine's `medium`/`large` tiers | claude / opus |
| Technical Writer | `@writer` | delivery documentation | devin / swe-2-medium |

Within one run each role alias binds its own engine when that engine is selectable (credential usable, or explicitly chosen and unverifiable like Claude Code's login); otherwise it falls back to the run's engine. Task roles such as `developer-backend` resolve to the `developer` profile. Specialisation text travels in the task brief. Each task also carries a size (from the planner's estimate) that selects the Devin implementation model: small → SWE-2 High, medium → DeepSeek V4.1 Flash, large → Gemini 4 Argon (`tiers.devin` in `agents/roles.yaml`).

Prompts live beside each workflow (`workflows/company/<workflow>/commands/*.md`). Repository content and client requirements are quoted as untrusted input in every prompt. Agents never certify their own work: implementation is followed by an independent `archon-validate` run and a reviewer round; the project's own checks and exit codes decide.

The console's **AI Company** page shows every role with its live status, current execution, selected engine and history, all read from `company_executions`.
