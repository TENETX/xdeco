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
    INSERT INTO plans VALUES ('project_2','website',NULL,'Website','D:/site-v2','main','D:/site-v2','thread_2','#654321','2026-01-02','2026-01-02');
    INSERT INTO todos VALUES ('todo_1','project_1','Ship','', 'queued','mcp',NULL,0,'2026-01-01','2026-01-01',NULL,NULL,NULL,NULL);
    INSERT INTO todos VALUES ('todo_2','project_2','Polish','', 'completed','mcp',NULL,1,'2026-01-02','2026-01-02','2026-01-02','thread_2','turn_2','Done');
    INSERT INTO todo_runs VALUES ('run_1','todo_1','project_1','thread_1','turn_1','completed','2026-01-01','2026-01-01',NULL);
  `);

  legacy.close();
  const database = new WhomiDatabase(path);
  assert.equal(database.listProjects().length, 1);
  assert.equal(database.listProjects()[0]?.id, "project_2");
  assert.equal(database.listProjects()[0]?.targetThreadId, "thread_2");
  assert.equal(database.listTodos()[0]?.status, "ready");
  assert.deepEqual(database.listTodos().map((todo) => todo.projectId), ["project_2", "project_2"]);
  assert.equal(database.latestRun("todo_1")?.projectId, "project_2");
  database.close();
});

test("imports legacy rows without modifying the legacy database", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "whomi-import-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const legacyPath = join(directory, "legacy.sqlite");
  const targetPath = join(directory, "whomi.sqlite");
  const legacy = new DatabaseSync(legacyPath);
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
    INSERT INTO plans VALUES ('project_1','Website',NULL,'Website','D:/site','main','D:/site','thread_1','#123456','2026-01-01','2026-01-01');
    INSERT INTO todos VALUES ('todo_1','project_1','Ship','', 'queued','mcp',NULL,0,'2026-01-01','2026-01-01',NULL,NULL,NULL,NULL);
  `);
  legacy.close();

  const database = new WhomiDatabase(targetPath, legacyPath);
  assert.equal(database.listProjects()[0]?.name, "Website");
  assert.equal(database.listTodos()[0]?.status, "ready");
  database.close();

  const untouched = new DatabaseSync(legacyPath, { readOnly: true });
  assert.equal((untouched.prepare("SELECT COUNT(*) AS count FROM plans").get() as { count: number }).count, 1);
  assert.equal(Boolean(untouched.prepare("SELECT 1 FROM sqlite_master WHERE name = 'projects'").get()), false);
  untouched.close();
});

test("does not re-import legacy rows after the whomi database is intentionally cleared", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "whomi-clear-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const legacyPath = join(directory, "legacy.sqlite");
  const targetPath = join(directory, "whomi.sqlite");
  const legacy = new DatabaseSync(legacyPath);
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
    INSERT INTO plans VALUES ('project_1','Website',NULL,'Website','D:/site','main','D:/site','thread_1','#123456','2026-01-01','2026-01-01');
  `);
  legacy.close();

  const database = new WhomiDatabase(targetPath, legacyPath);
  assert.equal(database.listProjects().length, 1);
  database.db.exec("DELETE FROM todo_runs; DELETE FROM todos; DELETE FROM projects");
  database.close();

  const reopened = new WhomiDatabase(targetPath, legacyPath);
  assert.equal(reopened.listProjects().length, 0);
  assert.equal(reopened.listTodos().length, 0);
  reopened.close();
});
