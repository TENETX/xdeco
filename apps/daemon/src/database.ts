import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  CreateProjectInput,
  CreateQueueInput,
  CreateTodoInput,
  Project,
  Queue,
  Todo,
  TodoRun,
  TodoStatus,
} from "@xdeco/shared";
import { DATABASE_PATH, LEGACY_DATABASE_PATH } from "./config.js";

type SqlValue = string | number | null;

function now(): string {
  return new Date().toISOString();
}

export class XdecoDatabase {
  readonly db: DatabaseSync;

  constructor(
    path = DATABASE_PATH,
    legacyPath: string | null = path === DATABASE_PATH ? LEGACY_DATABASE_PATH : null,
  ) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
    this.migrate();
    if (legacyPath && legacyPath !== path && existsSync(legacyPath)) this.importLegacyDatabase(legacyPath);
  }

  private hasTable(name: string): boolean {
    return Boolean(this.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
  }

  private hasColumn(table: string, column: string): boolean {
    return (this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>)
      .some((candidate) => candidate.name === column);
  }

  private migrate(): void {
    if (!this.hasTable("projects") && this.hasTable("plans")) this.migrateLegacyPlans();
    this.createSchema();
    this.migrateProjectQueues();
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
        queue_id TEXT REFERENCES queues(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        mode TEXT NOT NULL DEFAULT 'default' CHECK (mode IN ('default','plan')),
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

      CREATE TABLE IF NOT EXISTS queues (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        target_thread_id TEXT,
        name TEXT,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS queues_project_idx ON queues(project_id, position, created_at);
      CREATE UNIQUE INDEX IF NOT EXISTS queues_project_thread_idx
        ON queues(project_id, target_thread_id) WHERE target_thread_id IS NOT NULL;

      CREATE TABLE IF NOT EXISTS todo_runs (
        id TEXT PRIMARY KEY,
        todo_id TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        queue_id TEXT REFERENCES queues(id) ON DELETE SET NULL,
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
    if (!this.hasColumn("todos", "mode")) {
      this.db.exec("ALTER TABLE todos ADD COLUMN mode TEXT NOT NULL DEFAULT 'default' CHECK (mode IN ('default','plan'))");
    }
    if (!this.hasColumn("todos", "queue_id")) this.db.exec("ALTER TABLE todos ADD COLUMN queue_id TEXT");
    if (!this.hasColumn("todo_runs", "queue_id")) this.db.exec("ALTER TABLE todo_runs ADD COLUMN queue_id TEXT");
  }

  /** Move the old single project binding into one durable queue exactly once. */
  private migrateProjectQueues(): void {
    const projects = this.db.prepare("SELECT id, target_thread_id AS targetThreadId FROM projects WHERE target_thread_id IS NOT NULL").all() as Array<{ id: string; targetThreadId: string }>;
    if (!projects.length) return;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const timestamp = now();
      const insertQueue = this.db.prepare(`
        INSERT OR IGNORE INTO queues (id, project_id, target_thread_id, name, position, created_at, updated_at)
        VALUES (?, ?, ?, NULL, 0, ?, ?)
      `);
      const assignTodos = this.db.prepare("UPDATE todos SET queue_id = ? WHERE project_id = ? AND queue_id IS NULL");
      const assignRuns = this.db.prepare("UPDATE todo_runs SET queue_id = ? WHERE project_id = ? AND queue_id IS NULL");
      for (const project of projects) {
        const queueId = `legacy_queue_${project.id}`;
        insertQueue.run(queueId, project.id, project.targetThreadId, timestamp, timestamp);
        assignTodos.run(queueId, project.id);
        assignRuns.run(queueId, project.id);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
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
        SELECT source.id, source.name, source.project_root, source.thread_id, 1,
          source.color, source.created_at, source.updated_at
        FROM legacy_plans AS source
        WHERE source.id = (
          SELECT candidate.id
          FROM legacy_plans AS candidate
          WHERE candidate.name COLLATE NOCASE = source.name COLLATE NOCASE
          ORDER BY candidate.updated_at DESC, candidate.created_at DESC, candidate.id ASC
          LIMIT 1
        );

        INSERT INTO todos (
          id, project_id, title, description, status, source_type, source_path, position,
          created_at, updated_at, completed_at, completion_thread_id, completion_turn_id,
          completion_summary, last_error
        )
        SELECT todo.id, project_map.project_id, todo.title, todo.description,
          CASE todo.status
            WHEN 'queued' THEN 'ready'
            WHEN 'running' THEN 'running'
            WHEN 'completed' THEN 'completed'
            WHEN 'ended' THEN 'archived'
            ELSE 'draft'
          END,
          todo.source_type, todo.source_path, todo.position, todo.created_at, todo.updated_at,
          todo.completed_at, todo.completion_thread_id, todo.completion_turn_id,
          todo.completion_summary, NULL
        FROM legacy_todos AS todo
        LEFT JOIN (
          SELECT source.id AS legacy_id, (
            SELECT candidate.id
            FROM legacy_plans AS candidate
            WHERE candidate.name COLLATE NOCASE = source.name COLLATE NOCASE
            ORDER BY candidate.updated_at DESC, candidate.created_at DESC, candidate.id ASC
            LIMIT 1
          ) AS project_id
          FROM legacy_plans AS source
        ) AS project_map ON project_map.legacy_id = todo.plan_id;
      `);
      if (this.hasTable("legacy_todo_runs")) {
        this.db.exec(`
          INSERT INTO todo_runs (
            id, todo_id, project_id, thread_id, turn_id, status, started_at, finished_at, error
          )
          SELECT run.id, run.todo_id, project_map.project_id, run.thread_id, run.turn_id,
            run.status, run.started_at, run.finished_at, run.error
          FROM legacy_todo_runs AS run
          JOIN (
            SELECT source.id AS legacy_id, (
              SELECT candidate.id
              FROM legacy_plans AS candidate
              WHERE candidate.name COLLATE NOCASE = source.name COLLATE NOCASE
              ORDER BY candidate.updated_at DESC, candidate.created_at DESC, candidate.id ASC
              LIMIT 1
            ) AS project_id
            FROM legacy_plans AS source
          ) AS project_map ON project_map.legacy_id = run.plan_id;
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

  private importLegacyDatabase(path: string): void {
    const imported = this.db.prepare("SELECT 1 FROM settings WHERE key = 'legacy_import_completed'").get();
    if (imported) return;
    const current = this.db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM projects) AS projects,
        (SELECT COUNT(*) FROM todos) AS todos
    `).get() as { projects: number; todos: number };
    if (current.projects > 0 || current.todos > 0) return;

    this.db.prepare("ATTACH DATABASE ? AS legacy_source").run(path);
    try {
      const hasPlans = Boolean(this.db.prepare(`
        SELECT 1 FROM legacy_source.sqlite_master WHERE type = 'table' AND name = 'plans'
      `).get());
      if (!hasPlans) return;

      this.db.exec("BEGIN IMMEDIATE");
      this.db.exec(`
        INSERT INTO projects (id, name, root_path, target_thread_id, auto_dispatch, color, created_at, updated_at)
        SELECT source.id, source.name, source.project_root, source.thread_id, 1,
          source.color, source.created_at, source.updated_at
        FROM legacy_source.plans AS source
        WHERE source.id = (
          SELECT candidate.id
          FROM legacy_source.plans AS candidate
          WHERE candidate.name COLLATE NOCASE = source.name COLLATE NOCASE
          ORDER BY candidate.updated_at DESC, candidate.created_at DESC, candidate.id ASC
          LIMIT 1
        );

        INSERT INTO todos (
          id, project_id, title, description, status, source_type, source_path, position,
          created_at, updated_at, completed_at, completion_thread_id, completion_turn_id,
          completion_summary, last_error
        )
        SELECT todo.id, project_map.project_id, todo.title, todo.description,
          CASE todo.status
            WHEN 'queued' THEN 'ready'
            WHEN 'running' THEN 'running'
            WHEN 'completed' THEN 'completed'
            WHEN 'ended' THEN 'archived'
            ELSE 'draft'
          END,
          todo.source_type, todo.source_path, todo.position, todo.created_at, todo.updated_at,
          todo.completed_at, todo.completion_thread_id, todo.completion_turn_id,
          todo.completion_summary, NULL
        FROM legacy_source.todos AS todo
        LEFT JOIN (
          SELECT source.id AS legacy_id, (
            SELECT candidate.id
            FROM legacy_source.plans AS candidate
            WHERE candidate.name COLLATE NOCASE = source.name COLLATE NOCASE
            ORDER BY candidate.updated_at DESC, candidate.created_at DESC, candidate.id ASC
            LIMIT 1
          ) AS project_id
          FROM legacy_source.plans AS source
        ) AS project_map ON project_map.legacy_id = todo.plan_id;
      `);

      const hasRuns = Boolean(this.db.prepare(`
        SELECT 1 FROM legacy_source.sqlite_master WHERE type = 'table' AND name = 'todo_runs'
      `).get());
      if (hasRuns) {
        this.db.exec(`
          INSERT INTO todo_runs (
            id, todo_id, project_id, thread_id, turn_id, status, started_at, finished_at, error
          )
          SELECT run.id, run.todo_id, project_map.project_id, run.thread_id, run.turn_id,
            run.status, run.started_at, run.finished_at, run.error
          FROM legacy_source.todo_runs AS run
          JOIN (
            SELECT source.id AS legacy_id, (
              SELECT candidate.id
              FROM legacy_source.plans AS candidate
              WHERE candidate.name COLLATE NOCASE = source.name COLLATE NOCASE
              ORDER BY candidate.updated_at DESC, candidate.created_at DESC, candidate.id ASC
              LIMIT 1
            ) AS project_id
            FROM legacy_source.plans AS source
          ) AS project_map ON project_map.legacy_id = run.plan_id;
        `);
      }
      this.db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES ('legacy_import_completed', ?)")
        .run(now());
      this.db.exec("COMMIT");
    } catch (error) {
      if (this.db.isTransaction) this.db.exec("ROLLBACK");
      throw error;
    } finally {
      this.db.exec("DETACH DATABASE legacy_source");
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
    if (input.targetThreadId !== undefined) {
      this.createQueue(`queue_${id}`, { projectId: id, targetThreadId: input.targetThreadId ?? null });
    }
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

  listQueues(projectId?: string): Queue[] {
    const where = projectId ? "WHERE project_id = ?" : "";
    const rows = this.db.prepare(`
      SELECT id, project_id AS projectId, target_thread_id AS targetThreadId, name, position,
        created_at AS createdAt, updated_at AS updatedAt
      FROM queues ${where} ORDER BY position, created_at
    `).all(...(projectId ? [projectId] : []));
    return rows as unknown as Queue[];
  }

  getQueue(id: string): Queue | null {
    return (this.db.prepare(`
      SELECT id, project_id AS projectId, target_thread_id AS targetThreadId, name, position,
        created_at AS createdAt, updated_at AS updatedAt
      FROM queues WHERE id = ?
    `).get(id) as Queue | undefined) ?? null;
  }

  createQueue(id: string, input: CreateQueueInput): Queue {
    const timestamp = now();
    const next = this.db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS position FROM queues WHERE project_id = ?")
      .get(input.projectId) as { position: number };
    this.db.prepare(`
      INSERT INTO queues (id, project_id, target_thread_id, name, position, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.projectId, input.targetThreadId ?? null, input.name ?? null, next.position, timestamp, timestamp);
    return this.getQueue(id)!;
  }

  updateQueue(id: string, input: Partial<Omit<CreateQueueInput, "projectId">>): Queue | null {
    const fields: Array<[string, SqlValue]> = [];
    if ("targetThreadId" in input) fields.push(["target_thread_id", input.targetThreadId ?? null]);
    if ("name" in input) fields.push(["name", input.name ?? null]);
    if (!fields.length) return this.getQueue(id);
    fields.push(["updated_at", now()]);
    this.db.prepare(`UPDATE queues SET ${fields.map(([column]) => `${column} = ?`).join(", ")} WHERE id = ?`)
      .run(...fields.map(([, value]) => value), id);
    return this.getQueue(id);
  }

  deleteQueue(id: string): Queue | null {
    const queue = this.getQueue(id);
    if (!queue) return null;

    this.db.exec("BEGIN IMMEDIATE");
    try {
      const active = this.db.prepare(`
        SELECT 1 FROM todos
        WHERE queue_id = ? AND status IN ('sending', 'running')
        LIMIT 1
      `).get(id);
      if (active) throw new Error("Cannot delete a Queue while a Todo is sending or running");

      const waiting = this.db.prepare(`
        SELECT id FROM todos
        WHERE queue_id = ? AND status = 'ready'
        ORDER BY position, created_at
      `).all(id) as Array<{ id: string }>;
      const nextPoolPosition = this.db.prepare(`
        SELECT COALESCE(MAX(position), -1) + 1 AS position
        FROM todos WHERE queue_id IS NULL
      `).get() as { position: number };
      const timestamp = now();
      const returnToPool = this.db.prepare(`
        UPDATE todos
        SET queue_id = NULL, status = 'draft', position = ?, updated_at = ?, last_error = NULL
        WHERE id = ?
      `);
      waiting.forEach((todo, index) => returnToPool.run(nextPoolPosition.position + index, timestamp, todo.id));

      this.db.prepare("DELETE FROM queues WHERE id = ?").run(id);
      const remaining = this.db.prepare(`
        SELECT id FROM queues WHERE project_id = ? ORDER BY position, created_at
      `).all(queue.projectId) as Array<{ id: string }>;
      const updatePosition = this.db.prepare("UPDATE queues SET position = ?, updated_at = ? WHERE id = ?");
      remaining.forEach((candidate, index) => updatePosition.run(index, timestamp, candidate.id));
      this.db.exec("COMMIT");
      return queue;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
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
    return `SELECT id, project_id AS projectId, queue_id AS queueId, title, description, mode, status,
      source_type AS sourceType, source_path AS sourcePath, position,
      created_at AS createdAt, updated_at AS updatedAt, completed_at AS completedAt,
      completion_thread_id AS completionThreadId, completion_turn_id AS completionTurnId,
      completion_summary AS completionSummary, last_error AS lastError FROM todos`;
  }

  createTodo(id: string, input: CreateTodoInput): Todo {
    const timestamp = now();
    const status = input.status ?? "draft";
    let queueId = input.queueId ?? null;
    if (!queueId && input.projectId && ["ready", "sending", "running"].includes(status)) {
      const queue = this.listQueues(input.projectId)[0] ?? this.createQueue(`queue_${input.projectId}`, { projectId: input.projectId, targetThreadId: this.getProject(input.projectId)?.targetThreadId ?? null });
      queueId = queue.id;
    }
    const next = this.db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS position FROM todos WHERE queue_id IS ?")
      .get(queueId) as { position: number };
    this.db.prepare(`
      INSERT INTO todos (
        id, project_id, queue_id, title, description, mode, status, source_type, source_path,
        position, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, input.projectId ?? null, queueId, input.title, input.description ?? "", input.mode ?? "default", status,
      input.sourceType ?? "text", input.sourcePath ?? null, next.position, timestamp, timestamp,
    );
    return this.getTodo(id)!;
  }

  updateTodoMode(id: string, mode: Todo["mode"]): Todo | null {
    this.db.prepare("UPDATE todos SET mode = ?, updated_at = ? WHERE id = ?")
      .run(mode, now(), id);
    return this.getTodo(id);
  }

  updateTodoStatus(id: string, status: TodoStatus, projectId?: string | null, error?: string | null): Todo | null {
    const timestamp = now();
    const completedAt = status === "completed" ? timestamp : null;
    if (projectId !== undefined) {
      this.db.prepare(`UPDATE todos SET status = ?, project_id = ?, queue_id = CASE WHEN ? = 'draft' THEN NULL ELSE queue_id END, updated_at = ?, completed_at = ?, last_error = ? WHERE id = ?`)
        .run(status, projectId, status, timestamp, completedAt, error ?? null, id);
    } else {
      this.db.prepare(`UPDATE todos SET status = ?, queue_id = CASE WHEN ? = 'draft' THEN NULL ELSE queue_id END, updated_at = ?, completed_at = ?, last_error = ? WHERE id = ?`)
        .run(status, status, timestamp, completedAt, error ?? null, id);
    }
    return this.getTodo(id);
  }

  queueTodo(id: string, queueId: string, beforeTodoId?: string | null): Todo | null {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.getTodo(id);
      if (!current) throw new Error("Todo not found");
      if (["sending", "running", "completed", "archived"].includes(current.status)) {
        throw new Error("This Todo cannot be moved into the queue");
      }

      const queue = this.getQueue(queueId) ?? (this.getProject(queueId)
        ? this.listQueues(queueId)[0] ?? this.createQueue(`queue_${queueId}`, { projectId: queueId, targetThreadId: this.getProject(queueId)?.targetThreadId ?? null })
        : null);
      if (!queue) throw new Error("Queue not found");
      const queued = this.db.prepare(`
        SELECT id FROM todos
        WHERE queue_id = ? AND status = 'ready' AND id != ?
        ORDER BY position, created_at
      `).all(queue.id, id) as Array<{ id: string }>;
      let insertAt = queued.length;
      if (beforeTodoId) {
        const index = queued.findIndex((todo) => todo.id === beforeTodoId);
        if (index < 0) throw new Error("Queue insertion target not found");
        insertAt = index;
      }
      queued.splice(insertAt, 0, { id });

      const timestamp = now();
      this.db.prepare(`
        UPDATE todos SET project_id = ?, queue_id = ?, status = 'ready', updated_at = ?,
          completed_at = NULL, last_error = NULL
        WHERE id = ?
      `).run(queue.projectId, queue.id, timestamp, id);
      const active = this.db.prepare(`
        SELECT COUNT(*) AS count FROM todos
        WHERE queue_id = ? AND status IN ('sending', 'running')
      `).get(queue.id) as { count: number };
      const updatePosition = this.db.prepare("UPDATE todos SET position = ? WHERE id = ?");
      queued.forEach((todo, index) => updatePosition.run(index + (active.count ? 1 : 0), todo.id));
      this.db.exec("COMMIT");
      return this.getTodo(id);
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  claimNextReady(queueId: string): Todo | null {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const active = this.db.prepare("SELECT 1 FROM todos WHERE queue_id = ? AND status IN ('sending','running') LIMIT 1").get(queueId);
      if (active) { this.db.exec("COMMIT"); return null; }
      const row = this.db.prepare("SELECT id FROM todos WHERE queue_id = ? AND status = 'ready' ORDER BY position, created_at LIMIT 1")
        .get(queueId) as { id: string } | undefined;
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
      INSERT INTO todo_runs (id, todo_id, project_id, queue_id, thread_id, turn_id, status, started_at, finished_at, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(run.id, run.todoId, run.projectId, run.queueId, run.threadId, run.turnId, run.status, run.startedAt, run.finishedAt, run.error);
    return run;
  }

  latestRun(todoId: string): TodoRun | null {
    return (this.db.prepare(`
      SELECT id, todo_id AS todoId, project_id AS projectId, queue_id AS queueId, thread_id AS threadId,
        turn_id AS turnId, status, started_at AS startedAt, finished_at AS finishedAt, error
      FROM todo_runs WHERE todo_id = ? ORDER BY started_at DESC LIMIT 1
    `).get(todoId) as unknown as TodoRun | undefined) ?? null;
  }

  getRunByTurn(turnId: string): TodoRun | null {
    return (this.db.prepare(`
      SELECT id, todo_id AS todoId, project_id AS projectId, queue_id AS queueId, thread_id AS threadId,
        turn_id AS turnId, status, started_at AS startedAt, finished_at AS finishedAt, error
      FROM todo_runs WHERE turn_id = ? LIMIT 1
    `).get(turnId) as unknown as TodoRun | undefined) ?? null;
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

export { XdecoDatabase as PlanDatabase };
