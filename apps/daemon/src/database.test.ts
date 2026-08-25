import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { XdecoDatabase } from "./database.js";

test("migrates legacy Plan and Todo rows into projects and the new queue states", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "xdeco-migration-"));
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
  const database = new XdecoDatabase(path);
  assert.equal(database.listProjects().length, 1);
  assert.equal(database.listProjects()[0]?.id, "project_2");
  assert.equal(database.listProjects()[0]?.targetThreadId, "thread_2");
  assert.equal(database.listTodos()[0]?.status, "ready");
  assert.equal(database.listTodos()[0]?.mode, "default");
  assert.deepEqual(database.listTodos().map((todo) => todo.projectId), ["project_2", "project_2"]);
  assert.equal(database.latestRun("todo_1")?.projectId, "project_2");
  database.close();
});

test("adds a default mode column to an existing xdeco database", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "xdeco-mode-migration-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "xdeco.sqlite");
  const existing = new DatabaseSync(path);
  existing.exec(`
    CREATE TABLE todos (
      id TEXT PRIMARY KEY, project_id TEXT, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL, source_type TEXT NOT NULL, source_path TEXT, position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT, completion_thread_id TEXT,
      completion_turn_id TEXT, completion_summary TEXT, last_error TEXT
    );
    INSERT INTO todos VALUES ('todo_old',NULL,'Existing Todo','', 'draft','text',NULL,0,
      '2026-01-01','2026-01-01',NULL,NULL,NULL,NULL,NULL);
  `);
  existing.close();

  const database = new XdecoDatabase(path, null);
  assert.equal(database.getTodo("todo_old")?.mode, "default");
  const project = database.createProject("project_mode", { name: "Modes", rootPath: "/workspace/modes" });
  const todo = database.createTodo("todo_mode", { title: "Plan this", projectId: project.id, mode: "plan" });
  assert.equal(todo.mode, "plan");
  assert.equal(database.updateTodoMode(todo.id, "default")?.mode, "default");
  database.close();
});

test("queues a Todo at an exact insertion point", () => {
  const database = new XdecoDatabase(":memory:");
  const project = database.createProject("project_queue", { name: "Queue", rootPath: "/workspace/queue" });
  const first = database.createTodo("todo_first", { title: "First", projectId: project.id, status: "ready" });
  const second = database.createTodo("todo_second", { title: "Second", projectId: project.id, status: "ready" });
  const waiting = database.createTodo("todo_waiting", { title: "Waiting", projectId: project.id, status: "draft" });

  database.queueTodo(waiting.id, project.id, second.id);

  assert.deepEqual(
    database.listTodos(project.id).filter((todo) => todo.status === "ready").map((todo) => todo.id),
    [first.id, waiting.id, second.id],
  );
  const completed = database.createTodo("todo_completed", { title: "Completed", projectId: project.id, status: "completed" });
  assert.throws(() => database.queueTodo(completed.id, project.id), /cannot be moved into the queue/);
  database.close();
});

test("imports legacy rows without modifying the legacy database", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "xdeco-import-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const legacyPath = join(directory, "legacy.sqlite");
  const targetPath = join(directory, "xdeco.sqlite");
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

  const database = new XdecoDatabase(targetPath, legacyPath);
  assert.equal(database.listProjects()[0]?.name, "Website");
  assert.equal(database.listTodos()[0]?.status, "ready");
  database.close();

  const untouched = new DatabaseSync(legacyPath, { readOnly: true });
  assert.equal((untouched.prepare("SELECT COUNT(*) AS count FROM plans").get() as { count: number }).count, 1);
  assert.equal(Boolean(untouched.prepare("SELECT 1 FROM sqlite_master WHERE name = 'projects'").get()), false);
  untouched.close();
});

test("does not re-import legacy rows after the xdeco database is intentionally cleared", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "xdeco-clear-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const legacyPath = join(directory, "legacy.sqlite");
  const targetPath = join(directory, "xdeco.sqlite");
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

  const database = new XdecoDatabase(targetPath, legacyPath);
  assert.equal(database.listProjects().length, 1);
  database.db.exec("DELETE FROM todo_runs; DELETE FROM todos; DELETE FROM projects");
  database.close();

  const reopened = new XdecoDatabase(targetPath, legacyPath);
  assert.equal(reopened.listProjects().length, 0);
  assert.equal(reopened.listTodos().length, 0);
  reopened.close();
});
