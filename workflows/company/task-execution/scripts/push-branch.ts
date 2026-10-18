/** Push the run's worktree branch to origin so the company scheduler can integrate it. */
function git(args: string[]): { code: number; out: string } {
  const result = Bun.spawnSync(['git', ...args], { stdout: 'pipe', stderr: 'pipe' });
  return { code: result.exitCode, out: `${result.stdout.toString()}${result.stderr.toString()}`.trim() };
}
const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).out;
const head = git(['rev-parse', 'HEAD']).out;
const base = git(['merge-base', 'HEAD', 'origin/HEAD']).code === 0
  ? git(['merge-base', 'HEAD', 'origin/HEAD']).out
  : git(['rev-list', '--max-parents=0', 'HEAD']).out;
const changed = git(['diff', '--name-only', `${base}..HEAD`]).out.split('\n').filter(Boolean).length;
const pushed = branch !== 'HEAD' && git(['push', '--force-with-lease', '-u', 'origin', `HEAD:refs/heads/${branch}`]).code === 0;
console.log(JSON.stringify({ branch, head, pushed, changed_files: changed }));
