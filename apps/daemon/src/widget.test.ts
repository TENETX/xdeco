import assert from "node:assert/strict";
import test from "node:test";
import { WHOMI_HTML } from "./widget.js";

test("whomi widget script is valid JavaScript", () => {
  const script = WHOMI_HTML.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  assert.doesNotThrow(() => new Function(script));
  assert.match(WHOMI_HTML, /项目 Todo 队列/);
});

test("widget exposes the simplified project queue", () => {
  assert.match(WHOMI_HTML, /add_todo/);
  assert.match(WHOMI_HTML, /start_project_queue/);
  assert.match(WHOMI_HTML, /自动发送/);
  assert.match(WHOMI_HTML, /待发送/);
  assert.doesNotMatch(WHOMI_HTML, /worktree|Worktree|Git 分支/);
});

test("widget lets users bind a destination task", () => {
  assert.match(WHOMI_HTML, /update_project/);
  assert.match(WHOMI_HTML, /targetThreadId/);
  assert.match(WHOMI_HTML, /首次发送时新建任务/);
});
