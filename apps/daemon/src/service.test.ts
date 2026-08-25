import assert from "node:assert/strict";
import test from "node:test";
import { XdecoDatabase } from "./database.js";
import { XdecoService } from "./service.js";

const unavailableCodex = { available: async () => false, listThreads: async () => [] } as any;
const emptyCatalog = { list: async () => [] };

function tick(): Promise<void> { return new Promise((resolve) => setImmediate(resolve)); }

test("reuses the Codex catalog during rapid overview polling", async () => {
  const database = new XdecoDatabase(":memory:");
  let availabilityChecks = 0;
  let projectReads = 0;
  let threadReads = 0;
  const codex = { available: async () => { availabilityChecks += 1; return true; } } as any;
  const projects = { list: async () => { projectReads += 1; return []; } };
  const threads = { list: async () => { threadReads += 1; return []; } };
  try {
    const service = new XdecoService(database, codex, projects, threads);
    await Promise.all([service.overview(), service.overview(), service.overview()]);
    await service.overview();
    assert.deepEqual({ availabilityChecks, projectReads, threadReads }, {
      availabilityChecks: 1,
      projectReads: 1,
      threadReads: 1,
    });
  } finally {
    database.close();
  }
});

test("adds a Todo from another conversation by exact project name", () => {
  const database = new XdecoDatabase(":memory:");
  const service = new XdecoService(database, unavailableCodex, emptyCatalog);
  const project = service.createProject({ name: "Website", rootPath: "/workspace/site", autoDispatch: false });
  const added = service.addTodo({ title: "Fix navigation", projectName: "website", status: "ready", sourceType: "mcp" });
  assert.equal(added.todo.projectId, project.id);
  assert.equal(added.todo.status, "ready");
  assert.equal(added.todo.sourceType, "mcp");
  assert.equal(added.dispatchStarted, false);
  database.close();
});

test("ready Todos require a Project and drafts do not dispatch", () => {
  const database = new XdecoDatabase(":memory:");
  const service = new XdecoService(database, unavailableCodex, emptyCatalog);
  assert.throws(() => service.addTodo({ title: "orphan", status: "ready" }), /Project/);
  assert.equal(service.addTodo({ title: "remember this" }).todo.status, "draft");
  database.close();
});

test("returns the completed AI answer and artifacts without routing metadata", async () => {
  const database = new XdecoDatabase(":memory:");
  const codex = {
    available: async () => true,
    listThreads: async () => [],
    readTurnResult: async (threadId: string, turnId: string) => {
      assert.equal(threadId, "thread_result");
      assert.equal(turnId, "turn_result");
      return {
        answer: "已经完成并通过测试。",
        artifacts: [{ kind: "file", name: "result.md", uri: "/tmp/result.md" }],
      };
    },
  } as any;
  try {
    const service = new XdecoService(database, codex, emptyCatalog);
    const project = service.createProject({ name: "Result", rootPath: "/workspace/result", autoDispatch: false });
    const todo = service.addTodo({ title: "Show result", projectId: project.id }).todo;
    database.completeTodo(todo.id, "thread_result", "turn_result", "fallback");

    const result = await service.getTodoResult(todo.id);
    assert.deepEqual(result, {
      title: "Show result",
      answer: "已经完成并通过测试。",
      artifacts: [{ kind: "file", name: "result.md", uri: "/tmp/result.md" }],
    });
    assert.equal("completionThreadId" in result, false);
    assert.equal("completionTurnId" in result, false);
  } finally {
    database.close();
  }
});

test("dispatches ready Todos one at a time in position order", async () => {
  const database = new XdecoDatabase(":memory:");
  const sent: string[] = [];
  const resolvers = new Map<string, (value: any) => void>();
  let turn = 0;
  const codex = {
    available: async () => true,
    listThreads: async () => [],
    resumeThread: async () => undefined,
    startThread: async () => "thread_1",
    request: async () => undefined,
    startTurn: async (params: any) => {
      const turnId = `turn_${++turn}`;
      sent.push(params.input[0].text);
      return turnId;
    },
    waitForTurn: async (turnId: string) => new Promise((resolve) => resolvers.set(turnId, resolve)),
  } as any;
  const service = new XdecoService(database, codex, emptyCatalog);
  const project = service.createProject({ name: "Website", rootPath: "/workspace/site", targetThreadId: "thread_1", autoDispatch: false });
  const first = service.addTodo({ title: "First", projectId: project.id, status: "ready" }).todo;
  const second = service.addTodo({ title: "Second", projectId: project.id, status: "ready" }).todo;

  service.startProjectQueue(project.id);
  await tick();
  assert.equal(sent.length, 1);
  assert.match(sent[0]!, /First/);
  assert.equal(service.getTodo(first.id).status, "running");
  assert.equal(service.getTodo(second.id).status, "ready");

  resolvers.get("turn_1")!({ status: "completed", text: "first done", error: null });
  await tick(); await tick();
  assert.equal(sent.length, 2);
  assert.match(sent[1]!, /Second/);
  assert.equal(service.getTodo(first.id).status, "completed");
  assert.equal(service.getTodo(second.id).status, "running");

  resolvers.get("turn_2")!({ status: "completed", text: "second done", error: null });
  await tick(); await tick();
  assert.equal(service.getTodo(second.id).status, "completed");
  database.close();
});

test("a failed Todo pauses the remaining project queue", async () => {
  const database = new XdecoDatabase(":memory:");
  let calls = 0;
  const codex = {
    available: async () => true,
    listThreads: async () => [],
    resumeThread: async () => undefined,
    startTurn: async () => `turn_${++calls}`,
    waitForTurn: async () => ({ status: "failed", text: "", error: "boom" }),
  } as any;
  const service = new XdecoService(database, codex, emptyCatalog);
  const project = service.createProject({ name: "Website", rootPath: "/workspace/site", targetThreadId: "thread_1", autoDispatch: false });
  const failed = service.addTodo({ title: "First", projectId: project.id, status: "ready" }).todo;
  const waiting = service.addTodo({ title: "Second", projectId: project.id, status: "ready" }).todo;
  service.startProjectQueue(project.id);
  await tick(); await tick();
  assert.equal(service.getTodo(failed.id).status, "failed");
  assert.equal(service.getTodo(waiting.id).status, "ready");
  assert.equal(calls, 1);
  database.close();
});

test("restores a running Codex turn after xdeco restarts", async () => {
  const database = new XdecoDatabase(":memory:");
  const project = database.createProject("project_restore", {
    name: "Restore",
    rootPath: "/workspace/restore",
    autoDispatch: false,
  });
  const todo = database.createTodo("todo_restore", {
    title: "Finish after restart",
    projectId: project.id,
    status: "running",
  });
  database.createRun({
    id: "run_restore",
    todoId: todo.id,
    projectId: project.id,
    threadId: "thread_restore",
    turnId: "turn_restore",
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
  });
  let resumed = false;
  let finish!: (value: any) => void;
  const codex = {
    readFinishedTurn: async () => null,
    resumeThread: async (threadId: string) => { resumed = threadId === "thread_restore"; },
    waitForTurn: async () => new Promise((resolve) => { finish = resolve; }),
  } as any;

  const service = new XdecoService(database, codex, emptyCatalog);
  await tick(); await tick();
  assert.equal(resumed, true);
  assert.equal(service.getTodo(todo.id).status, "running");

  finish({ status: "completed", text: "recovered answer", error: null });
  await tick(); await tick();
  const completed = service.getTodo(todo.id);
  assert.equal(completed.status, "completed");
  assert.equal(completed.completionThreadId, "thread_restore");
  assert.equal(completed.completionTurnId, "turn_restore");
  assert.equal(completed.completionSummary, "recovered answer");
  assert.equal(database.latestRun(todo.id)?.status, "completed");
  database.close();
});

test("marks an unrecoverable sending Todo as failed after restart", async () => {
  const database = new XdecoDatabase(":memory:");
  const project = database.createProject("project_orphan", {
    name: "Orphan",
    rootPath: "/workspace/orphan",
    autoDispatch: false,
  });
  const todo = database.createTodo("todo_orphan", {
    title: "Lost handoff",
    projectId: project.id,
    status: "sending",
  });

  const service = new XdecoService(database, {} as any, emptyCatalog);
  await tick();
  assert.equal(service.getTodo(todo.id).status, "failed");
  assert.match(service.getTodo(todo.id).lastError ?? "", /无法找到.*执行记录/);
  database.close();
});
