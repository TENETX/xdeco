import assert from "node:assert/strict";
import test from "node:test";
import { WHOMI_HTML } from "./widget.js";

test("whomi widget script is valid JavaScript", () => {
  const script = WHOMI_HTML.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  assert.doesNotThrow(() => new Function(script));
  assert.match(WHOMI_HTML, /<strong>whomi<\/strong>/);
  assert.doesNotMatch(WHOMI_HTML, /Plan Orchestrator|Plan Board/);
});

test("whomi shows project names without paths or branch details", () => {
  assert.match(WHOMI_HTML, /escapeHtml\(project\.name\) \+ '<\/option>'/);
  assert.doesNotMatch(WHOMI_HTML, /project\.name \+ " · " \+ project\.rootPath/);
  assert.doesNotMatch(WHOMI_HTML, /<span>Git 分支<\/span>/);
  assert.doesNotMatch(WHOMI_HTML, /Worktree 路径/);
});

test("whomi supports direct Todo creation and cleans optional tool arguments", () => {
  assert.match(WHOMI_HTML, /callTool\("create_todo", payload\)/);
  assert.match(WHOMI_HTML, /function cleanToolArgs\(args\)/);
  assert.match(WHOMI_HTML, /if \(value === undefined\) return cleaned/);
  assert.doesNotMatch(WHOMI_HTML, /worktreePath:.*\|\| undefined/);
});

test("whomi can route a Plan to an existing Codex task", () => {
  assert.match(WHOMI_HTML, /发送到/);
  assert.match(WHOMI_HTML, /set_plan_thread/);
  assert.match(WHOMI_HTML, /taskOptionsForRoot/);
  assert.match(WHOMI_HTML, /var threadId = select\.value \|\| null/);
  assert.doesNotMatch(WHOMI_HTML, /showToast\(event\.currentTarget\.value/);
});

test("whomi starts Todos through the current Codex task host bridge", () => {
  assert.match(WHOMI_HTML, /callTool\("prepare_current_todo", \{ todoId: todoId \}\)/);
  assert.match(WHOMI_HTML, /host\.sendFollowUpMessage/);
  assert.match(WHOMI_HTML, /host\.sendMessage/);
  assert.match(WHOMI_HTML, /callTool\("register_current_todo", \{ todoId: todoId, marker: prepared\.marker \}\)/);
  assert.doesNotMatch(WHOMI_HTML, /callTool\("start_todo", \{ todoId: todoId \}\)/);
  assert.match(WHOMI_HTML, /当前 task 启动/);
});
