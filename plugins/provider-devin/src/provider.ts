import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { isAbsolute, join, sep } from 'node:path';
import {
  buildProviderSubprocessEnv,
  type CredentialStatus,
  type IAgentProvider,
  type MessageChunk,
  type ProviderCapabilities,
  type ProviderDiagnostics,
  type ProviderModelList,
  type ResultChunk,
  type SendQueryOptions,
} from '@archon/provider-contract';
import type { ProviderLogSink } from '@archon/provider-contract/plugin';
import { descriptor, devinConfigSchema, type DevinConfig } from './descriptor.ts';
import { augmentPromptForJsonSchema, tryParseStructuredOutput } from './structured.ts';
import { DevinLiveWatcher } from './live.ts';

/** Shape of the ATIF transcript `devin --export` writes after a print-mode turn. */
interface DevinExport {
  session_id?: string;
  agent?: { model_name?: string };
  final_metrics?: {
    total_prompt_tokens?: number;
    total_completion_tokens?: number;
    total_cached_tokens?: number;
    total_steps?: number;
  };
}

const EVIDENCE_MAX = 2000;

/**
 * Environment keys Archon sets to absolute directories a node is expected to write
 * (run artifacts, cross-run state, an adopted run's estate). The sandbox only allows
 * writes inside the workspace plus granted `Write(...)` scopes, so every turn grants
 * these explicitly; print mode cannot ask for confirmation.
 */
export const WRITABLE_DIR_ENV_KEYS = ['ARTIFACTS_DIR', 'STATE_DIR', 'ADOPTED_RUN_DIR', 'ARCHON_RUN_LOG_DIR'] as const;

/** Absolute git common dir for a checkout (the shared `.git` of a worktree), or undefined. */
export function gitCommonDir(cwd: string): string | undefined {
  try {
    const out = Bun.spawnSync(['git', '-C', cwd, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { stdout: 'pipe', stderr: 'ignore' });
    const dir = out.exitCode === 0 ? out.stdout.toString().trim() : '';
    return dir && isAbsolute(dir) ? dir : undefined;
  } catch {
    return undefined;
  }
}

/** The run id Archon stamps on an AI node's subprocess environment. */
export function runIdFromEnv(env: Record<string, string | undefined>): string | undefined {
  try {
    const execution = env.ARCHON_NODE_EXECUTION ? (JSON.parse(env.ARCHON_NODE_EXECUTION) as { runId?: string }) : undefined;
    if (execution?.runId) return execution.runId;
  } catch {
    /* not JSON */
  }
  return env.WORKFLOW_ID || undefined;
}

/**
 * Directories a workflow node may write outside its worktree. Exec nodes receive them as
 * `ARTIFACTS_DIR`/`STATE_DIR`; AI nodes receive only the run identity, so they are
 * derived from Archon's workspace layout: a worktree lives at
 * `<project root>/worktrees/...`, the run's artifacts at `<project root>/artifacts/runs/<runId>`
 * and cross-run state at `<project root>/state`. When the cwd is not a worktree, a glob
 * under `$ARCHON_HOME/workspaces` for this run id is granted instead.
 */
export function writableScopes(env: Record<string, string | undefined>, cwd?: string): string[] {
  const dirs = new Set(
    WRITABLE_DIR_ENV_KEYS.map(key => env[key]).filter((dir): dir is string => Boolean(dir) && isAbsolute(dir as string))
  );
  // An explicit `permissions.allow` list switches the write/edit tools from "workspace edits
  // auto-approved" to "allow-listed only" in autonomous mode, so the workspace itself must be
  // granted too (observed: workspace writes rejected once the per-turn config existed).
  if (cwd && isAbsolute(cwd)) {
    dirs.add(cwd);
    // A git worktree keeps its objects, refs and index in the main repository's git dir,
    // outside the worktree; without this grant every `git commit` fails in the sandbox.
    const common = gitCommonDir(cwd);
    if (common) dirs.add(common);
  }
  const runId = runIdFromEnv(env);
  if (runId && /^[A-Za-z0-9._-]+$/.test(runId)) {
    const marker = `${sep}worktrees${sep}`;
    const index = cwd ? cwd.indexOf(marker) : -1;
    if (cwd && index > 0) {
      const root = cwd.slice(0, index);
      dirs.add(join(root, 'artifacts', 'runs', runId));
      dirs.add(join(root, 'state'));
    } else {
      const home = (env.ARCHON_HOME ?? process.env.ARCHON_HOME ?? join(homedir(), '.archon')).replace(/^~(?=$|\/)/, homedir());
      dirs.add(join(home, 'workspaces', '**', 'artifacts', 'runs', runId));
    }
  }
  return [...dirs].flatMap(dir => [`Write(${dir})`, `Write(${dir}/**)`]);
}

/**
 * The per-turn config handed to `devin --config`: the user's own config (so native
 * settings, MCP and rules stay in force) with the run's writable scopes appended to
 * `permissions.allow`. Returns null when there is nothing to grant.
 */
/** Commands that run outside the sandbox when Docker access is enabled (Devin's `sandbox.excluded`). */
export const DOCKER_EXEC_RULES = ['Exec(docker)'] as const;

export async function buildTurnConfig(
  env: Record<string, string | undefined>,
  cwd?: string,
  options: { allowDocker?: boolean } = {}
): Promise<Record<string, unknown> | null> {
  // Docker's CLI (compose in particular) writes its context and run state under ~/.docker;
  // without the grant `docker compose up` asks for access, which print mode must refuse.
  const dockerHome = join(env.HOME ?? homedir(), '.docker');
  const scopes = [...writableScopes(env, cwd), ...(options.allowDocker ? [`Write(${dockerHome})`, `Write(${dockerHome}/**)`] : [])];
  const execRules = options.allowDocker ? [...DOCKER_EXEC_RULES] : [];
  if (scopes.length === 0 && execRules.length === 0) return null;
  const userConfigPath = env.DEVIN_CONFIG_PATH ?? join(homedir(), '.config', 'devin', 'config.json');
  let base: Record<string, unknown> = {};
  try {
    base = JSON.parse(await readFile(userConfigPath, 'utf8')) as Record<string, unknown>;
  } catch {
    base = {};
  }
  const permissions = (typeof base.permissions === 'object' && base.permissions !== null ? base.permissions : {}) as Record<string, unknown>;
  const allow = Array.isArray(permissions.allow) ? (permissions.allow as unknown[]).map(String) : [];
  const merged: Record<string, unknown> = { ...base, permissions: { ...permissions, allow: [...new Set([...allow, ...scopes, ...execRules])] } };
  if (execRules.length > 0) {
    const sandbox = (typeof base.sandbox === 'object' && base.sandbox !== null ? base.sandbox : {}) as Record<string, unknown>;
    const excluded = (typeof sandbox.excluded === 'object' && sandbox.excluded !== null ? sandbox.excluded : {}) as Record<string, unknown>;
    const list = (key: string): string[] => (Array.isArray(excluded[key]) ? (excluded[key] as unknown[]).map(String) : []);
    merged.sandbox = { ...sandbox, excluded: { allow: [...new Set([...list('allow'), ...execRules])], ask: list('ask'), deny: list('deny') } };
  }
  return merged;
}

export function resolveDevinBinary(env: Record<string, string | undefined>, config?: DevinConfig): string | undefined {
  const candidates = [
    config?.binPath,
    env.DEVIN_BIN_PATH,
    ...(env.PATH ?? '').split(':').map(dir => join(dir, 'devin')),
    join(homedir(), '.local', 'bin', 'devin'),
  ];
  return candidates.find(candidate => candidate !== undefined && candidate !== '' && existsSync(candidate));
}

function readConfig(raw: unknown): DevinConfig {
  if (typeof raw !== 'object' || raw === null) return {};
  const picked: Record<string, unknown> = {};
  for (const key of ['model', 'sandbox', 'binPath', 'timeoutMs', 'allowDocker']) {
    const value = (raw as Record<string, unknown>)[key];
    if (value !== undefined) picked[key] = value;
  }
  const parsed = devinConfigSchema.safeParse(picked);
  return parsed.success ? parsed.data : {};
}

function tail(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > EVIDENCE_MAX ? trimmed.slice(-EVIDENCE_MAX) : trimmed;
}

type CommandResult = { exitCode: number; stdout: string; stderr: string; killed: 'abort' | 'timeout' | null };

async function runCommand(
  argv: string[],
  options: { cwd?: string; env?: Record<string, string | undefined>; signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<CommandResult> {
  const proc = Bun.spawn(argv, {
    cwd: options.cwd,
    env: options.env as Record<string, string> | undefined,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  let killed: 'abort' | 'timeout' | null = null;
  const kill = (reason: 'abort' | 'timeout'): void => {
    if (killed) return;
    killed = reason;
    proc.kill('SIGTERM');
    setTimeout(() => {
      if (proc.exitCode === null) proc.kill('SIGKILL');
    }, 5000).unref();
  };
  const onAbort = (): void => kill('abort');
  options.signal?.addEventListener('abort', onAbort, { once: true });
  const timer = options.timeoutMs ? setTimeout(() => kill('timeout'), options.timeoutMs) : undefined;
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { exitCode, stdout, stderr, killed };
  } finally {
    if (timer) clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
  }
}

/** `devin models list` prints `  <id>   <label>  [...]` rows under family headings. */
export function parseModelList(text: string): ProviderModelList {
  const models: ProviderModelList['models'] = [];
  for (const line of text.split('\n')) {
    const match = /^ {2}([a-z0-9][a-z0-9.-]*) {2,}(.+?)(?: {2}\[.*)?$/.exec(line);
    if (match) models.push({ id: match[1], label: match[2].trim() });
  }
  return { models };
}

export class DevinProvider implements IAgentProvider {
  constructor(private readonly log?: ProviderLogSink) {}

  getType(): string {
    return descriptor.id;
  }

  getCapabilities(): ProviderCapabilities {
    return descriptor.capabilities;
  }

  async checkCredential(request: {
    assistantConfig?: SendQueryOptions['assistantConfig'];
    env: Record<string, string>;
    signal: AbortSignal;
  }): Promise<CredentialStatus> {
    const bin = resolveDevinBinary({ ...process.env, ...request.env }, readConfig(request.assistantConfig));
    if (!bin) return { state: 'check_failed', source: 'native', evidence: 'devin CLI not found on PATH' };
    const result = await runCommand([bin, 'auth', 'status'], {
      env: { ...process.env, ...request.env },
      signal: request.signal,
      timeoutMs: 30_000,
    });
    if (result.exitCode === 0) return { state: 'usable', source: 'native' };
    return { state: 'not_connected', source: 'native' };
  }

  async diagnose(request: {
    signal: AbortSignal;
    assistantConfig?: SendQueryOptions['assistantConfig'];
  }): Promise<ProviderDiagnostics> {
    const bin = resolveDevinBinary(process.env, readConfig(request.assistantConfig));
    if (!bin) {
      return {
        checks: [
          { id: 'binary', label: 'Devin CLI', status: 'fail', message: 'devin not found', remedy: 'Install from https://devin.ai/cli' },
        ],
      };
    }
    const version = await runCommand([bin, '--version'], { signal: request.signal, timeoutMs: 15_000 });
    const auth = await runCommand([bin, 'auth', 'status'], { signal: request.signal, timeoutMs: 30_000 });
    return {
      checks: [
        { id: 'binary', label: 'Devin CLI', status: 'ok', message: `${version.stdout.trim() || 'found'} at ${bin}` },
        {
          id: 'auth',
          label: 'Authentication',
          status: auth.exitCode === 0 ? 'ok' : 'fail',
          message: auth.exitCode === 0 ? 'logged in' : 'not logged in',
          remedy: 'Run: devin auth login',
        },
      ],
    };
  }

  async listModels(request: { signal: AbortSignal }): Promise<ProviderModelList> {
    const bin = resolveDevinBinary(process.env);
    if (!bin) return { models: [] };
    const result = await runCommand([bin, 'models', 'list'], { signal: request.signal, timeoutMs: 60_000 });
    return result.exitCode === 0 ? parseModelList(result.stdout) : { models: [] };
  }

  async *sendQuery(
    prompt: string,
    cwd: string,
    resumeSessionId?: string,
    options?: SendQueryOptions
  ): AsyncGenerator<MessageChunk> {
    const config = readConfig(options?.assistantConfig);
    const env = buildProviderSubprocessEnv(options) as Record<string, string | undefined>;
    const bin = resolveDevinBinary(env, config);
    if (!bin) {
      yield failure('misconfigured', 'devin CLI not found on PATH; install from https://devin.ai/cli');
      yield { type: 'settled' };
      return;
    }
    const model = options?.model ?? config.model;
    // Operator opt-in to Devin's bypass mode (`--permission-mode dangerous`, no OS sandbox):
    // ARCHON_DEVIN_PERMISSION_MODE=bypass in the server environment. Read from the plugin's own
    // environment rather than the run's config so it also reaches adopted runs, which inherit
    // their original AI configuration.
    const bypass = (process.env.ARCHON_DEVIN_PERMISSION_MODE ?? '').toLowerCase() === 'bypass';
    const sandbox = bypass ? false : (config.sandbox ?? true);
    const workDir = await mkdtemp(join(tmpdir(), 'archon-devin-'));
    const promptPath = join(workDir, 'prompt.md');
    const exportPath = join(workDir, 'export.json');
    const effectivePrompt = options?.outputFormat
      ? augmentPromptForJsonSchema(prompt, options.outputFormat.schema)
      : prompt;
    await writeFile(promptPath, effectivePrompt);
    const argv = [bin, '-p', '--prompt-file', promptPath, '--respect-workspace-trust', 'false', '--export', exportPath];
    const turnConfig = await buildTurnConfig(env, cwd, { allowDocker: config.allowDocker === true });
    const grantedScopes = writableScopes(env, cwd);
    if (turnConfig) {
      const configPath = join(workDir, 'config.json');
      await writeFile(configPath, JSON.stringify(turnConfig));
      argv.push('--config', configPath);
    }
    argv.push(...(sandbox ? ['--sandbox'] : ['--permission-mode', 'dangerous']));
    if (model) argv.push('--model', model);
    if (resumeSessionId) argv.push('-r', resumeSessionId);
    await this.log?.({ level: 'info', msg: 'devin.turn_start', bindings: { sandbox, bypass, resume: Boolean(resumeSessionId) } });
    yield { type: 'state_update', state: 'running' };
    let run: CommandResult;
    // Stream Devin's tool calls (commands, file reads and writes) while the turn runs.
    const watcher = new DevinLiveWatcher(cwd, Math.floor(Date.now() / 1000), effectivePrompt.slice(0, 200));
    try {
      const pending = runCommand(argv, { cwd, env, signal: options?.abortSignal, timeoutMs: config.timeoutMs });
      let settled: CommandResult | undefined;
      void pending.then(result => {
        settled = result;
      }, () => undefined);
      while (settled === undefined) {
        await Promise.race([pending.catch(() => undefined), Bun.sleep(1000)]);
        for (const chunk of watcher.poll()) yield chunk;
      }
      run = await pending;
    } catch (error) {
      for (const chunk of watcher.finish()) yield chunk;
      await rm(workDir, { recursive: true, force: true });
      yield failure('transient', `failed to spawn devin: ${(error as Error).message}`);
      yield { type: 'settled' };
      return;
    }
    for (const chunk of watcher.finish()) yield chunk;
    if (run.killed === 'abort') {
      await rm(workDir, { recursive: true, force: true });
      return;
    }
    let exported: DevinExport | undefined;
    try {
      exported = JSON.parse(await readFile(exportPath, 'utf8')) as DevinExport;
    } catch {
      exported = undefined;
    }
    await rm(workDir, { recursive: true, force: true });
    if (run.killed === 'timeout') {
      yield failure('transient', `devin exceeded timeoutMs=${String(config.timeoutMs)}`);
      yield { type: 'settled' };
      return;
    }
    if (run.exitCode !== 0) {
      const evidence = tail(run.stderr) || tail(run.stdout) || `devin exited with code ${String(run.exitCode)}`;
      yield failure('unknown', evidence);
      yield { type: 'settled' };
      return;
    }
    const text = run.stdout.trim();
    if (text.length > 0) yield { type: 'agent_message_chunk', text };
    else {
      yield {
        type: 'warning',
        code: 'devin.empty_reply',
        message: `devin exited 0 without a final message${run.stderr.trim() ? `; stderr: ${tail(run.stderr).slice(-300)}` : ''}; sandbox=${String(sandbox)}; granted write scopes: ${grantedScopes.length > 0 ? grantedScopes.join(', ') : 'none (no ARTIFACTS_DIR/STATE_DIR in the request env)'}`,
      };
    }
    if (!exported?.session_id) {
      yield { type: 'warning', code: 'devin.export_missing', message: 'devin wrote no transcript export; session id and token usage are unknown' };
    }
    const result: ResultChunk = { type: 'result', text, stopReason: 'end_turn' };
    if (exported?.session_id) result.sessionId = exported.session_id;
    if (resumeSessionId) result.resumed = exported?.session_id === resumeSessionId;
    const metrics = exported?.final_metrics;
    if (metrics && typeof metrics.total_prompt_tokens === 'number' && typeof metrics.total_completion_tokens === 'number') {
      result.tokens = {
        input: metrics.total_prompt_tokens,
        output: metrics.total_completion_tokens,
        ...(typeof metrics.total_cached_tokens === 'number' ? { cacheRead: metrics.total_cached_tokens } : {}),
        total: metrics.total_prompt_tokens + metrics.total_completion_tokens,
      };
      if (typeof metrics.total_steps === 'number') result.numTurns = metrics.total_steps;
    } else {
      result.tokensUnknown = true;
    }
    if (exported?.agent?.model_name) result.resolvedModel = { id: exported.agent.model_name };
    if (options?.outputFormat) {
      let structured = tryParseStructuredOutput(text);
      if (!structured && exported?.session_id && !options.abortSignal?.aborted) {
        // The agent ended its turn with prose (often after a blocked action). One cheap
        // follow-up on the same session asks for the JSON alone instead of a full re-ask.
        const followUp = await this.askForJson(bin, exported.session_id, options.outputFormat.schema, { cwd, env, sandbox, model, config });
        if (followUp) {
          structured = followUp.structured;
          if (followUp.text) yield { type: 'agent_message_chunk', text: followUp.text };
          if (result.tokens && followUp.tokens) {
            result.tokens = {
              input: result.tokens.input + followUp.tokens.input,
              output: result.tokens.output + followUp.tokens.output,
              ...(result.tokens.cacheRead !== undefined || followUp.tokens.cacheRead !== undefined ? { cacheRead: (result.tokens.cacheRead ?? 0) + (followUp.tokens.cacheRead ?? 0) } : {}),
              total: (result.tokens.total ?? 0) + (followUp.tokens.total ?? 0),
            };
          }
        }
      }
      if (structured) result.structuredOutput = structured;
    }
    yield result;
    yield { type: 'settled' };
  }

  private async askForJson(
    bin: string,
    sessionId: string,
    schema: Record<string, unknown>,
    turn: { cwd: string; env: Record<string, string | undefined>; sandbox: boolean; model?: string; config: DevinConfig }
  ): Promise<{ structured: Record<string, unknown> | undefined; text: string; tokens?: { input: number; output: number; cacheRead?: number; total?: number } } | null> {
    const workDir = await mkdtemp(join(tmpdir(), 'archon-devin-json-'));
    try {
      const promptPath = join(workDir, 'prompt.md');
      const exportPath = join(workDir, 'export.json');
      await writeFile(
        promptPath,
        augmentPromptForJsonSchema(
          'Your previous message was not the required JSON. Do not ask for permissions or access. If your instructions required you to write a file (a report, an artifact) that you have not written yet, write it now; never name a file in the JSON that does not exist. If something was blocked, say so inside the JSON fields. Then answer with the JSON object only.',
          schema
        )
      );
      const argv = [bin, '-p', '--prompt-file', promptPath, '--respect-workspace-trust', 'false', '--export', exportPath, '-r', sessionId];
      argv.push(...(turn.sandbox ? ['--sandbox'] : ['--permission-mode', 'dangerous']));
      if (turn.model) argv.push('--model', turn.model);
      const turnConfig = await buildTurnConfig(turn.env, turn.cwd, { allowDocker: turn.config.allowDocker === true });
      if (turnConfig) {
        const configPath = join(workDir, 'config.json');
        await writeFile(configPath, JSON.stringify(turnConfig));
        argv.push('--config', configPath);
      }
      await this.log?.({ level: 'info', msg: 'devin.json_follow_up', bindings: {} });
      const run = await runCommand(argv, { cwd: turn.cwd, env: turn.env, timeoutMs: turn.config.timeoutMs ?? 600_000 });
      if (run.exitCode !== 0 || run.killed) return null;
      let exported: DevinExport | undefined;
      try {
        exported = JSON.parse(await readFile(exportPath, 'utf8')) as DevinExport;
      } catch {
        exported = undefined;
      }
      const metrics = exported?.final_metrics;
      const tokens =
        metrics && typeof metrics.total_prompt_tokens === 'number' && typeof metrics.total_completion_tokens === 'number'
          ? { input: metrics.total_prompt_tokens, output: metrics.total_completion_tokens, ...(typeof metrics.total_cached_tokens === 'number' ? { cacheRead: metrics.total_cached_tokens } : {}), total: metrics.total_prompt_tokens + metrics.total_completion_tokens }
          : undefined;
      const text = run.stdout.trim();
      return { structured: tryParseStructuredOutput(text), text, tokens };
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }
}

function failure(cls: 'misconfigured' | 'transient' | 'unknown', evidence: string): ResultChunk {
  return { type: 'result', isError: true, failure: { class: cls, evidence }, errors: [evidence] };
}
