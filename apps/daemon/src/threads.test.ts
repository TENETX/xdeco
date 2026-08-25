import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { CodexThreadCatalog } from "./threads.js";

test("lists visible Codex tasks by recency with sidebar titles", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "whomi-threads-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const databasePath = join(directory, "state.sqlite");
  const sessionIndexPath = join(directory, "session_index.jsonl");
  const database = new DatabaseSync(databasePath);
  database.exec([
    "CREATE TABLE threads (",
    "id TEXT PRIMARY KEY, cwd TEXT NOT NULL, title TEXT NOT NULL, preview TEXT NOT NULL,",
    "name TEXT, updated_at INTEGER NOT NULL, updated_at_ms INTEGER, recency_at_ms INTEGER NOT NULL,",
    "archived INTEGER NOT NULL, thread_source TEXT);",
    "INSERT INTO threads VALUES",
    "('older', '/projects/a', 'Long first message', 'preview', NULL, 10, 10000, 10000, 0, 'user'),",
    "('recent', '/projects/b', 'Recent first message', 'preview', NULL, 20, 20000, 20000, 0, 'user'),",
    "('archived', '/projects/a', 'Hidden', 'preview', NULL, 30, 30000, 30000, 1, 'user'),",
    "('subagent', '/projects/a', 'Helper', 'preview', NULL, 40, 40000, 40000, 0, 'subagent');",
  ].join(" "));
  database.close();
  await writeFile(sessionIndexPath, [
    JSON.stringify({ id: "older", thread_name: "Older task" }),
    JSON.stringify({ id: "recent", thread_name: "Codex sidebar title" }),
    "",
  ].join("\n"));

  const threads = await new CodexThreadCatalog(databasePath, sessionIndexPath).list(20);

  assert.deepEqual(threads.map((thread) => thread.id), ["recent", "older"]);
  assert.equal(threads[0]?.name, "Codex sidebar title");
  assert.equal(threads[0]?.cwd, "/projects/b");
});

test("returns an empty task list when Codex state is unavailable", async () => {
  assert.deepEqual(await new CodexThreadCatalog("/missing/state.sqlite", "/missing/index.jsonl").list(), []);
});
