type Json = Record<string, unknown>;
const read = (key: string): Json | null => {
  const raw = process.env[key];
  if (!raw || raw === 'null') return null;
  try { return JSON.parse(raw) as Json; } catch { return null; }
};
const deploy = read('INPUTS_DEPLOY');
const healthy = deploy?.healthy === true;
const services = Array.isArray(deploy?.services) ? (deploy.services as string[]) : [];
console.log(JSON.stringify({
  healthy,
  url: String(deploy?.url ?? ''),
  services,
  summary: healthy
    ? `Staging healthy at ${String(deploy?.url)} (${services.join(', ')})`
    : deploy?.started === true
      ? `Stack started but no service answered the health check. ${String(deploy?.log_tail ?? '').slice(-600)}`
      : `docker compose up failed. ${String(deploy?.log_tail ?? '').slice(-600)}`,
}));
