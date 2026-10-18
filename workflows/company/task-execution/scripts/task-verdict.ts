/** One verdict for the company scheduler from the implement, validate and review outputs. */
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
const implement = read('INPUTS_IMPLEMENT');
const validate = read('INPUTS_VALIDATE');
const review = read('INPUTS_REVIEW');
const push = read('INPUTS_PUSH') ?? {};
const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const count = (value: unknown): number => (Array.isArray(value) ? value.length : typeof value === 'number' ? value : 0);
const blocking = count(review?.blocking) || count(review?.blocking_findings) || count(review?.findings);

let stage: 'implement' | 'validate' | 'review' | 'done' = 'done';
let green = false;
let red_cause = '';
let summary = '';
if (!implement || implement.green !== true) {
  stage = 'implement';
  red_cause = text(implement?.red_cause) || 'incomplete';
  summary = text(implement?.summary) || 'implementation did not reach green';
} else if (!validate || validate.green !== true) {
  stage = 'validate';
  red_cause = text(validate?.red_cause) || 'incomplete';
  summary = text(validate?.summary) || 'validation did not run';
} else if (!review || review.ready !== true) {
  stage = 'review';
  red_cause = 'review';
  summary = text(review?.findings_summary) || text(review?.summary) || 'review did not approve the change';
} else {
  green = true;
  summary = text(review.summary) || text(validate.summary) || text(implement.summary);
}
console.log(
  JSON.stringify({
    green,
    stage,
    red_cause,
    summary,
    branch: text(push.branch),
    head: text(push.head),
    pushed: push.pushed === true,
    changed_files: count(push.changed_files),
    blocking_findings: blocking,
  })
);
