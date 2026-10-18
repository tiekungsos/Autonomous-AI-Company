/** Build and start the stack under the project-scoped compose name, then wait for health. */
const project = process.env.INPUTS_COMPOSE_PROJECT ?? '';
const file = process.env.INPUTS_COMPOSE_FILE || 'docker-compose.yml';
const healthPath = process.env.INPUTS_HEALTH_URL || '/health';
if (!/^[a-z][a-z0-9_-]*$/.test(project)) throw new Error(`invalid compose project name: ${project}`);

function run(args: string[]): { code: number; out: string } {
  const result = Bun.spawnSync(['docker', 'compose', '-p', project, '-f', file, ...args], { stdout: 'pipe', stderr: 'pipe' });
  return { code: result.exitCode, out: `${result.stdout.toString()}${result.stderr.toString()}` };
}
const up = run(['up', '-d', '--build', '--remove-orphans']);
const started = up.code === 0;
let url = '';
let healthy = false;
let services: string[] = [];
if (started) {
  services = run(['ps', '--services']).out.split('\n').map(s => s.trim()).filter(Boolean);
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline && !healthy) {
    const ps = Bun.spawnSync(['docker', 'compose', '-p', project, '-f', file, 'ps', '--format', 'json'], { stdout: 'pipe', stderr: 'pipe' }).stdout.toString();
    const rows = ps.split('\n').filter(Boolean).flatMap(line => { try { const v = JSON.parse(line); return Array.isArray(v) ? v : [v]; } catch { return []; } }) as { Publishers?: { PublishedPort?: number; TargetPort?: number }[] }[];
    const ports = rows.flatMap(r => r.Publishers ?? []).filter(p => (p.PublishedPort ?? 0) > 0);
    for (const port of ports) {
      const candidate = `http://127.0.0.1:${String(port.PublishedPort)}`;
      try {
        const res = await fetch(`${candidate}${healthPath}`, { signal: AbortSignal.timeout(3000) });
        if (res.ok) { healthy = true; url = candidate; break; }
      } catch { /* not up yet */ }
    }
    if (!healthy) await Bun.sleep(3000);
  }
}
const logTail = run(['logs', '--tail', '40']).out.slice(-4000);
console.log(JSON.stringify({ started, healthy, url, services, log_tail: logTail }));
