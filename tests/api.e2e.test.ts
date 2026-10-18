/**
 * End-to-end API checks against a running platform (scripts/start). They exercise
 * real routes and real persistence; nothing is mocked. Project creation uses a draft
 * (no AI spend) and verifies the lifecycle controls, then cancels and leaves no
 * running work behind.
 */
import { afterAll, describe, expect, test } from 'bun:test';

const API = process.env.ARCHON_API ?? 'http://127.0.0.1:3090/api';
const created: string[] = [];

async function call<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const response = await fetch(`${API}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  const text = await response.text();
  return { status: response.status, body: (text ? JSON.parse(text) : null) as T };
}

afterAll(async () => {
  for (const id of created) await call(`/company/projects/${id}/cancel`, { method: 'POST', body: '{}' });
});

describe('archon', () => {
  test('health reports ok and the server version', async () => {
    const { status, body } = await call<{ status: string; version: string }>('/health');
    expect(status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
  });
  test('bundled SDLC workflows and the company pack are discoverable', async () => {
    const { body } = await call<{ workflows: { workflow: { name: string } }[]; errors: unknown[] | null }>('/workflows');
    const names = body.workflows.map(w => w.workflow.name);
    for (const name of ['archon-plan', 'archon-implement', 'archon-review', 'archon-validate', 'archon-deliver', 'archon-ship']) expect(names).toContain(name);
    for (const name of ['company-project-intake', 'company-task-execution', 'company-quality-gate', 'company-security-review', 'company-staging-deploy', 'company-delivery']) expect(names).toContain(name);
    expect(body.errors ?? []).toHaveLength(0);
  });
  test('the devin provider is registered as a plugin', async () => {
    const { body } = await call<{ providers: { id: string }[] }>('/providers');
    expect(body.providers.map(p => p.id)).toContain('devin');
  });
  test('company routes are part of the OpenAPI document', async () => {
    const { body } = await call<{ paths: Record<string, unknown> }>('/openapi.json');
    expect(Object.keys(body.paths).filter(p => p.startsWith('/api/company/')).length).toBeGreaterThanOrEqual(15);
  });
});

describe('company', () => {
  test('overview, engines, roles and limits answer', async () => {
    const overview = await call<{ counts: Record<string, number>; health: { scheduler: string } }>('/company/overview');
    expect(overview.status).toBe(200);
    expect(typeof overview.body.counts.projects).toBe('number');
    const engines = await call<{ engines: { id: string; available: boolean; reason: string }[] }>('/company/engines');
    expect(engines.body.engines.some(e => e.id === 'devin')).toBe(true);
    const roles = await call<{ roles: { id: string; alias: string }[] }>('/company/roles');
    expect(roles.body.roles.map(r => r.id)).toEqual(expect.arrayContaining(['ceo', 'product_manager', 'project_manager', 'architect', 'developer', 'qa_engineer', 'security_engineer', 'devops_engineer', 'code_reviewer', 'technical_writer']));
    const limits = await call<Record<string, number>>('/company/limits');
    expect(limits.body.maxTaskRetries).toBeGreaterThan(0);
  });
  test('rejects an invalid project', async () => {
    const { status } = await call('/company/projects', { method: 'POST', body: JSON.stringify({ name: '', requirements: '' }) });
    expect(status).toBe(400);
  });
  test('creates a draft project, pauses, patches, and cancels it without dispatching work', async () => {
    const create = await call<{ id: string; phase: string; paused: number }>('/company/projects', {
      method: 'POST',
      body: JSON.stringify({ name: 'e2e draft', description: 'draft', requirements: 'Build nothing; this is a draft used by the API tests.', engine: 'auto', max_concurrency: 1, start: false }),
    });
    expect(create.status).toBe(201);
    created.push(create.body.id);
    expect(create.body.phase).toBe('PROJECT_CREATED');
    expect(create.body.paused).toBe(1);
    const detail = await call<{ project: { id: string }; tasks: unknown[]; executions: unknown[]; events: { kind: string }[] }>(`/company/projects/${create.body.id}`);
    expect(detail.body.executions).toHaveLength(0);
    expect(detail.body.events.map(e => e.kind)).toContain('project.created');
    const patched = await call<{ budget_usd: number; max_concurrency: number }>(`/company/projects/${create.body.id}`, { method: 'PATCH', body: JSON.stringify({ budget_usd: 5, max_concurrency: 2 }) });
    expect(patched.body.budget_usd).toBe(5);
    expect(patched.body.max_concurrency).toBe(2);
    const cancelled = await call<{ phase: string }>(`/company/projects/${create.body.id}/cancel`, { method: 'POST', body: '{}' });
    expect(cancelled.body.phase).toBe('CANCELLED');
    const again = await call<{ error: string }>(`/company/projects/${create.body.id}/start`, { method: 'POST', body: '{}' });
    expect(again.status).toBe(409);
    const tasks = await call<{ tasks: unknown[] }>(`/company/tasks?project=${create.body.id}`);
    expect(tasks.body.tasks).toHaveLength(0);
  });
  test('unknown ids are 404', async () => {
    expect((await call('/company/projects/does-not-exist')).status).toBe(404);
    expect((await call('/company/tasks/does-not-exist')).status).toBe(404);
  });
  test('analytics separates measured and estimated cost', async () => {
    const { body } = await call<{ note: string; byEngine: unknown[] }>('/company/analytics');
    expect(body.note).toContain('estimate');
  });
});
