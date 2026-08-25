import assert from "node:assert/strict";
import test from "node:test";
import { XDECO_HTML, XDECO_URI } from "./widget.js";

test("xdeco widget script is valid JavaScript", () => {
  const script = XDECO_HTML.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  assert.doesNotThrow(() => new Function(script));
  assert.equal(XDECO_URI, "ui://xdeco/dashboard-v7.html");
  assert.match(XDECO_HTML, /tailwindcss v4/);
  assert.match(XDECO_HTML, /--background:oklch/);
  assert.match(XDECO_HTML, /data-slot="dialog-content"/);
  assert.match(XDECO_HTML, /stroke-linecap="round"/);
  assert.doesNotMatch(XDECO_HTML, /stroke-width="1\.8"/);
});

test("widget uses a project-first two-level folder tree", () => {
  assert.match(XDECO_HTML, /<h2>项目<\/h2>/);
  assert.match(XDECO_HTML, /projectToggle/);
  assert.match(XDECO_HTML, /threadList/);
  assert.match(XDECO_HTML, /function associatedEntries\(\)/);
  assert.match(XDECO_HTML, /function groupEntries\(entries\)/);
  assert.match(XDECO_HTML, /无项目/);
  assert.match(XDECO_HTML, /codexProjects/);
});

test("widget adds tasks through a searchable project-grouped picker", () => {
  assert.match(XDECO_HTML, /id="newBinding"/);
  assert.match(XDECO_HTML, /function openPicker\(\)/);
  assert.match(XDECO_HTML, /id="pickerSearch"/);
  assert.match(XDECO_HTML, /搜索项目或 task/);
  assert.match(XDECO_HTML, /\[thread\.name,thread\.cwd,project\.name\]/);
  assert.match(XDECO_HTML, /关联 Codex task/);
  assert.match(XDECO_HTML, /state\.overview\.codexThreads\.filter/);
  assert.match(XDECO_HTML, /class="pickerGroup"/);
  assert.match(XDECO_HTML, /data-picker-group/);
  assert.match(XDECO_HTML, /pickerCollapsedGroups/);
  assert.match(XDECO_HTML, /aria-expanded/);
  assert.match(XDECO_HTML, /aria-hidden/);
  assert.match(XDECO_HTML, /inert/);
  assert.doesNotMatch(XDECO_HTML, /<small>/);
  assert.match(XDECO_HTML, /已关联/);
  assert.match(XDECO_HTML, /callTool\("create_project"/);
  assert.match(XDECO_HTML, /callTool\("update_project"/);
});

test("widget keeps only the minimal association and execution flow", () => {
  assert.match(XDECO_HTML, /callTool\("add_todo",\{title:title,projectId:binding\.id,status:"ready"\}\)/);
  assert.match(XDECO_HTML, /callTool\("retry_todo"/);
  assert.doesNotMatch(XDECO_HTML, /requestDisplayMode/);
  assert.doesNotMatch(XDECO_HTML, /start_project_queue/);
  assert.doesNotMatch(XDECO_HTML, /自动发送|打开浮动窗口|打开全屏|收起到对话/);
  assert.doesNotMatch(XDECO_HTML, /statusSelect|projectPicker|saveDraftButton|newProjectButton/);
});

test("widget shows the AI answer and artifacts without routing metadata", () => {
  assert.match(XDECO_HTML, /class="dialog" role="dialog"/);
  assert.match(XDECO_HTML, /callTool\("get_todo_result",\{todoId:todoId\}\)/);
  assert.match(XDECO_HTML, />AI 回复</);
  assert.match(XDECO_HTML, />产出物</);
  assert.match(XDECO_HTML, /state\.receiptResult\.answer/);
  assert.match(XDECO_HTML, /state\.receiptResult\.artifacts/);
  assert.doesNotMatch(XDECO_HTML, /复制定位信息|<span>Codex task<\/span>|<span>Turn<\/span>/);
});

test("widget refreshes active Todos until Codex finishes", () => {
  assert.match(XDECO_HTML, /hasActiveTodo/);
  assert.match(XDECO_HTML, /syncActivePolling/);
  assert.match(XDECO_HTML, /todo\.status==="sending"\|\|todo\.status==="running"/);
  assert.match(XDECO_HTML, /setTimeout\(function\(\)\{pollTimer=null;if\(document\.hidden\|\|state\.modal\)return;void refresh\(true\)\},2500\)/);
  assert.match(XDECO_HTML, /visibilitychange/);
});

test("widget adapts without manual size controls", () => {
  assert.match(XDECO_HTML, /@media\s*\(max-width:680px\)/);
  assert.match(XDECO_HTML, /grid-template-columns:repeat\(1,minmax\(0,1fr\)\)/);
  assert.match(XDECO_HTML, /notifyIntrinsicHeight/);
  assert.doesNotMatch(XDECO_HTML, /displayMode|fullscreen|pipButton|inlineButton/);
});
