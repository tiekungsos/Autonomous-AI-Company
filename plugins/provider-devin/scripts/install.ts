/**
 * Dev install: writes the plugin executable wrapper and its receipt into
 * $ARCHON_HOME/plugins so `registerHostProviders` discovers the Devin provider.
 * Mirrors what `archon plugin add` writes for a released plugin.
 */
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { descriptor } from '../src/descriptor.ts';

const PLUGIN_ID = 'local/autonomous-ai-company/plugins/provider-devin';
const pluginDir = resolve(import.meta.dir, '..');
const rawHome = process.env.ARCHON_HOME;
// Default to this workspace's Archon home, never the user's ~/.archon.
const archonHome = rawHome
  ? rawHome.replace(/^~(?=$|\/)/, homedir())
  : resolve(pluginDir, '..', '..', 'data', 'archon-home');
const pluginsDir = join(archonHome, 'plugins');
const bun = process.env.BUN ?? process.execPath;
const manifest = JSON.parse(readFileSync(join(pluginDir, 'archon-plugin.json'), 'utf8')) as {
  executable: string;
};

const wrapper = `#!/bin/sh\nexec "${bun}" --no-env-file "${join(pluginDir, 'src', 'main.ts')}" "$@"\n`;
mkdirSync(pluginsDir, { recursive: true });
const executablePath = join(pluginsDir, manifest.executable);
writeFileSync(executablePath, wrapper);
chmodSync(executablePath, 0o755);

let commit = '0'.repeat(40);
try {
  const out = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: pluginDir });
  const text = out.stdout.toString().trim();
  if (/^[0-9a-f]{40}$/.test(text)) commit = text;
} catch {
  /* not a git checkout: zero commit is accepted by the receipt schema */
}

const receipt = {
  schemaVersion: 1,
  id: PLUGIN_ID,
  manifest: { ...JSON.parse(readFileSync(join(pluginDir, 'archon-plugin.json'), 'utf8')) },
  tag: 'local',
  commit,
  installedAt: new Date().toISOString(),
  files: [
    { path: manifest.executable, sha256: createHash('sha256').update(wrapper).digest('hex') },
  ],
  descriptor,
};
const receiptPath = join(pluginsDir, 'installed', PLUGIN_ID, 'receipt.json');
mkdirSync(dirname(receiptPath), { recursive: true });
writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(`installed ${manifest.executable} -> ${executablePath}`);
console.log(`receipt   -> ${receiptPath}`);
console.log('restart the Archon server to load the provider');
