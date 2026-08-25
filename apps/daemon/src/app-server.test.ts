import assert from "node:assert/strict";
import test from "node:test";
import { CodexAppServer } from "./app-server.js";

test("readTurnResult selects the final answer and collects produced artifacts", async () => {
  const codex = new CodexAppServer();
  codex.request = (async (method: string, params: Record<string, unknown>) => {
    assert.equal(method, "thread/read");
    assert.deepEqual(params, { threadId: "thread_123", includeTurns: true });
    return {
      thread: {
        cwd: "/tmp/project",
        turns: [{
          id: "turn_456",
          status: "completed",
          items: [
            { type: "agentMessage", phase: "commentary", text: "正在处理" },
            { type: "fileChange", changes: [{ path: "src/result.ts", kind: "add" }] },
            {
              type: "mcpToolCall",
              result: { content: [{ type: "resource_link", name: "预览", uri: "https://example.com/preview" }] },
            },
            {
              type: "agentMessage",
              phase: "final_answer",
              text: "已经完成。查看[验收页](https://example.com/acceptance)。",
            },
          ],
        }],
      },
    };
  }) as CodexAppServer["request"];

  const result = await codex.readTurnResult("thread_123", "turn_456");
  assert.equal(result.answer, "已经完成。查看[验收页](https://example.com/acceptance)。");
  assert.deepEqual(result.artifacts, [
    { kind: "file", name: "result.ts", uri: "/tmp/project/src/result.ts" },
    { kind: "link", name: "预览", uri: "https://example.com/preview" },
    { kind: "link", name: "验收页", uri: "https://example.com/acceptance" },
  ]);
});

test("readFinishedTurn distinguishes active and completed turns", async () => {
  const codex = new CodexAppServer();
  let status = "inProgress";
  codex.request = (async () => ({
    thread: {
      turns: [{
        id: "turn_456",
        status,
        items: [{ type: "agentMessage", phase: "final_answer", text: "done" }],
      }],
    },
  })) as CodexAppServer["request"];

  assert.equal(await codex.readFinishedTurn("thread_123", "turn_456"), null);
  status = "completed";
  assert.deepEqual(await codex.readFinishedTurn("thread_123", "turn_456"), {
    status: "completed",
    text: "done",
    error: null,
  });
});
