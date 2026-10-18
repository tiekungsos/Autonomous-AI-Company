import { describe, expect, test } from 'bun:test';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { descriptor } from '../src/descriptor.ts';
import { parseModelList, resolveDevinBinary } from '../src/provider.ts';
import { augmentPromptForJsonSchema, tryParseStructuredOutput } from '../src/structured.ts';

describe('descriptor', () => {
  test('is a protocol-2 provider named devin with best-effort structured output', () => {
    expect(descriptor.id).toBe('devin');
    expect(descriptor.capabilities.structuredOutput).toBe('best-effort');
    expect(descriptor.capabilities.sessionResume).toBe(true);
  });
});

describe('parseModelList', () => {
  test('reads ids and labels from the devin models list layout', () => {
    const text = `Available models (2 families)

SWE-2 (swe-2)
  aliases: swe
  swe-2-high                                                                SWE-2 High  [262K context, Free]
  swe-2-medium-lightning                                                    SWE-2 Medium Lightning  [262144 context, $1 / 1M Input]

Claude Opus 5.5 (claude-opus-5.5)
  claude-opus-5-5-high                                                      Claude Opus 5.5 High  [1M context, $4 / 1M Input]
`;
    expect(parseModelList(text).models).toEqual([
      { id: 'swe-2-high', label: 'SWE-2 High' },
      { id: 'swe-2-medium-lightning', label: 'SWE-2 Medium Lightning' },
      { id: 'claude-opus-5-5-high', label: 'Claude Opus 5.5 High' },
    ]);
  });
});

describe('structured output', () => {
  test('augmented prompt carries the schema', () => {
    const prompt = augmentPromptForJsonSchema('do it', { type: 'object' });
    expect(prompt.startsWith('do it')).toBe(true);
    expect(prompt).toContain('"type": "object"');
  });
  test('parses clean, fenced, and prose-prefixed JSON objects; rejects arrays and prose', () => {
    expect(tryParseStructuredOutput('{"a":1}')).toEqual({ a: 1 });
    expect(tryParseStructuredOutput('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(tryParseStructuredOutput('Here you go:\n{"a":{"b":2}}')).toEqual({ a: { b: 2 } });
    expect(tryParseStructuredOutput('[1,2]')).toBeUndefined();
    expect(tryParseStructuredOutput('no json here')).toBeUndefined();
  });
});

describe('resolveDevinBinary', () => {
  test('prefers config, then DEVIN_BIN_PATH, then PATH', () => {
    const dir = mkdtempSync(join(tmpdir(), 'devin-bin-'));
    const fake = join(dir, 'devin');
    writeFileSync(fake, '#!/bin/sh\necho fake\n');
    chmodSync(fake, 0o755);
    expect(resolveDevinBinary({ PATH: dir })).toBe(fake);
    expect(resolveDevinBinary({ PATH: '/nonexistent', DEVIN_BIN_PATH: fake })).toBe(fake);
    expect(resolveDevinBinary({ PATH: '/nonexistent' }, { binPath: fake })).toBe(fake);
  });
});

describe('sandbox write scopes', () => {
  test('grants the absolute directories Archon injects, both as directory and recursive glob', async () => {
    const { writableScopes, buildTurnConfig } = await import('../src/provider.ts');
    expect(writableScopes({ ARTIFACTS_DIR: '/tmp/a', STATE_DIR: 'relative/state' })).toEqual(['Write(/tmp/a)', 'Write(/tmp/a/**)']);
    expect(writableScopes({})).toEqual([]);
    // An AI node carries only the run identity: derive the run's artifact and state dirs from the worktree layout.
    const aiEnv = { ARCHON_NODE_EXECUTION: JSON.stringify({ runId: 'run-1', path: 'ceo', invocation: 1, attempt: 1 }) };
    expect(writableScopes(aiEnv, '/home/x/.archon/workspaces/_local/demo/worktrees/archon/thread-1')).toEqual([
      'Write(/home/x/.archon/workspaces/_local/demo/worktrees/archon/thread-1)',
      'Write(/home/x/.archon/workspaces/_local/demo/worktrees/archon/thread-1/**)',
      'Write(/home/x/.archon/workspaces/_local/demo/artifacts/runs/run-1)',
      'Write(/home/x/.archon/workspaces/_local/demo/artifacts/runs/run-1/**)',
      'Write(/home/x/.archon/workspaces/_local/demo/state)',
      'Write(/home/x/.archon/workspaces/_local/demo/state/**)',
    ]);
    expect(writableScopes({ ...aiEnv, ARCHON_HOME: '/srv/archon' }, '/elsewhere')).toEqual([
      'Write(/elsewhere)',
      'Write(/elsewhere/**)',
      'Write(/srv/archon/workspaces/**/artifacts/runs/run-1)',
      'Write(/srv/archon/workspaces/**/artifacts/runs/run-1/**)',
    ]);
    const dir = mkdtempSync(join(tmpdir(), 'devin-cfg-'));
    const userConfig = join(dir, 'config.json');
    writeFileSync(userConfig, JSON.stringify({ theme_mode: 'dark', permissions: { allow: ['Exec(git)'], deny: ['Exec(sudo)'] } }));
    const merged = await buildTurnConfig({ DEVIN_CONFIG_PATH: userConfig, ARTIFACTS_DIR: '/tmp/a' });
    expect(merged?.theme_mode).toBe('dark');
    expect((merged?.permissions as { allow: string[]; deny: string[] }).deny).toEqual(['Exec(sudo)']);
    expect((merged?.permissions as { allow: string[] }).allow).toEqual(['Exec(git)', 'Write(/tmp/a)', 'Write(/tmp/a/**)']);
    expect(await buildTurnConfig({ DEVIN_CONFIG_PATH: userConfig })).toBeNull();
    const docker = await buildTurnConfig({ DEVIN_CONFIG_PATH: userConfig }, undefined, { allowDocker: true });
    expect((docker?.permissions as { allow: string[] }).allow).toContain('Exec(docker)');
    expect((docker?.permissions as { allow: string[] }).allow.some(rule => rule.endsWith('/.docker/**)'))).toBe(true);
    expect(docker?.sandbox).toEqual({ excluded: { allow: ['Exec(docker)'], ask: [], deny: [] } });
  });
});
