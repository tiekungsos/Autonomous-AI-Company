/** Merges the intake nodes' typed outputs into the one result the company layer persists. */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

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
const arr = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);

const ceo = read('INPUTS_CEO') ?? {};
const pm = read('INPUTS_PM');
const architect = read('INPUTS_ARCHITECT');
const planner = read('INPUTS_PLANNER');
const feasible = ceo.feasible === true && pm !== null && architect !== null && planner !== null;
const artifacts = process.env.ARTIFACTS_DIR ?? '';
const documents = (
  [
    ['ceo-brief', 'ceo-brief.md'],
    ['srs', 'srs.md'],
    ['architecture', 'architecture.md'],
    ['ux-spec', 'ux-spec.md'],
    ['development-plan', 'plan.md'],
  ] as const
)
  .filter(([, path]) => artifacts && existsSync(join(artifacts, path)))
  .map(([kind, path]) => ({ kind, path }));
const commands = (architect?.commands as Json | undefined) ?? {};
const command = (key: string): string => (typeof commands[key] === 'string' ? (commands[key] as string) : '');

console.log(
  JSON.stringify({
    feasible,
    summary: String(planner?.summary ?? ceo.summary ?? ''),
    assumptions: arr(ceo.assumptions),
    risks: [...arr(ceo.risks), ...arr(architect?.risks)],
    acceptance_criteria: arr(pm?.acceptance_criteria),
    open_questions: arr(pm?.open_questions),
    stack: String(architect?.stack ?? ''),
    language: String(architect?.language ?? ''),
    docker: architect?.docker === true,
    commands: {
      install: command('install'),
      build: command('build'),
      test: command('test'),
      lint: command('lint'),
      run: command('run'),
    },
    milestones: Array.isArray(planner?.milestones) ? planner.milestones : [],
    tasks: Array.isArray(planner?.tasks)
      ? (planner.tasks as Json[]).map(task => ({
          ...task,
          estimate_hours: typeof task.estimate_hours === 'number' ? task.estimate_hours : 0,
          size: ['small', 'medium', 'large'].includes(String(task.size)) ? task.size : 'medium',
        }))
      : [],
    documents,
  })
);
