import { access, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isAbsolute, resolve } from "node:path";
import type {
  CaptureResult,
  CreatePlanInput,
  CreateTodoInput,
  Overview,
  Plan,
  Todo,
  TodoRun,
  TodoStatus,
} from "@plan-orchestrator/shared";
import { countByStatus } from "@plan-orchestrator/shared";
import { CAPTURE_MODEL, EXECUTION_MODEL } from "./config.js";
import { CodexAppServer } from "./app-server.js";
import { PlanDatabase } from "./database.js";
import { CodexProjectCatalog, type ProjectCatalog } from "./projects.js";

const CAPTURE_SCHEMA = {
  type: "object",
  properties: {
    todos: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
        },
        required: ["title", "description"],
        additionalProperties: false,
      },
    },
  },
  required: ["todos"],
  additionalProperties: false,
};

const execFileAsync = promisify(execFile);

function requireText(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

export class PlanService {
  constructor(
    readonly database = new PlanDatabase(),
    readonly codex = new CodexAppServer(),
    readonly projects: ProjectCatalog = new CodexProjectCatalog(),
  ) {}

  async overview(planId?: string): Promise<Overview> {
    const todos = this.database.listTodos(planId, true);
    const [codexProjects, codexAvailable, codexThreads] = await Promise.all([
      this.projects.list(),
      this.codex.available(),
      this.codex.listThreads().catch(() => []),
    ]);
    return {
      plans: this.database.listPlans(),
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

  listPlans(): Plan[] {
    return this.database.listPlans();
  }

  listCodexProjects() {
    return this.projects.list();
  }

  createPlan(input: CreatePlanInput): Plan {
    requireText(input.name, "name");
    requireText(input.projectName, "projectName");
    requireText(input.projectRoot, "projectRoot");
    requireText(input.branch, "branch");
    return this.database.createPlan(randomUUID(), input);
  }

  updatePlan(id: string, input: Partial<CreatePlanInput>): Plan {
    const plan = this.database.updatePlan(id, input);
    if (!plan) throw new Error("Plan not found");
    return plan;
  }

  listTodos(planId?: string | null, includeEnded = true): Todo[] {
    return this.database.listTodos(planId, includeEnded);
  }

  getTodo(id: string): Todo {
    const todo = this.database.getTodo(id);
    if (!todo) throw new Error("Todo not found");
    return todo;
  }

  createTodo(input: CreateTodoInput): Todo {
    requireText(input.title, "title");
    if (input.status === "queued" && !input.planId) {
      throw new Error("Queued todos must be assigned to a Plan");
    }
    if (input.planId && !this.database.getPlan(input.planId)) throw new Error("Plan not found");
    return this.database.createTodo(randomUUID(), input);
  }

  setStatus(id: string, status: TodoStatus, planId?: string | null): Todo {
    const current = this.getTodo(id);
    if (status === "completed") {
      throw new Error("Use complete_todo so completion includes threadId and turnId");
    }
    const targetPlanId = planId === undefined ? current.planId : planId;
    if ((status === "queued" || status === "running") && !targetPlanId) {
      throw new Error(`${status} todos must be assigned to a Plan`);
    }
    const todo = this.database.updateTodoStatus(id, status, planId);
    if (!todo) throw new Error("Todo not found");
    return todo;
  }

  async capture(text: string, imagePath?: string | null, planId?: string | null): Promise<CaptureResult> {
    if (!text.trim() && !imagePath) throw new Error("Text or screenshot is required");
    if (planId && !this.database.getPlan(planId)) throw new Error("Plan not found");

    try {
      let threadId = this.database.getSetting("controller_thread_id");
      if (!threadId) {
        threadId = await this.codex.startThread({
          model: CAPTURE_MODEL,
          approvalPolicy: "never",
          sandbox: "read-only",
          serviceName: "plan_orchestrator_capture",
        });
        this.database.setSetting("controller_thread_id", threadId);
        await this.codex.request("thread/name/set", { threadId, name: "Plan Inbox" });
      } else {
        await this.codex.resumeThread(threadId);
        await this.codex.request("thread/name/set", { threadId, name: "Plan Inbox" });
      }

      const input: JsonInput[] = [
        {
          type: "text",
          text: `把下面的内容提炼为可以直接执行的 Todo。标题要短，描述保留验收条件；不要臆造项目或截止时间。\n\n${text.trim()}`,
        },
      ];
      if (imagePath) input.push({ type: "localImage", path: imagePath });
      const turnId = await this.codex.startTurn({
        threadId,
        input,
        model: CAPTURE_MODEL,
        effort: "low",
        outputSchema: CAPTURE_SCHEMA,
      });
      const result = await this.codex.waitForTurn(turnId);
      if (result.status !== "completed") throw new Error(result.error ?? `Capture turn ${result.status}`);
      const parsed = JSON.parse(result.text) as { todos: Array<{ title: string; description: string }> };
      const todos = parsed.todos.map((candidate) =>
        this.createTodo({
          title: candidate.title,
          description: candidate.description,
          planId: planId ?? null,
          status: planId ? "queued" : "someday",
          sourceType: imagePath ? "screenshot" : "text",
          sourcePath: imagePath ?? null,
        }),
      );
      return { todos, threadId, turnId, usedModel: true };
    } catch (error) {
      const title = text.trim().split(/\r?\n/).find(Boolean)?.replace(/^[-*\d.)\s]+/, "").slice(0, 100)
        || "从截图整理任务";
      const todo = this.createTodo({
        title,
        description: text.trim(),
        planId: planId ?? null,
        status: planId ? "queued" : "someday",
        sourceType: imagePath ? "screenshot" : "text",
        sourcePath: imagePath ?? null,
      });
      return {
        todos: [todo],
        threadId: this.database.getSetting("controller_thread_id"),
        turnId: null,
        usedModel: false,
        warning: `轻模型不可用，已按原文创建：${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  async launch(id: string): Promise<{ todo: Todo; plan: Plan; run: TodoRun }> {
    const todo = this.getTodo(id);
    if (!todo.planId) throw new Error("Assign the todo to a Plan before launch");
    let plan = this.database.getPlan(todo.planId);
    if (!plan) throw new Error("Plan not found");
    const cwd = plan.worktreePath || plan.projectRoot;
    await access(cwd);

    let threadId = plan.threadId;
    if (!threadId) {
      threadId = await this.codex.startThread({
        model: EXECUTION_MODEL,
        cwd,
        approvalPolicy: "never",
        sandbox: "workspace-write",
        serviceName: "plan_orchestrator_execution",
      });
      await this.codex.request("thread/name/set", {
        threadId,
        name: `${plan.projectName} · ${plan.name}`,
      });
      plan = this.updatePlan(plan.id, { threadId });
    } else {
      await this.codex.resumeThread(threadId);
    }

    const turnId = await this.codex.startTurn({
      threadId,
      cwd,
      model: EXECUTION_MODEL,
      effort: "medium",
      input: [
        {
          type: "text",
          text: [
            `执行 Plan「${plan.name}」中的 Todo：${todo.title}`,
            todo.description ? `\n背景与验收条件：\n${todo.description}` : "",
            "\n完成实现与必要验证。不要仅汇报计划；遇到真正需要用户选择的阻塞再询问。",
          ].join(""),
        },
      ],
    });

    const run: TodoRun = {
      id: randomUUID(),
      todoId: todo.id,
      planId: plan.id,
      threadId,
      turnId,
      status: "running",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      error: null,
    };
    this.database.createRun(run);
    const runningTodo = this.setStatus(todo.id, "running");
    void this.codex.waitForTurn(turnId, 24 * 60 * 60 * 1000).then((snapshot) => {
      this.database.updateRunByTurn(turnId, snapshot.status, snapshot.error);
    }).catch((error) => {
      this.database.updateRunByTurn(turnId, "failed", String(error));
    });
    return { todo: runningTodo, plan, run };
  }

  async prepareCurrentLaunch(id: string): Promise<{
    todo: Todo;
    plan: Plan;
    cwd: string;
    marker: string;
    prompt: string;
  }> {
    const todo = this.getTodo(id);
    if (todo.status !== "queued") throw new Error("Only queued Todos can be started");
    if (!todo.planId) throw new Error("Assign the Todo to a Plan before starting it");
    const plan = this.database.getPlan(todo.planId);
    if (!plan) throw new Error("Plan not found");
    if (!plan.threadId) {
      throw new Error("Bind this Plan to the current Codex task before starting from the plugin UI");
    }
    const cwd = plan.worktreePath || plan.projectRoot;
    const info = await stat(cwd);
    if (!info.isDirectory()) throw new Error("Plan worktree path is not a directory");

    const marker = `[plan-orchestrator todo=${todo.id} run=${randomUUID()}]`;
    const prompt = [
      marker,
      `请在当前 Codex task 中执行 Plan「${plan.name}」的 Todo「${todo.title}」。`,
      `Todo ID：${todo.id}`,
      `Plan ID：${plan.id}`,
      `工作目录：${cwd}`,
      `Git 分支：${plan.branch}`,
      todo.description ? `背景与验收条件：\n${todo.description}` : "",
      "开始实际修改前，调用 plan-orchestrator 的 register_current_todo，传入上面的 Todo ID 和关联标记。它会把当前可见 turn 记为运行记录；如果提示 task 绑定不一致，请先告诉用户，不要另起 task。",
      "随后直接完成实现和必要验证。不要只汇报计划；只有真正需要用户选择时再询问。不要猜测或伪造 taskId/turnId。",
    ].filter(Boolean).join("\n\n");
    return { todo, plan, cwd, marker, prompt };
  }

  async registerCurrentLaunch(id: string, marker: string): Promise<{
    todo: Todo;
    plan: Plan;
    run: TodoRun;
  }> {
    const todo = this.getTodo(id);
    if (!todo.planId) throw new Error("Assign the Todo to a Plan before starting it");
    const plan = this.database.getPlan(todo.planId);
    if (!plan) throw new Error("Plan not found");
    if (!plan.threadId) throw new Error("Plan is not bound to a Codex task");
    if (!marker.startsWith(`[plan-orchestrator todo=${todo.id} run=`) || !marker.endsWith("]")) {
      throw new Error("Invalid Todo execution marker");
    }

    const matchedTurn = await this.codex.findTurnContainingUserText(plan.threadId, marker);
    if (!matchedTurn) {
      throw new Error("The visible message was not found in the Plan-bound task; bind the Plan to the current task and try again");
    }
    const existingRun = this.database.getRunByTurn(matchedTurn.id);
    if (existingRun) {
      if (existingRun.todoId !== todo.id) throw new Error("This Codex turn is already linked to another Todo");
      const currentTodo = todo.status === "queued" ? this.setStatus(todo.id, "running") : todo;
      return { todo: currentTodo, plan, run: existingRun };
    }
    if (todo.status !== "queued" && todo.status !== "running") {
      throw new Error("Todo is no longer queued or running");
    }

    const run: TodoRun = {
      id: randomUUID(),
      todoId: todo.id,
      planId: plan.id,
      threadId: plan.threadId,
      turnId: matchedTurn.id,
      status: "running",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      error: null,
    };
    this.database.createRun(run);
    const runningTodo = todo.status === "running" ? todo : this.setStatus(todo.id, "running");
    return { todo: runningTodo, plan, run };
  }

  complete(id: string, input: { threadId?: string; turnId?: string; summary?: string }): Todo {
    const run = this.database.latestRun(id);
    const threadId = input.threadId ?? run?.threadId;
    const turnId = input.turnId ?? run?.turnId;
    if (!threadId || !turnId) throw new Error("Completion requires threadId and turnId");
    const todo = this.database.completeTodo(id, threadId, turnId, input.summary?.trim() ?? "");
    if (!todo) throw new Error("Todo not found");
    return todo;
  }

  async ensureWorktree(planId: string, baseRef = "HEAD"): Promise<Plan> {
    const plan = this.database.getPlan(planId);
    if (!plan) throw new Error("Plan not found");
    const projectRoot = resolve(plan.projectRoot);
    const worktreePath = resolve(plan.worktreePath || plan.projectRoot);
    if (!isAbsolute(plan.projectRoot) || !isAbsolute(plan.worktreePath || plan.projectRoot)) {
      throw new Error("Project root and worktree path must be absolute");
    }
    await access(projectRoot);
    try {
      const info = await stat(worktreePath);
      if (!info.isDirectory()) throw new Error("Worktree path exists but is not a directory");
      return plan;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    await execFileAsync("git", ["-C", projectRoot, "check-ref-format", "--branch", plan.branch]);
    let branchExists = true;
    try {
      await execFileAsync("git", ["-C", projectRoot, "show-ref", "--verify", "--quiet", `refs/heads/${plan.branch}`]);
    } catch {
      branchExists = false;
    }
    if (branchExists) {
      await execFileAsync("git", ["-C", projectRoot, "worktree", "add", worktreePath, plan.branch]);
    } else {
      await execFileAsync("git", ["-C", projectRoot, "worktree", "add", "-b", plan.branch, worktreePath, baseRef]);
    }
    return this.updatePlan(plan.id, { worktreePath });
  }
}

type JsonInput =
  | { type: "text"; text: string }
  | { type: "localImage"; path: string };
