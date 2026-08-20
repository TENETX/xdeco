import assert from "node:assert/strict";
import test from "node:test";
import { PLAN_BOARD_HTML } from "./widget.js";

test("Plan Board widget script is valid JavaScript", () => {
  const script = PLAN_BOARD_HTML.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  assert.doesNotThrow(() => new Function(script));
});

test("Plan Board shows project names without paths or branch details", () => {
  assert.match(PLAN_BOARD_HTML, /escapeHtml\(project\.name\) \+ '<\/option>'/);
  assert.doesNotMatch(PLAN_BOARD_HTML, /project\.name \+ " · " \+ project\.rootPath/);
  assert.doesNotMatch(PLAN_BOARD_HTML, /<span>Git 分支<\/span>/);
  assert.doesNotMatch(PLAN_BOARD_HTML, /Worktree 路径/);
});

test("Plan Board supports direct Todo creation and cleans optional tool arguments", () => {
  assert.match(PLAN_BOARD_HTML, /callTool\("create_todo", payload\)/);
  assert.match(PLAN_BOARD_HTML, /function cleanToolArgs\(args\)/);
  assert.match(PLAN_BOARD_HTML, /if \(value === undefined\) return cleaned/);
  assert.doesNotMatch(PLAN_BOARD_HTML, /worktreePath:.*\|\| undefined/);
});

test("Plan Board can route a Plan to an existing Codex task", () => {
  assert.match(PLAN_BOARD_HTML, /发送到/);
  assert.match(PLAN_BOARD_HTML, /set_plan_thread/);
  assert.match(PLAN_BOARD_HTML, /taskOptionsForRoot/);
  assert.match(PLAN_BOARD_HTML, /var threadId = select\.value \|\| null/);
  assert.doesNotMatch(PLAN_BOARD_HTML, /showToast\(event\.currentTarget\.value/);
});

test("Plan Board starts Todos through the current Codex task host bridge", () => {
  assert.match(PLAN_BOARD_HTML, /callTool\("prepare_current_todo", \{ todoId: todoId \}\)/);
  assert.match(PLAN_BOARD_HTML, /host\.sendFollowUpMessage/);
  assert.match(PLAN_BOARD_HTML, /host\.sendMessage/);
  assert.match(PLAN_BOARD_HTML, /callTool\("register_current_todo", \{ todoId: todoId, marker: prepared\.marker \}\)/);
  assert.doesNotMatch(PLAN_BOARD_HTML, /callTool\("start_todo", \{ todoId: todoId \}\)/);
  assert.match(PLAN_BOARD_HTML, /当前 task 启动/);
});
