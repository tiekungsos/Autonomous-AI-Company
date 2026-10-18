# Installation

Supported hosts: macOS (tested: macOS 26.3, Apple M1 Pro), Ubuntu/Debian, Windows through WSL2. Requirements: git, curl, Docker (for staging deployments), and the engines you want: Devin CLI (`https://devin.ai/cli`, then `devin auth login`), Claude Code (`claude login`), Codex, Pi.

```bash
git clone <this repository> ~/autonomous-ai-company
cd ~/autonomous-ai-company
# Archon upstream: cloned by hand once, pinned to v0.12.1 and carrying the `company` branch
git clone https://github.com/coleam00/Archon archon && (cd archon && git checkout -b company v0.12.1)
git -C archon apply ../patches/0001-autonomous-ai-company.patch   # only when archon/ was freshly cloned
scripts/setup
scripts/start
```

`scripts/setup` installs a **project-local Bun** at `.bun/bin/bun` with the exact version Archon pins (`engines.bun` in `archon/package.json`, 1.4.2); the host's own Bun is untouched. Archon's bundled workflows fail to parse on older Bun (`Bun.YAML` missing), which is why the pin matters. It then runs `bun install` in `archon/`, builds the console, writes `.env` and `$ARCHON_HOME/.env` from the examples, and installs the Devin provider plugin receipt (`plugins/provider-devin/scripts/install.ts`).

`ARCHON_HOME` defaults to `data/archon-home` (isolated from `~/.archon`). Everything runtime lives there: SQLite database, workspaces and worktrees, run artifacts and logs, the company's project repositories (`company/projects/<id>/`), and the plugin receipts.

Verify: `scripts/doctor`, then open http://127.0.0.1:3090/console/company.

Record of the install used for the delivery report: Archon `v0.12.1` (`5f2b4841aaca38180c0abbd32bc6345593292019`), Bun 1.4.2, Devin CLI 3000.11.92, Docker 29.8.2, Node 23.7 (not required), gh 2.90.
