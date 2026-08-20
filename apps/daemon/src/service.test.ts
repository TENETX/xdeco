import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PlanDatabase } from "./database.js";
import { PlanService } from "./service.js";

const unavailableCodex = {
  available: async () => false,
} as any;

test("queued todos require a Plan and keep the exact six-state model", () => {
  const database = new PlanDatabase(":memory:");
  const service = new PlanService(database, unavailableCodex);
  assert.throws(() => service.createTodo({ title: "orphan", status: "queued" }), /Plan/);
  const plan = service.createPlan({
    name: "A plan",
    codexProjectId: "codex-project-a",
    projectName: "A",
    projectRoot: "/tmp/a",
    branch: "feat/a",
  });
  assert.equal(plan.codexProjectId, "codex-project-a");
  const todo = service.createTodo({ title: "ship", status: "queued", planId: plan.id });
  assert.equal(todo.status, "queued");
  assert.equal(todo.planId, plan.id);
  assert.equal(service.setStatus(todo.id, "ended").status, "ended");
  database.close();
});

test("completion stores the originating task and turn", () => {
  const database = new PlanDatabase(":memory:");
  const service = new PlanService(database, unavailableCodex);
  const todo = service.createTodo({ title: "done" });
  assert.throws(() => service.setStatus(todo.id, "completed"), /complete_todo/);
  const completed = service.complete(todo.id, {
    threadId: "thr_123",
    turnId: "turn_456",
    summary: "tests green",
  });
  assert.equal(completed.status, "completed");
  assert.equal(completed.completionThreadId, "thr_123");
  assert.equal(completed.completionTurnId, "turn_456");
  database.close();
});

test("launch sends a Todo to the selected Codex task without renaming it", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "plan-route-test-"));
  const calls: Array<{ method: string; params?: Record<string, unknown> }> = [];
  const codex = {
    available: async () => true,
    listThreads: async () => [],
    resumeThread: async (threadId: string) => { calls.push({ method: "resume", params: { threadId } }); },
    request: async (method: string, params: Record<string, unknown>) => { calls.push({ method, params }); },
    startThread: async () => { throw new Error("should not create a task"); },
    startTurn: async (params: Record<string, unknown>) => {
      calls.push({ method: "turn/start", params });
      return "turn_456";
    },
    waitForTurn: async () => ({ status: "completed", text: "done", error: null }),
  } as any;
  const database = new PlanDatabase(":memory:");
  try {
    const service = new PlanService(database, codex);
    const plan = service.createPlan({
      name: "Route plan",
      projectName: "A",
      projectRoot,
      branch: "main",
      threadId: "thread_123",
    });
    const todo = service.createTodo({ title: "ship", status: "queued", planId: plan.id });
    const launched = await service.launch(todo.id);
    assert.equal(launched.run.threadId, "thread_123");
    assert.ok(calls.some((call) => call.method === "resume" && call.params?.threadId === "thread_123"));
    assert.ok(calls.some((call) => call.method === "turn/start" && call.params?.threadId === "thread_123"));
    assert.equal(calls.some((call) => call.method === "thread/name/set"), false);
  } finally {
    database.close();
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("current-task launch prepares a visible prompt without mutating Todo state", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "plan-current-prompt-"));
  const database = new PlanDatabase(":memory:");
  try {
    const service = new PlanService(database, unavailableCodex);
    const plan = service.createPlan({
      name: "Visible plan",
      projectName: "A",
      projectRoot,
      branch: "feat/visible",
      threadId: "thread_visible",
    });
    const todo = service.createTodo({
      title: "render in history",
      description: "message must be visible",
      status: "queued",
      planId: plan.id,
    });

    const prepared = await service.prepareCurrentLaunch(todo.id);
    assert.equal(prepared.cwd, projectRoot);
    assert.match(prepared.marker, new RegExp(`^\\[whomi todo=${todo.id} run=`));
    assert.match(prepared.prompt, /register_current_todo/);
    assert.match(prepared.prompt, /当前 Codex task/);
    assert.equal(service.getTodo(todo.id).status, "queued");
  } finally {
    database.close();
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("registering a current-task launch stores the matched visible turn", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "plan-current-register-"));
  const database = new PlanDatabase(":memory:");
  const codex = {
    available: async () => true,
    findTurnContainingUserText: async (threadId: string, marker: string) => {
      assert.equal(threadId, "thread_visible");
      assert.match(marker, /whomi/);
      return { id: "turn_visible", status: "inProgress" };
    },
  } as any;
  try {
    const service = new PlanService(database, codex);
    const plan = service.createPlan({
      name: "Visible plan",
      projectName: "A",
      projectRoot,
      branch: "feat/visible",
      threadId: "thread_visible",
    });
    const todo = service.createTodo({ title: "ship", status: "queued", planId: plan.id });
    const marker = `[whomi todo=${todo.id} run=run_visible]`;

    const registered = await service.registerCurrentLaunch(todo.id, marker);
    assert.equal(registered.todo.status, "running");
    assert.equal(registered.run.threadId, "thread_visible");
    assert.equal(registered.run.turnId, "turn_visible");

    const repeated = await service.registerCurrentLaunch(todo.id, marker);
    assert.equal(repeated.run.id, registered.run.id);
  } finally {
    database.close();
    await rm(projectRoot, { recursive: true, force: true });
  }
});
