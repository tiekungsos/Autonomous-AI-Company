# Testing

`scripts/test` runs, in order:
1. **Company layer unit tests** (`archon/packages/server/src/company/*.test.ts`, Bun): the scheduler lifecycle with Archon dispatch, run reads, git integration and engine checks replaced by in-memory fakes on a scratch SQLite database: creation → intake → dependency-ordered dispatch → retry with context → integration → QA failure → repair task → security → staging → acceptance → delivery → COMPLETED; retry limit ⇒ BLOCKED and resume; budget exhaustion ⇒ paused; idempotent dispatch.
2. **Devin plugin tests** (`plugins/provider-devin/test`): descriptor, model-list parsing, structured-output parsing, binary resolution. `DEVIN_E2E=1 bun test` additionally drives the installed executable over the real provider wire (one Devin turn).
3. **API end-to-end tests** (`tests/api.e2e.test.ts`) against the running server: health, bundled and company workflows discovered without errors, Devin registered, OpenAPI coverage, company overview/engines/roles/limits, validation errors, draft project lifecycle (create, patch, cancel, refusal after cancel), 404s, analytics labelling.

Evidence from real runs (no mocks) is recorded in `docs/delivery-report.md`: bundled `archon-validate` green on Devin, the company intake and task executions of the first project, and the generated repository's own test results.

**Authentication check** (`scripts/verify-auth`): starts PostgreSQL (docker compose) and a second Archon instance in `data/archon-home-auth` on port 3091 with Better Auth and an email allowlist, then proves with real requests that `/api/company/*` answers 401 unauthenticated, 403 for a non-allowlisted sign-up, 401 for a wrong password, and 200 after sign-in. Test credentials are generated into `data/auth-test/credentials.env` (git-ignored).

Archon's own suites: `cd archon && bun run test` (repository tests) and `bun run validate` (full CI list) remain available; `archon validate workflows` validates every workflow including the company pack.
