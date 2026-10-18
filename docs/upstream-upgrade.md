# Upstream compatibility and upgrade

- Upstream: https://github.com/coleam00/Archon, base tag `v0.12.1`, commit `5f2b4841aaca38180c0abbd32bc6345593292019`, working branch `company` in `archon/` (branched from the tag; `dev` is upstream's working base).
- Modified upstream files (all additive, no behaviour change for existing features):
  - `packages/server/src/index.ts` — import and one call `startCompanyLayer(app, { webAdapter, lockManager })` before webhook registration.
  - `packages/server/src/scripts/generate-api-types.ts` — register company routes so the console's generated API types include them.
  - `packages/web/src/experiments/console/ConsoleApp.tsx` — one `<Route path="company/*">`.
  - `packages/web/src/experiments/console/components/ProjectRail.tsx` — one navigation link.
  - `packages/web/src/lib/api.generated.d.ts` — regenerated artifact (owned by the generator script).
- Added (new paths only): `packages/server/src/company/`, `packages/web/src/experiments/console/routes/company/`, `packages/web/src/experiments/console/skills/company.ts`. The workflow pack lives outside the tree (`workflows/company`, home-scoped).
- Added packages outside the tree: `plugins/provider-devin` (depends on `@archon/provider-contract` by `file:` path).
- Interfaces used, not modified: `IAgentProvider` + plugin wire (protocol 2), `handleMessage` context, `OpenAPIHono` route registration, `IDatabase.query`, workflow `include:`/`inputs:`/`returns:`.

## Upgrade procedure
1. `scripts/export-patches` → `patches/0001-autonomous-ai-company.patch` (current local changes vs the base tag).
2. `cd archon && git fetch origin --tags && git checkout -b company-<newtag> <newtag>`.
3. `git apply --3way ../patches/0001-autonomous-ai-company.patch`; resolve conflicts (expected only in the four files above).
4. Re-check the seams the layer depends on: `handleMessage`'s `HandleMessageContext` fields, `registerRepository`, `createSqlWorkflowOperations().cancelWorkflow`, `getTerminalRecord`/`buildRunNodeStates`, `IDatabase`, the provider plugin protocol version (`PROVIDER_PLUGIN_PROTOCOL`; bump the plugin descriptor if it changed), and the SDLC pack's `inputs`/`returns` names used by `company-task-execution`.
5. Match Bun: `scripts/setup` reinstalls the pinned version from `engines.bun`.
6. `bun install`, `bun run --cwd packages/server generate:api-types`, `bun run build:web`, `bun run cli validate workflows`, `scripts/test`.
7. Update `docs/archon-capability-audit.md` and this file with the new base.
