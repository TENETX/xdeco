import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type {
  CaptureResult,
  CreateProjectInput,
  CreateQueueInput,
  CreateTodoInput,
  Overview,
  Project,
  Queue,
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

function escapeDelegationText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function todoTurnInput(text: string, sourceThreadId: string | null, targetThreadId: string): string {
  if (!sourceThreadId || sourceThreadId === targetThreadId) return text;
  return `<codex_delegation>\n  <source_thread_id>${escapeDelegationText(sourceThreadId)}</source_thread_id>\n  <input>${escapeDelegationText(text)}</input>\n</codex_delegation>`;
}

export function visibleTodoInput(
  text: string,
  marker: string,
): string {
  return `${text}\n<!-- ${marker} -->`;
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
    readonly sourceThreadId = process.env.CODEX_THREAD_ID ?? process.env.CODEX_SESSION_ID ?? null,
  ) {
    this.restoreActiveQueues();
  }

  async overview(projectId?: string): Promise<Overview> {
    const todos = this.database.listTodos(projectId, true);
    const catalog = await this.codexCatalog();
    return {
      projects: this.database.listProjects(),
      queues: this.database.listQueues(projectId),
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
    const existing = this.database.findProjectByName(normalized.name);
    if (existing) {
      if (existing.rootPath === normalized.rootPath) return existing;
      throw new Error("A different shared project already uses this name");
    }
    return this.database.createProject(randomUUID(), normalized);
  }

  updateProject(id: string, input: Partial<CreateProjectInput>): Project {
    const project = this.database.updateProject(id, input);
    if (!project) throw new Error("Project not found");
    if (project.autoDispatch) this.kickProject(project.id);
    return project;
  }

  listQueues(projectId?: string): Queue[] { return this.database.listQueues(projectId); }

  getQueue(id: string): Queue {
    const queue = this.database.getQueue(id);
    if (!queue) throw new Error("Queue not found");
    return queue;
  }

  private ensureDefaultQueue(projectId: string): Queue {
    const existing = this.database.listQueues(projectId)[0];
    if (existing) return existing;
    const project = this.getProject(projectId);
    return this.database.createQueue(randomUUID(), { projectId, targetThreadId: project.targetThreadId });
  }

  async createQueue(input: CreateQueueInput): Promise<Queue> {
    const project = this.getProject(input.projectId);
    let targetThreadId = input.targetThreadId ?? null;
    if (!targetThreadId) {
      targetThreadId = await this.createExecutionThread(project, input.name ?? `${project.name} · 队列`, "xdeco_queue");
    }
    return this.database.createQueue(randomUUID(), { ...input, targetThreadId });
  }

  updateQueue(id: string, input: Partial<Omit<CreateQueueInput, "projectId">>): Queue {
    const queue = this.database.updateQueue(id, input);
    if (!queue) throw new Error("Queue not found");
    return queue;
  }

  deleteQueue(id: string): Queue {
    const queue = this.database.deleteQueue(id);
    if (!queue) throw new Error("Queue not found");
    return queue;
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

  addTodo(
    input: CreateTodoInput & { projectName?: string | null },
    options: { dispatch?: boolean } = {},
  ): { todo: Todo; dispatchStarted: boolean } {
    const projectId = this.resolveProject(input.projectId, input.projectName);
    const status = input.status ?? "draft";
    const queueId = input.queueId ?? null;
    const queue = queueId ? this.getQueue(queueId) : status === "ready" && projectId ? this.ensureDefaultQueue(projectId) : null;
    if (queue && projectId && queue.projectId !== projectId) throw new Error("Queue does not belong to this Project");
    if (status === "ready" && !queue) throw new Error("Ready todos must belong to a Project queue");
    const todo = this.database.createTodo(randomUUID(), {
      ...input,
      title: requireText(input.title, "title"),
      projectId,
      queueId: queue?.id ?? null,
      status,
    });
    const dispatchStarted = options.dispatch !== false
      && status === "ready"
      && Boolean(queue && this.getProject(queue.projectId).autoDispatch);
    if (dispatchStarted && queue) this.kick(queue.id);
    return { todo, dispatchStarted };
  }

  createCurrentTodo(input: Omit<CreateTodoInput, "status">): {
    todo: Todo;
    marker: string;
    payload: string;
    prompt: string;
    targetThreadId: string;
    relayed: boolean;
  } {
    if (!input.projectId) throw new Error("Project is required");
    const project = this.getProject(input.projectId);
    if (project.autoDispatch) this.updateProject(project.id, { autoDispatch: false });
    const todo = this.addTodo({ ...input, status: "ready" }, { dispatch: false }).todo;
    return this.prepareCurrentTodo(todo.id);
  }

  prepareCurrentTodo(id: string): {
    todo: Todo;
    marker: string;
    payload: string;
    prompt: string;
    targetThreadId: string;
    relayed: boolean;
  } {
    const todo = this.getTodo(id);
    if (todo.status !== "ready") throw new Error("Only queued Todos can be sent");
    if (!todo.queueId) throw new Error("Todo has no Queue");
    const queue = this.getQueue(todo.queueId);
    if (!queue.targetThreadId) throw new Error("Queue is not bound to a Codex task");
    const marker = `xdeco:todo=${todo.id};run=${randomUUID()}`;
    const query = todo.description ? `${todo.title}\n\n${todo.description}` : todo.title;
    const payload = visibleTodoInput(query, marker);
    const relayed = Boolean(this.sourceThreadId && this.sourceThreadId !== queue.targetThreadId);
    const prompt = relayed
      ? [
          `请使用 Codex 的 send_message_to_thread 工具，把下面 payload 原样发送到 task ${queue.targetThreadId}。`,
          "不要在当前 task 执行，不要改写、概括或补充 payload；发送成功后只需简短确认。",
          "",
          payload,
        ].join("\n")
      : payload;
    return { todo, marker, payload, prompt, targetThreadId: queue.targetThreadId, relayed };
  }

  async registerCurrentTodo(id: string, marker: string): Promise<{ todo: Todo; run: TodoRun }> {
    const todo = this.getTodo(id);
    if (!todo.projectId || !todo.queueId) throw new Error("Todo has no Queue");
    if (!marker.startsWith(`xdeco:todo=${todo.id};run=`)) throw new Error("Invalid Todo marker");
    const queue = this.getQueue(todo.queueId);
    if (!queue.targetThreadId) throw new Error("Queue is not bound to a Codex task");
    const matchedTurn = await this.codex.findTurnContainingUserText(queue.targetThreadId, marker, 30_000);
    if (!matchedTurn) {
      throw new Error("The visible message was not found in the Queue-bound Codex task");
    }
    const existingRun = this.database.getRunByTurn(matchedTurn.id);
    if (existingRun) return { todo: this.getTodo(id), run: existingRun };
    if (todo.status !== "ready" && todo.status !== "running") {
      throw new Error("Todo is no longer queued or running");
    }
    const run: TodoRun = {
      id: randomUUID(),
      todoId: todo.id,
      projectId: todo.projectId,
      queueId: todo.queueId,
      threadId: queue.targetThreadId,
      turnId: matchedTurn.id,
      status: "running",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      error: null,
    };
    this.database.createRun(run);
    const runningTodo = todo.status === "running"
      ? todo
      : this.database.updateTodoStatus(todo.id, "running")!;
    void this.monitorVisibleRun(runningTodo, run);
    return { todo: runningTodo, run };
  }

  private async monitorVisibleRun(todo: Todo, run: TodoRun): Promise<void> {
    try {
      let finished = await this.codex.readFinishedTurn(run.threadId, run.turnId);
      while (!finished) {
        await delay(1_500);
        finished = await this.codex.readFinishedTurn(run.threadId, run.turnId);
      }
      // Cross-task delivery can briefly expose an `interrupted` snapshot while
      // Codex is transferring ownership of the visible turn. Give that snapshot
      // time to settle before treating it as the terminal state.
      if (finished.status !== "completed") {
        for (let attempt = 0; attempt < 20; attempt += 1) {
          await delay(500);
          const settled = await this.codex.readFinishedTurn(run.threadId, run.turnId);
          if (!settled) continue;
          finished = settled;
          if (finished.status === "completed") break;
        }
      }
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.database.updateRunByTurn(run.turnId, "failed", message);
      this.database.updateTodoStatus(todo.id, "failed", undefined, message);
    }
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
    if (["ready", "sending", "running"].includes(status) && (!targetProjectId || !current.queueId)) {
      throw new Error(`${status} todos must belong to a Queue`);
    }
    if (status === "sending" || status === "running") {
      throw new Error("sending and running are managed by the dispatcher");
    }
    const todo = this.database.updateTodoStatus(id, status, projectId);
    if (!todo) throw new Error("Todo not found");
    if (status === "ready" && todo.queueId && todo.projectId && this.getProject(todo.projectId).autoDispatch) this.kick(todo.queueId);
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

  queueTodo(id: string, queueId: string, beforeTodoId?: string | null): Todo {
    const queue = this.getQueue(queueId);
    const todo = this.database.queueTodo(id, queue.id, beforeTodoId);
    if (!todo) throw new Error("Todo not found");
    if (this.getProject(queue.projectId).autoDispatch) this.kick(queue.id);
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
    const queues = this.database.listQueues(project.id);
    const started = queues.some((queue) => !this.dispatchers.has(queue.id));
    this.kickProject(project.id);
    return { project, started };
  }

  startQueue(queueId: string): { queue: Queue; started: boolean } {
    const queue = this.getQueue(queueId);
    const started = !this.dispatchers.has(queue.id);
    this.kick(queue.id);
    return { queue, started };
  }

  retryTodo(id: string): Todo {
    const todo = this.getTodo(id);
    if (todo.status !== "failed") throw new Error("Only failed Todos can be retried");
    return this.setStatus(id, "ready");
  }

  private kickProject(projectId: string): void {
    for (const queue of this.database.listQueues(projectId)) this.kick(queue.id);
  }

  private kick(queueId: string): void {
    if (this.dispatchers.has(queueId)) return;
    const task = this.runQueue(queueId).finally(() => this.dispatchers.delete(queueId));
    this.dispatchers.set(queueId, task);
    void task;
  }

  private restoreActiveQueues(): void {
    const queueIds = new Set(
      this.database.listTodos(undefined, true)
        .filter((todo) => todo.queueId && (todo.status === "sending" || todo.status === "running"))
        .map((todo) => todo.queueId!),
    );
    for (const queueId of queueIds) {
      const task = this.recoverQueue(queueId).finally(() => this.dispatchers.delete(queueId));
      this.dispatchers.set(queueId, task);
      void task;
    }
  }

  private async recoverQueue(queueId: string): Promise<void> {
    const todo = this.database.listTodos(undefined, true)
      .filter((candidate) => candidate.queueId === queueId)
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
      await this.runQueue(queueId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.database.updateRunByTurn(run.turnId, "failed", message);
      this.database.updateTodoStatus(todo.id, "failed", undefined, message);
    }
  }

  private async runQueue(queueId: string): Promise<void> {
    while (true) {
      const todo = this.database.claimNextReady(queueId);
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
    if (!todo.projectId || !todo.queueId) throw new Error("Todo has no Queue");
    const project = this.getProject(todo.projectId);
    let queue = this.getQueue(todo.queueId);
    let threadId = queue.targetThreadId;
    if (!threadId) {
      threadId = await this.createExecutionThread(project, queue.name ?? project.name, "xdeco_dispatch");
      queue = this.updateQueue(queue.id, { targetThreadId: threadId });
    } else {
      try {
        await this.codex.resumeThread(threadId);
      } catch (error) {
        if (!this.isUnresumableThread(error)) throw error;
        threadId = await this.createExecutionThread(project, queue.name ?? project.name, "xdeco_dispatch_recovery");
        queue = this.updateQueue(queue.id, { targetThreadId: threadId });
      }
    }
    const query = todo.description ? `${todo.title}\n\n${todo.description}` : todo.title;
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
        text: todoTurnInput(query, this.sourceThreadId, threadId),
      }],
    });
    const run: TodoRun = {
      id: randomUUID(), todoId: todo.id, projectId: project.id, queueId: queue.id, threadId, turnId,
      status: "running", startedAt: new Date().toISOString(), finishedAt: null, error: null,
    };
    this.database.createRun(run);
    this.database.updateTodoStatus(todo.id, "running");
    const result = await this.codex.waitForTurn(turnId, 24 * 60 * 60 * 1000);
    this.database.updateRunByTurn(turnId, result.status, result.error);
    return { ...result, threadId, turnId };
  }

  private isUnresumableThread(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /paginated_threads is not supported yet|thread not found/i.test(message);
  }

  private async createExecutionThread(project: Project, name: string, serviceName: string): Promise<string> {
    const threadId = await this.codex.startThread({
      model: EXECUTION_MODEL,
      cwd: project.rootPath,
      approvalPolicy: "on-request",
      approvalsReviewer: "auto_review",
      permissions: ":workspace",
      serviceName,
    });
    await this.codex.request("thread/name/set", { threadId, name });
    return threadId;
  }
}

export { XdecoService as PlanService };

type JsonInput = { type: "text"; text: string } | { type: "localImage"; path: string };
