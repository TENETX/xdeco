import assert from "node:assert/strict";
import test from "node:test";
import { WhomiDatabase } from "./database.js";
import { WhomiService } from "./service.js";

const unavailableCodex = { available: async () => false, listThreads: async () => [] } as any;
const emptyCatalog = { list: async () => [] };

function tick(): Promise<void> { return new Promise((resolve) => setImmediate(resolve)); }

test("adds a Todo from another conversation by exact project name", () => {
  const database = new WhomiDatabase(":memory:");
  const service = new WhomiService(database, unavailableCodex, emptyCatalog);
  const project = service.createProject({ name: "Website", rootPath: "/workspace/site", autoDispatch: false });
  const added = service.addTodo({ title: "Fix navigation", projectName: "website", status: "ready", sourceType: "mcp" });
  assert.equal(added.todo.projectId, project.id);
  assert.equal(added.todo.status, "ready");
  assert.equal(added.todo.sourceType, "mcp");
  assert.equal(added.dispatchStarted, false);
  database.close();
});

test("ready Todos require a Project and drafts do not dispatch", () => {
  const database = new WhomiDatabase(":memory:");
  const service = new WhomiService(database, unavailableCodex, emptyCatalog);
  assert.throws(() => service.addTodo({ title: "orphan", status: "ready" }), /Project/);
  assert.equal(service.addTodo({ title: "remember this" }).todo.status, "draft");
  database.close();
});

test("returns the completed AI answer and artifacts without routing metadata", async () => {
  const database = new WhomiDatabase(":memory:");
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
    const service = new WhomiService(database, codex, emptyCatalog);
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
  const database = new WhomiDatabase(":memory:");
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
  const service = new WhomiService(database, codex, emptyCatalog);
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
  const database = new WhomiDatabase(":memory:");
  let calls = 0;
  const codex = {
    available: async () => true,
    listThreads: async () => [],
    resumeThread: async () => undefined,
    startTurn: async () => `turn_${++calls}`,
    waitForTurn: async () => ({ status: "failed", text: "", error: "boom" }),
  } as any;
  const service = new WhomiService(database, codex, emptyCatalog);
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
