import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import type { CodexThread } from "@whomi/shared";
import { CODEX_SESSION_INDEX_PATH, CODEX_STATE_DATABASE_PATH } from "./config.js";

interface StoredThread {
  id: string;
  cwd: string;
  title: string;
  preview: string;
  name: string | null;
  updated_at: number;
  updated_at_ms: number | null;
  recency_at_ms: number;
}

interface SessionIndexEntry {
  id?: unknown;
  thread_name?: unknown;
}

export interface ThreadCatalog {
  list(limit?: number): Promise<CodexThread[]>;
}

async function readThreadNames(path: string): Promise<Map<string, string>> {
  try {
    const names = new Map<string, string>();
    for (const line of (await readFile(path, "utf8")).split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as SessionIndexEntry;
        if (typeof entry.id === "string" && typeof entry.thread_name === "string" && entry.thread_name.trim()) {
          names.set(entry.id, entry.thread_name.trim());
        }
      } catch {
        // Ignore a partially-written trailing line while Codex updates the index.
      }
    }
    return names;
  } catch {
    return new Map();
  }
}

function fallbackTitle(thread: StoredThread): string {
  const source = thread.name?.trim() || thread.title.trim() || thread.preview.trim();
  return source.split(/\r?\n/)[0]?.slice(0, 100) || "未命名任务";
}

export class CodexThreadCatalog implements ThreadCatalog {
  constructor(
    readonly databasePath = CODEX_STATE_DATABASE_PATH,
    readonly sessionIndexPath = CODEX_SESSION_INDEX_PATH,
  ) {}

  async list(limit = 100): Promise<CodexThread[]> {
    const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
    const names = await readThreadNames(this.sessionIndexPath);
    let database: DatabaseSync | null = null;
    try {
      database = new DatabaseSync(this.databasePath, { readOnly: true });
      const query = [
        "SELECT id, cwd, title, preview, name, updated_at, updated_at_ms, recency_at_ms",
        "FROM threads",
        "WHERE archived = 0",
        "AND preview <> ''",
        "AND COALESCE(thread_source, 'user') <> 'subagent'",
        "ORDER BY recency_at_ms DESC, id DESC",
        "LIMIT ?",
      ].join(" ");
      const rows = database.prepare(query).all(safeLimit) as unknown as StoredThread[];
      return rows.map((thread) => {
        const updatedAtMs = thread.recency_at_ms || thread.updated_at_ms || thread.updated_at * 1000;
        return {
          id: thread.id,
          name: names.get(thread.id) || fallbackTitle(thread),
          cwd: thread.cwd,
          status: "idle",
          updatedAt: new Date(updatedAtMs).toISOString(),
        };
      });
    } catch {
      return [];
    } finally {
      database?.close();
    }
  }
}
