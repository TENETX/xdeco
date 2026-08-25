import assert from "node:assert/strict";
import test from "node:test";
import { WHOMI_HTML, WHOMI_URI } from "./widget.js";

test("whomi widget script is valid JavaScript", () => {
  const script = WHOMI_HTML.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  assert.doesNotThrow(() => new Function(script));
  assert.equal(WHOMI_URI, "ui://whomi/dashboard-v7.html");
  assert.match(WHOMI_HTML, /tailwindcss v4/);
  assert.match(WHOMI_HTML, /--background:oklch/);
  assert.match(WHOMI_HTML, /data-slot="dialog-content"/);
  assert.match(WHOMI_HTML, /stroke-linecap="round"/);
  assert.doesNotMatch(WHOMI_HTML, /stroke-width="1\.8"/);
});

test("widget uses a project-first two-level folder tree", () => {
  assert.match(WHOMI_HTML, /<h2>项目<\/h2>/);
  assert.match(WHOMI_HTML, /projectToggle/);
  assert.match(WHOMI_HTML, /threadList/);
  assert.match(WHOMI_HTML, /function associatedEntries\(\)/);
  assert.match(WHOMI_HTML, /function groupEntries\(entries\)/);
  assert.match(WHOMI_HTML, /无项目/);
  assert.match(WHOMI_HTML, /codexProjects/);
});

test("widget adds tasks through a searchable project-grouped picker", () => {
  assert.match(WHOMI_HTML, /id="newBinding"/);
  assert.match(WHOMI_HTML, /function openPicker\(\)/);
  assert.match(WHOMI_HTML, /id="pickerSearch"/);
  assert.match(WHOMI_HTML, /搜索项目或 task/);
  assert.match(WHOMI_HTML, /\[thread\.name,thread\.cwd,project\.name\]/);
  assert.match(WHOMI_HTML, /关联 Codex task/);
  assert.match(WHOMI_HTML, /state\.overview\.codexThreads\.filter/);
  assert.match(WHOMI_HTML, /class="pickerGroup"/);
  assert.match(WHOMI_HTML, /data-picker-group/);
  assert.match(WHOMI_HTML, /pickerCollapsedGroups/);
  assert.match(WHOMI_HTML, /aria-expanded/);
  assert.match(WHOMI_HTML, /aria-hidden/);
  assert.match(WHOMI_HTML, /inert/);
  assert.doesNotMatch(WHOMI_HTML, /<small>/);
  assert.match(WHOMI_HTML, /已关联/);
  assert.match(WHOMI_HTML, /callTool\("create_project"/);
  assert.match(WHOMI_HTML, /callTool\("update_project"/);
});

test("widget keeps only the minimal association and execution flow", () => {
  assert.match(WHOMI_HTML, /callTool\("add_todo",\{title:title,projectId:binding\.id,status:"ready"\}\)/);
  assert.match(WHOMI_HTML, /callTool\("retry_todo"/);
  assert.doesNotMatch(WHOMI_HTML, /requestDisplayMode/);
  assert.doesNotMatch(WHOMI_HTML, /start_project_queue/);
  assert.doesNotMatch(WHOMI_HTML, /自动发送|打开浮动窗口|打开全屏|收起到对话/);
  assert.doesNotMatch(WHOMI_HTML, /statusSelect|projectPicker|saveDraftButton|newProjectButton/);
});

test("widget shows the AI answer and artifacts without routing metadata", () => {
  assert.match(WHOMI_HTML, /class="dialog" role="dialog"/);
  assert.match(WHOMI_HTML, /callTool\("get_todo_result",\{todoId:todoId\}\)/);
  assert.match(WHOMI_HTML, />AI 回复</);
  assert.match(WHOMI_HTML, />产出物</);
  assert.match(WHOMI_HTML, /state\.receiptResult\.answer/);
  assert.match(WHOMI_HTML, /state\.receiptResult\.artifacts/);
  assert.doesNotMatch(WHOMI_HTML, /复制定位信息|<span>Codex task<\/span>|<span>Turn<\/span>/);
});

test("widget refreshes active Todos until Codex finishes", () => {
  assert.match(WHOMI_HTML, /hasActiveTodo/);
  assert.match(WHOMI_HTML, /syncActivePolling/);
  assert.match(WHOMI_HTML, /todo\.status==="sending"\|\|todo\.status==="running"/);
  assert.match(WHOMI_HTML, /setTimeout\(function\(\)\{pollTimer=null;if\(document\.hidden\|\|state\.modal\)return;void refresh\(true\)\},2500\)/);
  assert.match(WHOMI_HTML, /visibilitychange/);
});

test("widget adapts without manual size controls", () => {
  assert.match(WHOMI_HTML, /@media\s*\(max-width:680px\)/);
  assert.match(WHOMI_HTML, /grid-template-columns:repeat\(1,minmax\(0,1fr\)\)/);
  assert.match(WHOMI_HTML, /notifyIntrinsicHeight/);
  assert.doesNotMatch(WHOMI_HTML, /displayMode|fullscreen|pipButton|inlineButton/);
});
