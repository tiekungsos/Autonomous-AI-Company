/**
 * Spawns the installed plugin executable and drives one real Devin turn over the
 * Archon provider wire. Costs a Devin session; runs only with DEVIN_E2E=1.
 */
import { describe, expect, test } from 'bun:test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { connectProvider } from '@archon/provider-contract/plugin';

const archonHome = process.env.ARCHON_HOME ?? join(homedir(), '.archon');
const executable = join(archonHome, 'plugins', 'archon-provider-devin');
const enabled = process.env.DEVIN_E2E === '1' && existsSync(executable);

describe.skipIf(!enabled)('devin plugin over stdio', () => {
  test('initialises, answers a prompt, reports usage and settles once', async () => {
    const child = spawn(executable, [], { stdio: ['pipe', 'pipe', 'inherit'] });
    const closed = new Promise(resolve => child.once('close', resolve));
    const client = await connectProvider({ readable: Readable.toWeb(child.stdout) as never, writable: Writable.toWeb(child.stdin) as never });
    try {
      expect(client.getCapabilities().structuredOutput).toBe('best-effort');
      const chunks: { type: string }[] = [];
      for await (const chunk of client.sendQuery('Reply with exactly: PONG', process.cwd())) chunks.push(chunk);
      const result = chunks.find(c => c.type === 'result') as { text?: string; sessionId?: string; tokens?: { input: number } } | undefined;
      expect(result?.text).toContain('PONG');
      expect(result?.sessionId).toBeTruthy();
      expect(result?.tokens?.input).toBeGreaterThan(0);
      expect(chunks.filter(c => c.type === 'settled')).toHaveLength(1);
      expect(chunks[chunks.length - 1]?.type).toBe('settled');
    } finally {
      await client.close();
      await closed;
    }
  }, 300_000);
});
