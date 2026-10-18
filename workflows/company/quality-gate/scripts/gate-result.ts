type Json = Record<string, unknown>;
const read = (key: string): Json | null => {
  const raw = process.env[key];
  if (!raw || raw === 'null') return null;
  try {
    return JSON.parse(raw) as Json;
  } catch {
    return null;
  }
};
const validate = read('INPUTS_VALIDATE');
const acceptance = read('INPUTS_ACCEPTANCE');
const repairs: { title: string; description: string }[] = [];
if (!validate || validate.green !== true) {
  repairs.push({
    title: 'Fix the failing project checks',
    description: `The validation gate is red (${String(validate?.red_cause ?? 'incomplete')}): ${String(validate?.summary ?? 'checks did not run')}`,
  });
}
const failed = Array.isArray(acceptance?.failed) ? (acceptance.failed as Json[]) : [];
for (const item of failed) {
  repairs.push({
    title: String(item.repair_title ?? `Satisfy acceptance criterion: ${String(item.criterion)}`),
    description: `${String(item.repair_description ?? '')}\n\nCriterion: ${String(item.criterion)}\nEvidence: ${String(item.evidence)}`,
  });
}
const green = repairs.length === 0 && acceptance !== null;
console.log(
  JSON.stringify({
    green,
    summary: green
      ? `Checks green; ${String((acceptance?.passed as unknown[] | undefined)?.length ?? 0)} acceptance criteria verified.`
      : `${String(repairs.length)} repair task(s) needed. ${String(acceptance?.summary ?? validate?.summary ?? '')}`.trim(),
    repairs,
  })
);
