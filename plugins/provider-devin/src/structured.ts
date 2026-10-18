/** Best-effort structured output: same prompt wording Archon's Pi/Copilot providers use. */
export function augmentPromptForJsonSchema(prompt: string, schema: Record<string, unknown>): string {
  return `${prompt}

---

CRITICAL: Respond with ONLY a JSON object matching the schema below. No prose before or after the JSON. No markdown code fences. Just the raw JSON object as your final message.

Schema:
${JSON.stringify(schema, null, 2)}`;
}

function parseObject(text: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/** Strip fences, then try a clean parse, then parse from the first `{`. */
export function tryParseStructuredOutput(text: string): Record<string, unknown> | undefined {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?\s*```\s*$/, '')
    .trim();
  if (cleaned.length === 0) return undefined;
  const direct = parseObject(cleaned);
  if (direct) return direct;
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first >= 0 && last > first) return parseObject(cleaned.slice(first, last + 1));
  return undefined;
}
