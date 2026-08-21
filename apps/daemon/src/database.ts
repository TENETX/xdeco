import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  CreateProjectInput,
  CreateTodoInput,
  Project,
  Todo,
  TodoRun,
  TodoStatus,
} from "@whomi/shared";
import { DATABASE_PATH } from "./config.js";

type SqlValue = string | number | null;

function now(): string {
  return new Date().toISOString();
}

export class WhomiDatabase {
  readonly db: DatabaseSync;

  constructor(path = DATABASE_PATH) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
    this.migrate();
  }

  private hasTable(name: string): boolean {
    return Boolean(this.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
  }

  private migrate(): void {
    if (!this.hasTable("projects") && this.hasTable("plans")) this.migrateLegacyPlans();
    this.createSchema();
  }

  private createSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        root_path TEXT NOT NULL DEFAULT '',
        target_thread_id TEXT,
        auto_dispatch INTEGER NOT NULL DEFAULT 1,
        color TEXT NOT NULL DEFAULT '#6f8f4f',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS todos (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL CHECK (status IN ('draft','ready','sending','running','completed','failed','archived')),
        source_type TEXT NOT NULL CHECK (source_type IN ('text','screenshot','mcp')),
        source_path TEXT,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        completion_thread_id TEXT,
        completion_turn_id TEXT,
        completion_summary TEXT,
        last_error TEXT
      );

      CREATE INDEX IF NOT EXISTS todos_project_status_idx
        ON todos(project_id, status, position, created_at);

      CREATE TABLE IF NOT EXISTS todo_runs (
        id TEXT PRIMARY KEY,
        todo_id TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        thread_id TEXT NOT NULL,
        turn_id TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        error TEXT
      );

      CREATE INDEX IF NOT EXISTS todo_runs_turn_idx ON todo_runs(turn_id);

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  private migrateLegacyPlans(): void {
    this.db.exec("PRAGMA foreign_keys = OFF");
    try {
      this.db.exec("BEGIN IMMEDIATE");
      this.db.exec("ALTER TABLE plans RENAME TO legacy_plans");
      this.db.exec("ALTER TABLE todos RENAME TO legacy_todos");
      if (this.hasTable("todo_runs")) this.db.exec("ALTER TABLE todo_runs RENAME TO legacy_todo_runs");
      this.createSchema();
      this.db.exec(`
        INSERT INTO projects (id, name, root_path, target_thread_id, auto_dispatch, color, created_at, updated_at)
        SELECT id, name, project_root, thread_id, 1, color, created_at, updated_at FROM legacy_plans;

        INSERT INTO todos (
          id, project_id, title, description, status, source_type, source_path, position,
          created_at, updated_at, completed_at, completion_thread_id, completion_turn_id,
          completion_summary, last_error
        )
        SELECT id, plan_id, title, description,
          CASE status
            WHEN 'queued' THEN 'ready'
            WHEN 'running' THEN 'running'
            WHEN 'completed' THEN 'completed'
            WHEN 'ended' THEN 'archived'
            ELSE 'draft'
          END,
          source_type, source_path, position, created_at, updated_at, completed_at,
          completion_thread_id, completion_turn_id, completion_summary, NULL
        FROM legacy_todos;
      `);
      if (this.hasTable("legacy_todo_runs")) {
        this.db.exec(`
          INSERT INTO todo_runs (
            id, todo_id, project_id, thread_id, turn_id, status, started_at, finished_at, error
          )
          SELECT id, todo_id, plan_id, thread_id, turn_id, status, started_at, finished_at, error
          FROM legacy_todo_runs;
        `);
        this.db.exec("DROP TABLE legacy_todo_runs");
      }
      this.db.exec("DROP TABLE legacy_todos; DROP TABLE legacy_plans; COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    } finally {
      this.db.exec("PRAGMA foreign_keys = ON");
    }
  }

  close(): void {
    this.db.close();
  }

  listProjects(): Project[] {
    return this.db.prepare(`
      SELECT id, name, root_path AS rootPath, target_thread_id AS targetThreadId,
        auto_dispatch AS autoDispatch, color, created_at AS createdAt, updated_at AS updatedAt
      FROM projects ORDER BY updated_at DESC
    `).all().map((row) => ({ ...row, autoDispatch: Boolean((row as any).autoDispatch) })) as Project[];
  }

  getProject(id: string): Project | null {
    const row = this.db.prepare(`
      SELECT id, name, root_path AS rootPath, target_thread_id AS targetThreadId,
        auto_dispatch AS autoDispatch, color, created_at AS createdAt, updated_at AS updatedAt
      FROM projects WHERE id = ?
    `).get(id) as Record<string, unknown> | undefined;
    return row ? { ...row, autoDispatch: Boolean(row.autoDispatch) } as unknown as Project : null;
  }

  findProjectByName(name: string): Project | null {
    const row = this.db.prepare("SELECT id FROM projects WHERE name = ? COLLATE NOCASE").get(name) as { id: string } | undefined;
    return row ? this.getProject(row.id) : null;
  }

  createProject(id: string, input: CreateProjectInput): Project {
    const timestamp = now();
    this.db.prepare(`
      INSERT INTO projects (id, name, root_path, target_thread_id, auto_dispatch, color, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, input.name, input.rootPath, input.targetThreadId ?? null,
      input.autoDispatch === false ? 0 : 1, input.color ?? "#6f8f4f", timestamp, timestamp,
    );
    return this.getProject(id)!;
  }

  updateProject(id: string, input: Partial<CreateProjectInput>): Project | null {
    const fields: Array<[string, SqlValue]> = [];
    const map: Record<string, string> = {
      name: "name", rootPath: "root_path", targetThreadId: "target_thread_id",
      autoDispatch: "auto_dispatch", color: "color",
    };
    for (const [key, column] of Object.entries(map)) {
      if (!(key in input)) continue;
      const raw = (input as Record<string, unknown>)[key];
      fields.push([column, key === "autoDispatch" ? (raw ? 1 : 0) : (raw as SqlValue) ?? null]);
    }
    if (!fields.length) return this.getProject(id);
    fields.push(["updated_at", now()]);
    const set = fields.map(([column]) => `${column} = ?`).join(", ");
    this.db.prepare(`UPDATE projects SET ${set} WHERE id = ?`).run(...fields.map(([, value]) => value), id);
    return this.getProject(id);
  }

  listTodos(projectId?: string | null, includeArchived = true): Todo[] {
    const clauses: string[] = [];
    const params: SqlValue[] = [];
    if (projectId) { clauses.push("project_id = ?"); params.push(projectId); }
    if (!includeArchived) clauses.push("status != 'archived'");
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    return this.db.prepare(`${this.todoSelect()} ${where} ORDER BY position ASC, created_at ASC`).all(...params) as unknown as Todo[];
  }

  getTodo(id: string): Todo | null {
    return (this.db.prepare(`${this.todoSelect()} WHERE id = ?`).get(id) as unknown as Todo | undefined) ?? null;
  }

  private todoSelect(): string {
    return `SELECT id, project_id AS projectId, title, description, status,
      source_type AS sourceType, source_path AS sourcePath, position,
      created_at AS createdAt, updated_at AS updatedAt, completed_at AS completedAt,
      completion_thread_id AS completionThreadId, completion_turn_id AS completionTurnId,
      completion_summary AS completionSummary, last_error AS lastError FROM todos`;
  }

  createTodo(id: string, input: CreateTodoInput): Todo {
    const timestamp = now();
    const status = input.status ?? "draft";
    const next = this.db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS position FROM todos WHERE project_id IS ?")
      .get(input.projectId ?? null) as { position: number };
    this.db.prepare(`
      INSERT INTO todos (
        id, project_id, title, description, status, source_type, source_path,
        position, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, input.projectId ?? null, input.title, input.description ?? "", status,
      input.sourceType ?? "text", input.sourcePath ?? null, next.position, timestamp, timestamp,
    );
    return this.getTodo(id)!;
  }

  updateTodoStatus(id: string, status: TodoStatus, projectId?: string | null, error?: string | null): Todo | null {
    const timestamp = now();
    const completedAt = status === "completed" ? timestamp : null;
    if (projectId !== undefined) {
      this.db.prepare(`UPDATE todos SET status = ?, project_id = ?, updated_at = ?, completed_at = ?, last_error = ? WHERE id = ?`)
        .run(status, projectId, timestamp, completedAt, error ?? null, id);
    } else {
      this.db.prepare(`UPDATE todos SET status = ?, updated_at = ?, completed_at = ?, last_error = ? WHERE id = ?`)
        .run(status, timestamp, completedAt, error ?? null, id);
    }
    return this.getTodo(id);
  }

  claimNextReady(projectId: string): Todo | null {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const active = this.db.prepare("SELECT 1 FROM todos WHERE project_id = ? AND status IN ('sending','running') LIMIT 1").get(projectId);
      if (active) { this.db.exec("COMMIT"); return null; }
      const row = this.db.prepare("SELECT id FROM todos WHERE project_id = ? AND status = 'ready' ORDER BY position, created_at LIMIT 1")
        .get(projectId) as { id: string } | undefined;
      if (!row) { this.db.exec("COMMIT"); return null; }
      this.db.prepare("UPDATE todos SET status = 'sending', updated_at = ?, last_error = NULL WHERE id = ? AND status = 'ready'")
        .run(now(), row.id);
      this.db.exec("COMMIT");
      return this.getTodo(row.id);
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  completeTodo(id: string, threadId: string, turnId: string, summary: string): Todo | null {
    const timestamp = now();
    this.db.prepare(`
      UPDATE todos SET status = 'completed', updated_at = ?, completed_at = ?,
        completion_thread_id = ?, completion_turn_id = ?, completion_summary = ?, last_error = NULL
      WHERE id = ?
    `).run(timestamp, timestamp, threadId, turnId, summary, id);
    return this.getTodo(id);
  }

  createRun(run: TodoRun): TodoRun {
    this.db.prepare(`
      INSERT INTO todo_runs (id, todo_id, project_id, thread_id, turn_id, status, started_at, finished_at, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(run.id, run.todoId, run.projectId, run.threadId, run.turnId, run.status, run.startedAt, run.finishedAt, run.error);
    return run;
  }

  latestRun(todoId: string): TodoRun | null {
    return (this.db.prepare(`
      SELECT id, todo_id AS todoId, project_id AS projectId, thread_id AS threadId,
        turn_id AS turnId, status, started_at AS startedAt, finished_at AS finishedAt, error
      FROM todo_runs WHERE todo_id = ? ORDER BY started_at DESC LIMIT 1
    `).get(todoId) as unknown as TodoRun | undefined) ?? null;
  }

  updateRunByTurn(turnId: string, status: TodoRun["status"], error: string | null): void {
    this.db.prepare("UPDATE todo_runs SET status = ?, finished_at = ?, error = ? WHERE turn_id = ?")
      .run(status, now(), error, turnId);
  }

  getSetting(key: string): string | null {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  setSetting(key: string, value: string): void {
    this.db.prepare(`INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
      .run(key, value);
  }
}

export { WhomiDatabase as PlanDatabase };
