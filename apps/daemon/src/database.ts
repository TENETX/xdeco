import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  CreatePlanInput,
  CreateTodoInput,
  Plan,
  Todo,
  TodoRun,
  TodoStatus,
} from "@whomi/shared";
import { DATABASE_PATH } from "./config.js";

type SqlValue = string | number | null;

function now(): string {
  return new Date().toISOString();
}

export class PlanDatabase {
  readonly db: DatabaseSync;

  constructor(path = DATABASE_PATH) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS plans (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        codex_project_id TEXT,
        project_name TEXT NOT NULL,
        project_root TEXT NOT NULL,
        branch TEXT NOT NULL,
        worktree_path TEXT NOT NULL,
        thread_id TEXT,
        color TEXT NOT NULL DEFAULT '#6f8f4f',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS todos (
        id TEXT PRIMARY KEY,
        plan_id TEXT REFERENCES plans(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL CHECK (status IN ('someday','waiting','queued','running','completed','ended')),
        source_type TEXT NOT NULL CHECK (source_type IN ('text','screenshot','mcp')),
        source_path TEXT,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        completion_thread_id TEXT,
        completion_turn_id TEXT,
        completion_summary TEXT
      );

      CREATE INDEX IF NOT EXISTS todos_plan_status_idx ON todos(plan_id, status, position);

      CREATE TABLE IF NOT EXISTS todo_runs (
        id TEXT PRIMARY KEY,
        todo_id TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
        plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
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
    const planColumns = this.db.prepare("PRAGMA table_info(plans)").all() as Array<{ name: string }>;
    if (!planColumns.some((column) => column.name === "codex_project_id")) {
      this.db.exec("ALTER TABLE plans ADD COLUMN codex_project_id TEXT");
    }
  }

  close(): void {
    this.db.close();
  }

  listPlans(): Plan[] {
    return this.db.prepare(`
      SELECT id, name, codex_project_id AS codexProjectId,
        project_name AS projectName, project_root AS projectRoot,
        branch, worktree_path AS worktreePath, thread_id AS threadId, color,
        created_at AS createdAt, updated_at AS updatedAt
      FROM plans ORDER BY updated_at DESC
    `).all() as unknown as Plan[];
  }

  getPlan(id: string): Plan | null {
    return (this.db.prepare(`
      SELECT id, name, codex_project_id AS codexProjectId,
        project_name AS projectName, project_root AS projectRoot,
        branch, worktree_path AS worktreePath, thread_id AS threadId, color,
        created_at AS createdAt, updated_at AS updatedAt
      FROM plans WHERE id = ?
    `).get(id) as unknown as Plan | undefined) ?? null;
  }

  createPlan(id: string, input: CreatePlanInput): Plan {
    const timestamp = now();
    this.db.prepare(`
      INSERT INTO plans (
        id, name, codex_project_id, project_name, project_root, branch, worktree_path,
        thread_id, color, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.name,
      input.codexProjectId ?? null,
      input.projectName,
      input.projectRoot,
      input.branch,
      input.worktreePath || input.projectRoot,
      input.threadId ?? null,
      input.color ?? "#6f8f4f",
      timestamp,
      timestamp,
    );
    return this.getPlan(id)!;
  }

  updatePlan(id: string, input: Partial<CreatePlanInput>): Plan | null {
    const fields: Array<[string, SqlValue]> = [];
    const map: Record<string, string> = {
      name: "name",
      codexProjectId: "codex_project_id",
      projectName: "project_name",
      projectRoot: "project_root",
      branch: "branch",
      worktreePath: "worktree_path",
      threadId: "thread_id",
      color: "color",
    };
    for (const [key, column] of Object.entries(map)) {
      if (key in input) fields.push([column, (input as Record<string, SqlValue | undefined>)[key] ?? null]);
    }
    if (!fields.length) return this.getPlan(id);
    fields.push(["updated_at", now()]);
    const set = fields.map(([column]) => `${column} = ?`).join(", ");
    this.db.prepare(`UPDATE plans SET ${set} WHERE id = ?`).run(...fields.map(([, value]) => value), id);
    return this.getPlan(id);
  }

  listTodos(planId?: string | null, includeEnded = true): Todo[] {
    const clauses: string[] = [];
    const params: SqlValue[] = [];
    if (planId) {
      clauses.push("plan_id = ?");
      params.push(planId);
    }
    if (!includeEnded) clauses.push("status != 'ended'");
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    return this.db.prepare(`
      SELECT id, plan_id AS planId, title, description, status,
        source_type AS sourceType, source_path AS sourcePath, position,
        created_at AS createdAt, updated_at AS updatedAt, completed_at AS completedAt,
        completion_thread_id AS completionThreadId,
        completion_turn_id AS completionTurnId,
        completion_summary AS completionSummary
      FROM todos ${where}
      ORDER BY position ASC, created_at DESC
    `).all(...params) as unknown as Todo[];
  }

  getTodo(id: string): Todo | null {
    return (this.db.prepare(`
      SELECT id, plan_id AS planId, title, description, status,
        source_type AS sourceType, source_path AS sourcePath, position,
        created_at AS createdAt, updated_at AS updatedAt, completed_at AS completedAt,
        completion_thread_id AS completionThreadId,
        completion_turn_id AS completionTurnId,
        completion_summary AS completionSummary
      FROM todos WHERE id = ?
    `).get(id) as unknown as Todo | undefined) ?? null;
  }

  createTodo(id: string, input: CreateTodoInput): Todo {
    const timestamp = now();
    const status = input.status ?? "someday";
    this.db.prepare(`
      INSERT INTO todos (
        id, plan_id, title, description, status, source_type, source_path,
        position, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(
      id,
      input.planId ?? null,
      input.title,
      input.description ?? "",
      status,
      input.sourceType ?? "text",
      input.sourcePath ?? null,
      timestamp,
      timestamp,
    );
    return this.getTodo(id)!;
  }

  updateTodoStatus(id: string, status: TodoStatus, planId?: string | null): Todo | null {
    const timestamp = now();
    const completedAt = status === "completed" ? timestamp : null;
    if (planId !== undefined) {
      this.db.prepare(`
        UPDATE todos SET status = ?, plan_id = ?, updated_at = ?, completed_at = ? WHERE id = ?
      `).run(status, planId, timestamp, completedAt, id);
    } else {
      this.db.prepare(`
        UPDATE todos SET status = ?, updated_at = ?, completed_at = ? WHERE id = ?
      `).run(status, timestamp, completedAt, id);
    }
    return this.getTodo(id);
  }

  completeTodo(id: string, threadId: string, turnId: string, summary: string): Todo | null {
    const timestamp = now();
    this.db.prepare(`
      UPDATE todos SET status = 'completed', updated_at = ?, completed_at = ?,
        completion_thread_id = ?, completion_turn_id = ?, completion_summary = ?
      WHERE id = ?
    `).run(timestamp, timestamp, threadId, turnId, summary, id);
    return this.getTodo(id);
  }

  createRun(run: TodoRun): TodoRun {
    this.db.prepare(`
      INSERT INTO todo_runs (
        id, todo_id, plan_id, thread_id, turn_id, status, started_at, finished_at, error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      run.id,
      run.todoId,
      run.planId,
      run.threadId,
      run.turnId,
      run.status,
      run.startedAt,
      run.finishedAt,
      run.error,
    );
    return run;
  }

  latestRun(todoId: string): TodoRun | null {
    return (this.db.prepare(`
      SELECT id, todo_id AS todoId, plan_id AS planId, thread_id AS threadId,
        turn_id AS turnId, status, started_at AS startedAt,
        finished_at AS finishedAt, error
      FROM todo_runs WHERE todo_id = ? ORDER BY started_at DESC LIMIT 1
    `).get(todoId) as unknown as TodoRun | undefined) ?? null;
  }

  getRunByTurn(turnId: string): TodoRun | null {
    return (this.db.prepare(`
      SELECT id, todo_id AS todoId, plan_id AS planId, thread_id AS threadId,
        turn_id AS turnId, status, started_at AS startedAt,
        finished_at AS finishedAt, error
      FROM todo_runs WHERE turn_id = ? ORDER BY started_at DESC LIMIT 1
    `).get(turnId) as unknown as TodoRun | undefined) ?? null;
  }

  updateRunByTurn(turnId: string, status: TodoRun["status"], error: string | null): void {
    this.db.prepare(`
      UPDATE todo_runs SET status = ?, finished_at = ?, error = ? WHERE turn_id = ?
    `).run(status, now(), error, turnId);
  }

  getSetting(key: string): string | null {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  setSetting(key: string, value: string): void {
    this.db.prepare(`
      INSERT INTO settings(key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, value);
  }
}
