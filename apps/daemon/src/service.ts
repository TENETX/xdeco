import { randomUUID } from "node:crypto";
import type {
  CaptureResult,
  CreateProjectInput,
  CreateTodoInput,
  Overview,
  Project,
  Todo,
  TodoResult,
  TodoRun,
  TodoMode,
  TodoStatus,
} from "@xdeco/shared";
import { countByStatus } from "@xdeco/shared";
import { CAPTURE_MODEL, EXECUTION_MODEL } from "./config.js";
import { CodexAppServer } from "./app-server.js";
import { XdecoDatabase } from "./database.js";
import { renderMarkdown } from "./markdown.js";
import { CodexProjectCatalog, type ProjectCatalog } from "./projects.js";
import { CodexThreadCatalog, type ThreadCatalog } from "./threads.js";

const CAPTURE_SCHEMA = {
  type: "object",
  properties: {
    todos: {
      type: "array", minItems: 1, maxItems: 8,
      items: {
        type: "object",
        properties: { title: { type: "string" }, description: { type: "string" } },
        required: ["title", "description"], additionalProperties: false,
      },
    },
  },
  required: ["todos"], additionalProperties: false,
};

function requireText(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

interface CodexCatalogSnapshot {
  projects: Awaited<ReturnType<ProjectCatalog["list"]>>;
  threads: Awaited<ReturnType<ThreadCatalog["list"]>>;
  available: boolean;
}

export class XdecoService {
  private readonly dispatchers = new Map<string, Promise<void>>();
  private catalogCache: { value: CodexCatalogSnapshot; expiresAt: number } | null = null;
  private catalogRequest: Promise<CodexCatalogSnapshot> | null = null;

  constructor(
    readonly database = new XdecoDatabase(),
    readonly codex = new CodexAppServer(),
    readonly projectCatalog: ProjectCatalog = new CodexProjectCatalog(),
    readonly threadCatalog: ThreadCatalog = new CodexThreadCatalog(),
  ) {
    this.restoreActiveQueues();
  }

  async overview(projectId?: string): Promise<Overview> {
    const todos = this.database.listTodos(projectId, true);
    const catalog = await this.codexCatalog();
    return {
      projects: this.database.listProjects(),
      codexProjects: catalog.projects,
      codexThreads: catalog.threads,
      todos,
      counts: countByStatus(todos),
      controller: {
        threadId: this.database.getSetting("controller_thread_id"),
        model: CAPTURE_MODEL,
        codexAvailable: catalog.available,
      },
    };
  }

  private async codexCatalog(): Promise<CodexCatalogSnapshot> {
    const now = Date.now();
    if (this.catalogCache && this.catalogCache.expiresAt > now) return this.catalogCache.value;
    if (this.catalogRequest) return this.catalogRequest;
    this.catalogRequest = Promise.all([
      this.projectCatalog.list().catch(() => []),
      this.threadCatalog.list(500).catch(() => []),
      Promise.race([
        this.codex.available(),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1_500)),
      ]).catch(() => false),
    ]).then(([projects, threads, available]) => {
      const value = { projects, threads, available };
      this.catalogCache = { value, expiresAt: Date.now() + (available ? 5_000 : 2_000) };
      return value;
    }).finally(() => {
      this.catalogRequest = null;
    });
    return this.catalogRequest;
  }

  listProjects(): Project[] { return this.database.listProjects(); }
  listCodexProjects() { return this.projectCatalog.list(); }

  getProject(id: string): Project {
    const project = this.database.getProject(id);
    if (!project) throw new Error("Project not found");
    return project;
  }

  createProject(input: CreateProjectInput): Project {
    const normalized: CreateProjectInput = {
      ...input,
      name: requireText(input.name, "name"),
      rootPath: requireText(input.rootPath, "rootPath"),
    };
    return this.database.createProject(randomUUID(), normalized);
  }

  updateProject(id: string, input: Partial<CreateProjectInput>): Project {
    const project = this.database.updateProject(id, input);
    if (!project) throw new Error("Project not found");
    if (project.autoDispatch) this.kick(project.id);
    return project;
  }

  listTodos(projectId?: string | null, includeArchived = true): Todo[] {
    return this.database.listTodos(projectId, includeArchived);
  }

  getTodo(id: string): Todo {
    const todo = this.database.getTodo(id);
    if (!todo) throw new Error("Todo not found");
    return todo;
  }

  async getTodoResult(id: string): Promise<TodoResult> {
    const todo = this.getTodo(id);
    if (!todo.completionThreadId || !todo.completionTurnId) {
      throw new Error("Todo does not have a completion result");
    }
    try {
      const result = await this.codex.readTurnResult(todo.completionThreadId, todo.completionTurnId);
      const answer = result.answer || todo.completionSummary || "";
      return {
        title: todo.title,
        answer,
        answerHtml: renderMarkdown(answer),
        artifacts: result.artifacts,
      };
    } catch (error) {
      if (!todo.completionSummary) throw error;
      return {
        title: todo.title,
        answer: todo.completionSummary,
        answerHtml: renderMarkdown(todo.completionSummary),
        artifacts: [],
      };
    }
  }

  addTodo(input: CreateTodoInput & { projectName?: string | null }): { todo: Todo; dispatchStarted: boolean } {
    const projectId = this.resolveProject(input.projectId, input.projectName);
    const status = input.status ?? "draft";
    if (status === "ready" && !projectId) throw new Error("Ready todos must belong to a Project");
    const todo = this.database.createTodo(randomUUID(), {
      ...input,
      title: requireText(input.title, "title"),
      projectId,
      status,
    });
    const dispatchStarted = status === "ready" && Boolean(projectId && this.getProject(projectId).autoDispatch);
    if (dispatchStarted && projectId) this.kick(projectId);
    return { todo, dispatchStarted };
  }

  createTodo(input: CreateTodoInput): Todo {
    return this.addTodo(input).todo;
  }

  private resolveProject(projectId?: string | null, projectName?: string | null): string | null {
    if (projectId) return this.getProject(projectId).id;
    if (!projectName?.trim()) return null;
    const project = this.database.findProjectByName(projectName.trim());
    if (!project) throw new Error(`Project not found: ${projectName.trim()}`);
    return project.id;
  }

  setStatus(id: string, status: TodoStatus, projectId?: string | null): Todo {
    const current = this.getTodo(id);
    const targetProjectId = projectId === undefined ? current.projectId : projectId;
    if (["ready", "sending", "running"].includes(status) && !targetProjectId) {
      throw new Error(`${status} todos must belong to a Project`);
    }
    if (status === "sending" || status === "running") {
      throw new Error("sending and running are managed by the dispatcher");
    }
    const todo = this.database.updateTodoStatus(id, status, projectId);
    if (!todo) throw new Error("Todo not found");
    if (status === "ready" && todo.projectId && this.getProject(todo.projectId).autoDispatch) this.kick(todo.projectId);
    return todo;
  }

  setMode(id: string, mode: TodoMode): Todo {
    const current = this.getTodo(id);
    if (current.status === "sending" || current.status === "running") {
      throw new Error("Cannot change the mode of a running Todo");
    }
    const todo = this.database.updateTodoMode(id, mode);
    if (!todo) throw new Error("Todo not found");
    return todo;
  }

  queueTodo(id: string, projectId: string, beforeTodoId?: string | null): Todo {
    const project = this.getProject(projectId);
    const todo = this.database.queueTodo(id, project.id, beforeTodoId);
    if (!todo) throw new Error("Todo not found");
    if (project.autoDispatch) this.kick(project.id);
    return todo;
  }

  async capture(text: string, imagePath?: string | null, projectId?: string | null): Promise<CaptureResult> {
    if (!text.trim() && !imagePath) throw new Error("Text or screenshot is required");
    if (projectId) this.getProject(projectId);
    try {
      let threadId = this.database.getSetting("controller_thread_id");
      if (!threadId) {
        threadId = await this.codex.startThread({ model: CAPTURE_MODEL, approvalPolicy: "never", sandbox: "read-only", serviceName: "xdeco_capture" });
        this.database.setSetting("controller_thread_id", threadId);
        await this.codex.request("thread/name/set", { threadId, name: "xdeco Inbox" });
      } else {
        await this.codex.resumeThread(threadId);
      }
      const input: JsonInput[] = [{ type: "text", text: `把下面的内容提炼为可以直接执行的 Todo。标题要短，描述保留验收条件；不要臆造项目或截止时间。\n\n${text.trim()}` }];
      if (imagePath) input.push({ type: "localImage", path: imagePath });
      const turnId = await this.codex.startTurn({ threadId, input, model: CAPTURE_MODEL, effort: "low", outputSchema: CAPTURE_SCHEMA });
      const result = await this.codex.waitForTurn(turnId);
      if (result.status !== "completed") throw new Error(result.error ?? `Capture turn ${result.status}`);
      const parsed = JSON.parse(result.text) as { todos: Array<{ title: string; description: string }> };
      const todos = parsed.todos.map((candidate) => this.addTodo({
        title: candidate.title,
        description: candidate.description,
        projectId: projectId ?? null,
        status: "draft",
        sourceType: imagePath ? "screenshot" : "text",
        sourcePath: imagePath ?? null,
      }).todo);
      return { todos, threadId, turnId, usedModel: true };
    } catch (error) {
      const title = text.trim().split(/\r?\n/).find(Boolean)?.replace(/^[-*\d.)\s]+/, "").slice(0, 100) || "从截图整理任务";
      const todo = this.addTodo({ title, description: text.trim(), projectId: projectId ?? null, status: "draft", sourceType: imagePath ? "screenshot" : "text", sourcePath: imagePath ?? null }).todo;
      return {
        todos: [todo], threadId: this.database.getSetting("controller_thread_id"), turnId: null, usedModel: false,
        warning: `轻模型不可用，已按原文创建：${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  startProjectQueue(projectId: string): { project: Project; started: boolean } {
    const project = this.getProject(projectId);
    const started = !this.dispatchers.has(projectId);
    this.kick(projectId);
    return { project, started };
  }

  retryTodo(id: string): Todo {
    const todo = this.getTodo(id);
    if (todo.status !== "failed") throw new Error("Only failed Todos can be retried");
    return this.setStatus(id, "ready");
  }

  private kick(projectId: string): void {
    if (this.dispatchers.has(projectId)) return;
    const task = this.runQueue(projectId).finally(() => this.dispatchers.delete(projectId));
    this.dispatchers.set(projectId, task);
    void task;
  }

  private restoreActiveQueues(): void {
    const projectIds = new Set(
      this.database.listTodos(undefined, true)
        .filter((todo) => todo.projectId && (todo.status === "sending" || todo.status === "running"))
        .map((todo) => todo.projectId!),
    );
    for (const projectId of projectIds) {
      const task = this.recoverProjectQueue(projectId).finally(() => this.dispatchers.delete(projectId));
      this.dispatchers.set(projectId, task);
      void task;
    }
  }

  private async recoverProjectQueue(projectId: string): Promise<void> {
    const todo = this.database.listTodos(projectId, true)
      .find((candidate) => candidate.status === "sending" || candidate.status === "running");
    if (!todo) return;
    const run = this.database.latestRun(todo.id);
    if (!run) {
      this.database.updateTodoStatus(todo.id, "failed", undefined, "xdeco 重启后无法找到这次 Codex 执行记录，请重试");
      return;
    }
    try {
      await this.codex.resumeThread(run.threadId);
      let finished = await this.codex.readFinishedTurn(run.threadId, run.turnId);
      if (!finished) finished = await this.codex.waitForTurn(run.turnId, 24 * 60 * 60 * 1000);
      if (finished.status !== "completed") {
        const message = finished.error ?? `Codex turn ${finished.status}`;
        this.database.updateRunByTurn(run.turnId, finished.status, message);
        this.database.updateTodoStatus(todo.id, "failed", undefined, message);
        return;
      }
      if (!finished.text) {
        const result = await this.codex.readTurnResult(run.threadId, run.turnId);
        finished = { ...finished, text: result.answer };
      }
      this.database.updateRunByTurn(run.turnId, "completed", null);
      this.database.completeTodo(todo.id, run.threadId, run.turnId, finished.text);
      await this.runQueue(projectId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.database.updateRunByTurn(run.turnId, "failed", message);
      this.database.updateTodoStatus(todo.id, "failed", undefined, message);
    }
  }

  private async runQueue(projectId: string): Promise<void> {
    while (true) {
      const todo = this.database.claimNextReady(projectId);
      if (!todo) return;
      try {
        const finished = await this.sendTodo(todo);
        if (finished.status !== "completed") {
          const message = finished.error ?? `Codex turn ${finished.status}`;
          this.database.updateTodoStatus(todo.id, "failed", undefined, message);
          return;
        }
        this.database.completeTodo(todo.id, finished.threadId, finished.turnId, finished.text);
      } catch (error) {
        this.database.updateTodoStatus(todo.id, "failed", undefined, error instanceof Error ? error.message : String(error));
        return;
      }
    }
  }

  private async sendTodo(todo: Todo): Promise<{ status: "completed" | "failed" | "interrupted"; text: string; error: string | null; threadId: string; turnId: string }> {
    if (!todo.projectId) throw new Error("Todo has no Project");
    let project = this.getProject(todo.projectId);
    let threadId = project.targetThreadId;
    if (!threadId) {
      threadId = await this.codex.startThread({
        model: EXECUTION_MODEL,
        cwd: project.rootPath,
        approvalPolicy: "on-request",
        approvalsReviewer: "auto_review",
        permissions: ":workspace",
        serviceName: "xdeco_dispatch",
      });
      await this.codex.request("thread/name/set", { threadId, name: project.name });
      project = this.updateProject(project.id, { targetThreadId: threadId });
    } else {
      await this.codex.resumeThread(threadId);
    }
    const turnId = await this.codex.startTurn({
      threadId,
      cwd: project.rootPath,
      approvalPolicy: "on-request",
      approvalsReviewer: "auto_review",
      permissions: ":workspace",
      collaborationMode: {
        mode: todo.mode,
        settings: {
          model: EXECUTION_MODEL,
          reasoning_effort: "medium",
          developer_instructions: null,
        },
      },
      input: [{
        type: "text",
        text: [
          `执行 xdeco 项目「${project.name}」中的 Todo：${todo.title}`,
          todo.description ? `\n背景与验收条件：\n${todo.description}` : "",
          "\n请直接完成工作并做必要验证；真正需要用户选择时再询问。",
        ].join(""),
      }],
    });
    const run: TodoRun = {
      id: randomUUID(), todoId: todo.id, projectId: project.id, threadId, turnId,
      status: "running", startedAt: new Date().toISOString(), finishedAt: null, error: null,
    };
    this.database.createRun(run);
    this.database.updateTodoStatus(todo.id, "running");
    const result = await this.codex.waitForTurn(turnId, 24 * 60 * 60 * 1000);
    this.database.updateRunByTurn(turnId, result.status, result.error);
    return { ...result, threadId, turnId };
  }
}

export { XdecoService as PlanService };

type JsonInput = { type: "text"; text: string } | { type: "localImage"; path: string };
