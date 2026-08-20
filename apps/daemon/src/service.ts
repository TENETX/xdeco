import { randomUUID } from "node:crypto";
import type {
  CaptureResult,
  CreateProjectInput,
  CreateTodoInput,
  Overview,
  Project,
  Todo,
  TodoRun,
  TodoStatus,
} from "@whomi/shared";
import { countByStatus } from "@whomi/shared";
import { CAPTURE_MODEL, EXECUTION_MODEL } from "./config.js";
import { CodexAppServer } from "./app-server.js";
import { WhomiDatabase } from "./database.js";
import { CodexProjectCatalog, type ProjectCatalog } from "./projects.js";

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

export class WhomiService {
  private readonly dispatchers = new Map<string, Promise<void>>();

  constructor(
    readonly database = new WhomiDatabase(),
    readonly codex = new CodexAppServer(),
    readonly projectCatalog: ProjectCatalog = new CodexProjectCatalog(),
  ) {}

  async overview(projectId?: string): Promise<Overview> {
    const todos = this.database.listTodos(projectId, true);
    const [codexProjects, codexAvailable, codexThreads] = await Promise.all([
      this.projectCatalog.list(),
      this.codex.available(),
      this.codex.listThreads().catch(() => []),
    ]);
    return {
      projects: this.database.listProjects(),
      codexProjects,
      codexThreads,
      todos,
      counts: countByStatus(todos),
      controller: {
        threadId: this.database.getSetting("controller_thread_id"),
        model: CAPTURE_MODEL,
        codexAvailable,
      },
    };
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

  async capture(text: string, imagePath?: string | null, projectId?: string | null): Promise<CaptureResult> {
    if (!text.trim() && !imagePath) throw new Error("Text or screenshot is required");
    if (projectId) this.getProject(projectId);
    try {
      let threadId = this.database.getSetting("controller_thread_id");
      if (!threadId) {
        threadId = await this.codex.startThread({ model: CAPTURE_MODEL, approvalPolicy: "never", sandbox: "read-only", serviceName: "whomi_capture" });
        this.database.setSetting("controller_thread_id", threadId);
        await this.codex.request("thread/name/set", { threadId, name: "whomi Inbox" });
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
        approvalPolicy: "never",
        sandbox: "workspace-write",
        serviceName: "whomi_dispatch",
      });
      await this.codex.request("thread/name/set", { threadId, name: project.name });
      project = this.updateProject(project.id, { targetThreadId: threadId });
    } else {
      await this.codex.resumeThread(threadId);
    }
    const turnId = await this.codex.startTurn({
      threadId,
      cwd: project.rootPath,
      model: EXECUTION_MODEL,
      effort: "medium",
      input: [{
        type: "text",
        text: [
          `执行 whomi 项目「${project.name}」中的 Todo：${todo.title}`,
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

export { WhomiService as PlanService };

type JsonInput = { type: "text"; text: string } | { type: "localImage"; path: string };
