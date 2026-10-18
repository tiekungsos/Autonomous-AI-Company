/**
 * Live view of a Devin print-mode turn. Devin records every tool call of a session in its
 * own SQLite database while the turn runs; this reads it (read-only) and turns new rows into
 * Archon `tool_call` / `tool_call_update` chunks, so the run log shows the commands as they
 * happen. Best effort: when the database or the session cannot be found, nothing streams and
 * the turn is unaffected.
 */
import { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { truncateToolOutput, type MessageChunk } from '@archon/provider-contract';

type ToolChunk = Extract<MessageChunk, { type: 'tool_call' | 'tool_call_update' }>;

interface ToolRow {
  rowid: number;
  tool_call_id: string;
  tool_call_json: string | null;
  tool_call_update_json: string | null;
}

/** Sessions already attributed to a turn in this plugin process (several turns can share a cwd). */
const claimed = new Set<string>();

export function devinSessionsDbPath(env: Record<string, string | undefined> = process.env): string {
  return env.DEVIN_SESSIONS_DB ?? join(env.HOME ?? homedir(), '.local', 'share', 'devin', 'cli', 'sessions.db');
}

function parse(json: string | null): Record<string, unknown> | null {
  if (!json) return null;
  try {
    const value: unknown = JSON.parse(json);
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export class DevinLiveWatcher {
  private db: Database | null = null;
  private sessionId: string | null = null;
  private lastRow = 0;
  private readonly open = new Set<string>();
  private readonly closed = new Set<string>();

  constructor(
    private readonly cwd: string,
    private readonly startedAtSec: number,
    private readonly promptHead: string,
    private readonly dbPath: string = devinSessionsDbPath()
  ) {}

  /** The Devin session id once it has been matched to this turn. */
  get session(): string | null {
    return this.sessionId;
  }

  private connect(): Database | null {
    if (this.db) return this.db;
    if (!existsSync(this.dbPath)) return null;
    try {
      this.db = new Database(this.dbPath, { readonly: true });
      return this.db;
    } catch {
      return null;
    }
  }

  /** Find this turn's session: same cwd, started with or after the turn, first user message = our prompt. */
  private findSession(db: Database): string | null {
    const candidates = db
      .query<{ id: string }, [string, number]>(
        'SELECT id FROM sessions WHERE working_directory = ? AND created_at >= ? ORDER BY created_at ASC'
      )
      .all(this.cwd, this.startedAtSec - 2);
    for (const { id } of candidates) {
      if (claimed.has(id)) continue;
      const first = db
        .query<{ chat_message: string }, [string]>(
          "SELECT chat_message FROM message_nodes WHERE session_id = ? AND chat_message LIKE '%\"role\":\"user\"%' ORDER BY node_id ASC LIMIT 1"
        )
        .get(id);
      const content = parse(first?.chat_message ?? null)?.content;
      if (typeof content === 'string' && content.startsWith(this.promptHead)) {
        claimed.add(id);
        return id;
      }
    }
    return null;
  }

  /** New chunks since the last poll. */
  poll(): ToolChunk[] {
    try {
      const db = this.connect();
      if (!db) return [];
      this.sessionId ??= this.findSession(db);
      if (!this.sessionId) return [];
      const rows = db
        .query<ToolRow, [string]>(
          'SELECT rowid, tool_call_id, tool_call_json, tool_call_update_json FROM tool_call_state WHERE session_id = ? ORDER BY rowid ASC'
        )
        .all(this.sessionId);
      const chunks: ToolChunk[] = [];
      for (const row of rows) {
        const id = row.tool_call_id;
        if (!this.open.has(id) && !this.closed.has(id)) {
          const call = parse(row.tool_call_json) ?? {};
          const meta = (call._meta ?? {}) as Record<string, unknown>;
          const rawInput = call.rawInput;
          chunks.push({
            type: 'tool_call',
            toolCallId: id,
            name: String(meta['cognition.ai/inferenceToolName'] ?? 'tool'),
            ...(typeof call.title === 'string' && call.title ? { title: call.title } : {}),
            ...(rawInput !== undefined ? { rawInput: rawInput as never } : {}),
          });
          this.open.add(id);
        }
        const update = parse(row.tool_call_update_json);
        const status = update?.status;
        if (this.open.has(id) && (status === 'completed' || status === 'failed')) {
          const content = Array.isArray(update?.content) ? (update.content as { content?: { text?: unknown } }[]) : [];
          const text = content.map(c => (typeof c.content?.text === 'string' ? c.content.text : '')).join('');
          const meta = (update?._meta ?? {}) as { terminal_exit?: { exit_code?: unknown } };
          const exitCode = meta.terminal_exit?.exit_code;
          chunks.push({
            type: 'tool_call_update',
            toolCallId: id,
            status,
            ...(text ? truncateToolOutput(text) : {}),
            ...(typeof exitCode === 'number' && Number.isInteger(exitCode) ? { exitCode } : {}),
          });
          this.open.delete(id);
          this.closed.add(id);
        }
        this.lastRow = Math.max(this.lastRow, row.rowid);
      }
      return chunks;
    } catch {
      return [];
    }
  }

  /** Close every call still open (the turn ended or was interrupted) so each call gets exactly one update. */
  finish(): ToolChunk[] {
    const chunks = this.poll();
    for (const id of this.open) chunks.push({ type: 'tool_call_update', toolCallId: id, status: 'cancelled' });
    this.open.clear();
    try {
      this.db?.close();
    } catch {
      /* ignore */
    }
    this.db = null;
    return chunks;
  }
}
