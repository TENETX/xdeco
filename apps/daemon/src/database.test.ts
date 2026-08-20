import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WhomiDatabase } from "./database.js";

test("migrates legacy Plan and Todo rows into projects and the new queue states", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "whomi-migration-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "legacy.sqlite");
  const legacy = new DatabaseSync(path);
  legacy.exec(`
    CREATE TABLE plans (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, codex_project_id TEXT, project_name TEXT NOT NULL,
      project_root TEXT NOT NULL, branch TEXT NOT NULL, worktree_path TEXT NOT NULL, thread_id TEXT,
      color TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE todos (
      id TEXT PRIMARY KEY, plan_id TEXT, title TEXT NOT NULL, description TEXT NOT NULL,
      status TEXT NOT NULL, source_type TEXT NOT NULL, source_path TEXT, position INTEGER NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT,
      completion_thread_id TEXT, completion_turn_id TEXT, completion_summary TEXT
    );
    CREATE TABLE todo_runs (
      id TEXT PRIMARY KEY, todo_id TEXT NOT NULL, plan_id TEXT NOT NULL, thread_id TEXT NOT NULL,
      turn_id TEXT NOT NULL, status TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT, error TEXT
    );
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO plans VALUES ('project_1','Website',NULL,'Website','D:/site','main','D:/site','thread_1','#123456','2026-01-01','2026-01-01');
    INSERT INTO todos VALUES ('todo_1','project_1','Ship','', 'queued','mcp',NULL,0,'2026-01-01','2026-01-01',NULL,NULL,NULL,NULL);
  `);

  legacy.close();
  const database = new WhomiDatabase(path);
  assert.equal(database.listProjects()[0]?.name, "Website");
  assert.equal(database.listProjects()[0]?.targetThreadId, "thread_1");
  assert.equal(database.listTodos()[0]?.status, "ready");
  assert.equal(database.listTodos()[0]?.projectId, "project_1");
  database.close();
});
