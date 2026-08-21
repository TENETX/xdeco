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

test("widget can move between inline, PiP and fullscreen presentation", () => {
  assert.match(WHOMI_HTML, /requestDisplayMode/);
  assert.match(WHOMI_HTML, /"pip"/);
  assert.match(WHOMI_HTML, /"fullscreen"/);
  assert.match(WHOMI_HTML, /"inline"/);
  assert.match(WHOMI_HTML, /openai:set_globals/);
  assert.match(WHOMI_HTML, /window\.openai\.displayMode/);
  assert.match(WHOMI_HTML, /打开浮动窗口/);
  assert.match(WHOMI_HTML, /打开全屏/);
  assert.match(WHOMI_HTML, /收起/);
});

test("whomi shows the AI answer and artifacts without exposing routing metadata", () => {
  assert.match(WHOMI_HTML, /class="receiptDialog" role="dialog"/);
  assert.match(WHOMI_HTML, /callTool\("get_todo_result", \{ todoId: todoId \}\)/);
  assert.match(WHOMI_HTML, />AI 回复</);
  assert.match(WHOMI_HTML, />产出物</);
  assert.match(WHOMI_HTML, /state\.receiptResult\.answer/);
  assert.match(WHOMI_HTML, /state\.receiptResult\.artifacts/);
  assert.match(WHOMI_HTML, /state\.receiptTodoId\s*=\s*todoId/);
  assert.doesNotMatch(WHOMI_HTML, /复制定位信息/);
  assert.doesNotMatch(WHOMI_HTML, /<span>Codex task<\/span>/);
  assert.doesNotMatch(WHOMI_HTML, /<span>Turn<\/span>/);
  assert.doesNotMatch(WHOMI_HTML, /请打开 Todo/);
  assert.doesNotMatch(WHOMI_HTML, /已请求打开完成记录/);
});
