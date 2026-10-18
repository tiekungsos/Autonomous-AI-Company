const write = JSON.parse(process.env.INPUTS_WRITE ?? '{}') as { summary?: string };
const push = JSON.parse(process.env.INPUTS_PUSH ?? '{}') as { branch?: string; head?: string; pushed?: boolean };
console.log(JSON.stringify({
  green: push.pushed === true,
  summary: String(write.summary ?? ''),
  branch: String(push.branch ?? ''),
  head: String(push.head ?? ''),
  pushed: push.pushed === true,
}));
