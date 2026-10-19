/** Creates the project in the Company Layer from the interview's final typed result. */
type Json = Record<string, unknown>;

const parse = (raw: string | undefined): Json | null => {
  if (!raw || raw === 'null') return null;
  try {
    const value: unknown = JSON.parse(raw);
    return typeof value === 'object' && value !== null ? (value as Json) : null;
  } catch {
    return null;
  }
};
const fail = (summary: string): never => {
  console.log(JSON.stringify({ created: false, project_id: '', started: false, url: '', summary }));
  return process.exit(0);
};

const spec = parse(process.env.INPUTS_SPEC);
const project = (spec?.project ?? null) as Json | null;
if (!spec || spec.ready !== true || !project) fail('The interview did not finish, so no project was created.');
const p = project as Json;

const base = 'http://127.0.0.1:3090'; // loopback server that runs this workflow; Archon's default port
const start = p.start !== false;
const budget = Number(p.budget_usd);
const response = await fetch(`${base}/api/company/projects`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    name: String(p.name ?? '').slice(0, 120),
    description: String(p.description ?? '').slice(0, 5000),
    requirements: String(p.requirements ?? ''),
    tech_stack: String(p.tech_stack ?? '') || undefined,
    engine: 'auto',
    budget_usd: Number.isFinite(budget) && budget > 0 ? budget : undefined,
    max_concurrency: Math.min(10, Math.max(1, Math.trunc(Number(p.max_concurrency)) || 1)),
    start,
  }),
});
const body = (await response.json().catch(() => ({}))) as Json;
if (!response.ok || typeof body.id !== 'string') fail(`Company API refused the project (${String(response.status)}): ${String(body.error ?? 'no detail')}`);
const id = String(body.id);
const url = `${base}/console/company/projects/${id}`;
console.log(JSON.stringify({
  created: true,
  project_id: id,
  started: start,
  url,
  summary: `Project "${String(body.name)}" ${start ? 'created and started' : 'saved as a draft'}. Follow it at ${url}`,
}));
