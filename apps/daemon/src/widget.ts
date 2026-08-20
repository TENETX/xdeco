export const PLAN_BOARD_URI = "ui://plan-orchestrator/plan-board-v1.html";

export const PLAN_BOARD_HTML = String.raw`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root {
      color-scheme: light dark;
      --bg: #f3f4f0;
      --surface: #fbfcf9;
      --raised: #ffffff;
      --ink: #20251e;
      --muted: #72786f;
      --faint: #9ca298;
      --line: #dde2da;
      --line-strong: #cbd2c7;
      --moss: #526a42;
      --moss-hover: #465a39;
      --moss-soft: #e6eddf;
      --amber: #b57b28;
      --blue: #5e7f9b;
      --purple: #7a6391;
      --red: #985d57;
      --shadow: 0 1px 1px rgb(27 35 24 / 4%), 0 8px 24px rgb(27 35 24 / 6%);
    }

    * { box-sizing: border-box; }
    html { min-width: 300px; min-height: 100%; -webkit-font-smoothing: antialiased; }
    body {
      min-height: 100%;
      margin: 0;
      color: var(--ink);
      background: var(--bg);
      font: 13px/1.45 Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      text-rendering: optimizeLegibility;
    }
    button, input, textarea, select { font: inherit; }
    button, select { color: inherit; }
    button { -webkit-tap-highlight-color: transparent; }
    button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible {
      outline: 2px solid color-mix(in srgb, var(--moss) 58%, transparent);
      outline-offset: 2px;
    }

    .app { min-height: 100vh; padding: 10px; }
    .shell {
      min-height: calc(100vh - 20px);
      overflow: hidden;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 18px;
      box-shadow: var(--shadow);
    }
    .topbar {
      position: sticky;
      z-index: 5;
      top: 0;
      display: flex;
      min-height: 58px;
      align-items: center;
      gap: 10px;
      padding: 9px 12px;
      background: color-mix(in srgb, var(--surface) 94%, transparent);
      border-bottom: 1px solid var(--line);
      backdrop-filter: blur(14px);
    }
    .mark {
      display: grid;
      width: 34px;
      height: 34px;
      flex: 0 0 34px;
      place-items: center;
      color: white;
      background: #455a39;
      border-radius: 10px;
      box-shadow: inset 0 0 0 1px rgb(255 255 255 / 12%), 0 2px 7px rgb(43 57 35 / 18%);
    }
    .mark svg { width: 18px; height: 18px; }
    .title { min-width: 0; flex: 1; }
    .title strong { display: block; font-size: 13px; font-weight: 720; letter-spacing: -.015em; }
    .title span { display: block; overflow: hidden; color: var(--muted); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
    .topActions { display: flex; align-items: center; gap: 4px; }
    .iconButton {
      display: inline-grid;
      min-width: 40px;
      height: 40px;
      padding: 0;
      place-items: center;
      color: var(--muted);
      background: transparent;
      border: 0;
      border-radius: 10px;
      cursor: pointer;
      transition: color 130ms ease, background-color 130ms ease, transform 90ms ease;
    }
    .iconButton:hover { color: var(--ink); background: color-mix(in srgb, var(--ink) 6%, transparent); }
    .iconButton:active { transform: scale(.96); }
    .iconButton svg { width: 17px; height: 17px; }

    .content { display: grid; gap: 12px; padding: 12px; }
    .lane {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 8px;
    }
    .laneSelect {
      position: relative;
      display: flex;
      min-width: 0;
      height: 42px;
      align-items: center;
      gap: 8px;
      padding: 0 32px 0 11px;
      background: var(--raised);
      border: 1px solid var(--line);
      border-radius: 10px;
      box-shadow: 0 1px 2px rgb(30 37 27 / 3%);
    }
    .laneSelect svg { width: 16px; height: 16px; flex: 0 0 auto; color: var(--moss); }
    .laneSelect select {
      min-width: 0;
      width: 100%;
      height: 100%;
      padding: 0;
      background: transparent;
      border: 0;
      outline: 0;
      appearance: none;
      cursor: pointer;
      font-weight: 630;
    }
    .laneSelect .chevron { position: absolute; right: 10px; width: 14px; pointer-events: none; color: var(--muted); }
    .newPlanButton {
      display: inline-flex;
      min-width: 42px;
      height: 42px;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 0 11px;
      color: var(--moss);
      background: var(--moss-soft);
      border: 1px solid color-mix(in srgb, var(--moss) 18%, var(--line));
      border-radius: 10px;
      cursor: pointer;
      font-size: 11px;
      font-weight: 680;
      transition: background-color 130ms ease, transform 90ms ease;
    }
    .newPlanButton:hover { background: color-mix(in srgb, var(--moss-soft) 82%, var(--moss) 8%); }
    .newPlanButton:active { transform: scale(.96); }
    .newPlanButton svg { width: 15px; height: 15px; }

    .binding {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 7px 10px;
      padding: 10px 11px;
      color: var(--muted);
      background: color-mix(in srgb, var(--ink) 3%, var(--surface));
      border-radius: 10px;
    }
    .binding strong { overflow: hidden; color: var(--ink); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
    .binding code { overflow: hidden; font: 9.5px ui-monospace, SFMono-Regular, Menlo, monospace; text-overflow: ellipsis; white-space: nowrap; }
    .binding span { color: var(--moss); font-size: 10px; font-weight: 680; white-space: nowrap; }
    .bindingNote { grid-column: 1 / -1; margin: 0; color: var(--muted); font-size: 9.5px; line-height: 1.45; text-wrap: pretty; }
    .routePicker { display: grid; grid-column: 1 / -1; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 8px; }
    .routePicker > span { color: var(--muted); font-size: 9.5px; }
    .routePicker select { width: 100%; height: 32px; padding: 0 9px; color: var(--ink); background: var(--raised); border: 1px solid var(--line); border-radius: 8px; outline: 0; }

    .capture {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px;
      padding: 9px;
      background: var(--raised);
      border: 1px solid var(--line);
      border-radius: 13px;
      box-shadow: 0 1px 2px rgb(30 37 27 / 3%);
    }
    .captureMain { min-width: 0; }
    .capture input[type="text"] {
      width: 100%;
      height: 40px;
      padding: 0 10px;
      color: var(--ink);
      background: color-mix(in srgb, var(--ink) 3%, var(--raised));
      border: 1px solid transparent;
      border-radius: 8px;
      outline: 0;
      transition: border-color 130ms ease, background-color 130ms ease, box-shadow 130ms ease;
    }
    .capture input[type="text"]:focus {
      background: var(--raised);
      border-color: color-mix(in srgb, var(--moss) 42%, var(--line));
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--moss) 9%, transparent);
    }
    .capture input[type="text"]::placeholder { color: var(--faint); }
    .captureMeta { display: flex; min-height: 30px; align-items: center; gap: 7px; padding: 6px 2px 0; }
    .captureActions { display: flex; align-items: center; gap: 6px; }
    .attachmentButton {
      display: inline-flex;
      min-height: 30px;
      max-width: 180px;
      align-items: center;
      gap: 5px;
      padding: 0 8px;
      overflow: hidden;
      color: var(--muted);
      background: color-mix(in srgb, var(--ink) 4%, transparent);
      border: 1px solid color-mix(in srgb, var(--ink) 6%, var(--line));
      border-radius: 7px;
      cursor: pointer;
      font-size: 9.5px;
      font-weight: 650;
      text-overflow: ellipsis;
      white-space: nowrap;
      transition: color 130ms ease, background-color 130ms ease, transform 90ms ease;
    }
    .attachmentButton:hover, .attachmentButton.active { color: var(--moss); background: var(--moss-soft); }
    .attachmentButton:active { transform: scale(.96); }
    .attachmentButton svg { width: 13px; height: 13px; flex: 0 0 auto; }
    .captureHint { overflow: hidden; color: var(--faint); font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
    .primaryButton {
      display: inline-flex;
      min-width: 76px;
      height: 40px;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 0 12px;
      color: white;
      background: var(--moss);
      border: 1px solid color-mix(in srgb, var(--moss) 88%, black);
      border-radius: 8px;
      box-shadow: inset 0 1px 0 rgb(255 255 255 / 14%), 0 2px 5px rgb(48 66 37 / 16%);
      cursor: pointer;
      font-size: 11px;
      font-weight: 680;
      transition: background-color 130ms ease, box-shadow 130ms ease, transform 90ms ease, opacity 130ms ease;
    }
    .primaryButton:hover:not(:disabled) { background: var(--moss-hover); box-shadow: inset 0 1px 0 rgb(255 255 255 / 12%), 0 4px 9px rgb(48 66 37 / 20%); }
    .primaryButton:active:not(:disabled) { transform: scale(.96); }
    .primaryButton:disabled { opacity: .48; cursor: default; }
    .primaryButton svg { width: 15px; height: 15px; }
    .smartButton {
      display: inline-flex;
      min-width: 64px;
      height: 40px;
      align-items: center;
      justify-content: center;
      padding: 0 11px;
      color: var(--moss);
      background: var(--moss-soft);
      border: 1px solid color-mix(in srgb, var(--moss) 18%, var(--line));
      border-radius: 8px;
      cursor: pointer;
      font-size: 10.5px;
      font-weight: 680;
      transition: background-color 130ms ease, transform 90ms ease, opacity 130ms ease;
    }
    .smartButton:hover:not(:disabled) { background: color-mix(in srgb, var(--moss-soft) 82%, var(--moss) 8%); }
    .smartButton:active:not(:disabled) { transform: scale(.96); }
    .smartButton:disabled { opacity: .48; cursor: default; }

    .statusTabs {
      display: flex;
      gap: 5px;
      padding: 3px;
      overflow-x: auto;
      background: color-mix(in srgb, var(--ink) 4%, transparent);
      border-radius: 11px;
      scrollbar-width: none;
    }
    .statusTabs::-webkit-scrollbar { display: none; }
    .statusTab {
      display: inline-flex;
      min-width: 62px;
      min-height: 40px;
      flex: 1 0 auto;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 0 9px;
      color: var(--muted);
      background: transparent;
      border: 0;
      border-radius: 8px;
      cursor: pointer;
      font-size: 10.5px;
      font-weight: 620;
      transition: color 130ms ease, background-color 130ms ease, box-shadow 130ms ease, transform 90ms ease;
    }
    .statusTab:hover { color: var(--ink); }
    .statusTab.active { color: var(--ink); background: var(--raised); box-shadow: 0 1px 3px rgb(28 35 25 / 9%); }
    .statusTab:active { transform: scale(.96); }
    .statusTab em {
      min-width: 19px;
      padding: 1px 5px;
      background: color-mix(in srgb, currentColor 8%, transparent);
      border-radius: 999px;
      font-size: 9px;
      font-style: normal;
      font-variant-numeric: tabular-nums;
    }

    .list { display: flex; flex-direction: column; gap: 8px; }
    .todo {
      position: relative;
      padding: 11px;
      background: var(--raised);
      border: 1px solid var(--line);
      border-radius: 12px;
      box-shadow: 0 1px 1px rgb(27 35 24 / 3%), 0 5px 16px rgb(27 35 24 / 4%);
      transition: border-color 140ms ease, box-shadow 140ms ease, transform 140ms ease, opacity 130ms ease;
    }
    .todo:hover { border-color: var(--line-strong); box-shadow: 0 2px 3px rgb(27 35 24 / 4%), 0 10px 24px rgb(27 35 24 / 7%); transform: translateY(-1px); }
    .todo.busy { opacity: .62; pointer-events: none; }
    .todoTop { display: flex; align-items: center; gap: 7px; }
    .dot { width: 7px; height: 7px; flex: 0 0 7px; border-radius: 50%; background: var(--faint); box-shadow: 0 0 0 3px color-mix(in srgb, var(--faint) 12%, transparent); }
    .dot.waiting { background: var(--amber); }
    .dot.queued { background: var(--blue); }
    .dot.running { background: var(--purple); }
    .dot.completed { background: var(--moss); }
    .dot.ended { background: var(--red); }
    .planName { min-width: 0; flex: 1; overflow: hidden; color: var(--muted); font-size: 9.5px; font-weight: 630; text-overflow: ellipsis; white-space: nowrap; }
    .statusSelect {
      height: 28px;
      max-width: 84px;
      padding: 0 7px;
      color: var(--muted);
      background: color-mix(in srgb, var(--ink) 4%, transparent);
      border: 1px solid color-mix(in srgb, var(--ink) 6%, var(--line));
      border-radius: 7px;
      outline: 0;
      cursor: pointer;
      font-size: 9.5px;
    }
    .todo h3 { margin: 8px 0 0; font-size: 13px; font-weight: 670; letter-spacing: -.012em; line-height: 1.4; overflow-wrap: anywhere; text-wrap: pretty; }
    .todo p { display: -webkit-box; margin: 5px 0 0; overflow: hidden; color: var(--muted); font-size: 10.5px; line-height: 1.5; -webkit-box-orient: vertical; -webkit-line-clamp: 2; text-wrap: pretty; }
    .todoFooter { display: flex; min-height: 31px; align-items: flex-end; gap: 6px; margin-top: 8px; padding-top: 8px; border-top: 1px solid color-mix(in srgb, var(--line) 68%, transparent); }
    .todoFooter time { flex: 1; color: var(--faint); font-size: 9px; font-variant-numeric: tabular-nums; }
    .smallButton {
      display: inline-flex;
      min-height: 30px;
      align-items: center;
      justify-content: center;
      gap: 5px;
      padding: 0 9px;
      color: var(--muted);
      background: color-mix(in srgb, var(--ink) 4%, transparent);
      border: 1px solid color-mix(in srgb, var(--ink) 6%, var(--line));
      border-radius: 7px;
      cursor: pointer;
      font-size: 9.5px;
      font-weight: 670;
      transition: color 130ms ease, background-color 130ms ease, transform 90ms ease;
    }
    .smallButton:hover { color: var(--ink); background: color-mix(in srgb, var(--ink) 7%, transparent); }
    .smallButton:active { transform: scale(.96); }
    .smallButton.run { color: white; background: var(--blue); border-color: color-mix(in srgb, var(--blue) 82%, black); }
    .smallButton.done { color: var(--moss); background: var(--moss-soft); border-color: color-mix(in srgb, var(--moss) 18%, var(--line)); }
    .smallButton svg { width: 13px; height: 13px; }

    .empty {
      display: grid;
      min-height: 164px;
      place-items: center;
      align-content: center;
      gap: 8px;
      padding: 20px;
      color: var(--muted);
      border: 1px dashed var(--line-strong);
      border-radius: 12px;
      text-align: center;
    }
    .empty svg { width: 25px; height: 25px; color: var(--faint); }
    .empty strong { color: var(--ink); font-size: 12px; }
    .empty p { max-width: 260px; margin: 0; font-size: 10px; text-wrap: pretty; }
    .loading { min-height: 190px; }
    .spinner { width: 20px; height: 20px; border: 2px solid var(--line); border-top-color: var(--moss); border-radius: 50%; animation: spin 850ms linear infinite; }

    .planForm {
      display: none;
      gap: 9px;
      padding: 12px;
      background: var(--raised);
      border: 1px solid var(--line);
      border-radius: 13px;
      box-shadow: var(--shadow);
    }
    .planForm.open { display: grid; }
    .planForm header { display: flex; align-items: center; justify-content: space-between; }
    .planForm h2 { margin: 0; font-size: 14px; letter-spacing: -.02em; text-wrap: balance; }
    .planForm label { display: grid; gap: 5px; }
    .planForm label span { color: var(--muted); font-size: 9.5px; font-weight: 650; }
    .planForm input, .planForm select {
      width: 100%;
      height: 40px;
      padding: 0 10px;
      color: var(--ink);
      background: color-mix(in srgb, var(--ink) 3%, var(--raised));
      border: 1px solid var(--line);
      border-radius: 8px;
      outline: 0;
    }
    .planForm select { appearance: none; cursor: pointer; }
    .planForm input:focus, .planForm select:focus { border-color: color-mix(in srgb, var(--moss) 42%, var(--line)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--moss) 9%, transparent); }
    .planFormGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
    .planFormGrid .wide { grid-column: 1 / -1; }
    .projectPicker { position: relative; }
    .projectPicker .chevron { position: absolute; right: 10px; bottom: 13px; width: 14px; pointer-events: none; color: var(--muted); }
    .manualProjectFields { display: none; grid-column: 1 / -1; grid-template-columns: 1fr 1fr; gap: 9px; }
    .manualProjectFields.open { display: grid; }
    .formActions { display: flex; justify-content: flex-end; gap: 7px; padding-top: 2px; }

    .toast {
      position: fixed;
      z-index: 20;
      right: 18px;
      bottom: 18px;
      max-width: min(320px, calc(100vw - 36px));
      padding: 10px 12px;
      color: white;
      background: #283124;
      border-radius: 10px;
      box-shadow: 0 16px 42px rgb(20 25 18 / 24%);
      opacity: 0;
      transform: translateY(8px);
      pointer-events: none;
      transition: opacity 150ms ease, transform 150ms ease;
      text-wrap: pretty;
    }
    .toast.show { opacity: 1; transform: translateY(0); }
    .toast.error { background: #743e39; }

    @keyframes spin { to { transform: rotate(360deg); } }

    @media (min-width: 720px) {
      .app { padding: 14px; }
      .shell { min-height: calc(100vh - 28px); }
      .content { grid-template-columns: minmax(210px, .7fr) minmax(360px, 1.3fr); align-items: start; }
      .lane, .binding, .capture, .planForm { grid-column: 1; }
      .statusTabs, .list, .empty, .loading { grid-column: 2; }
      .statusTabs { grid-row: 1; }
      .list, .empty, .loading { grid-row: 2 / span 5; }
      .newPlanButton { min-width: 92px; }
    }

    @media (max-width: 430px) {
      .app { padding: 0; }
      .shell { min-height: 100vh; border-width: 0; border-radius: 0; box-shadow: none; }
      .topbar, .content { padding-inline: 10px; }
      .newPlanButton span { display: none; }
      .capture { grid-template-columns: minmax(0, 1fr) 44px; }
      .capture:has(.captureActions) { grid-template-columns: minmax(0, 1fr) auto; }
      .captureActions { flex-direction: column; }
      .captureActions .primaryButton, .captureActions .smartButton { min-width: 52px; height: 34px; padding: 0 8px; font-size: 9px; }
      .planFormGrid { grid-template-columns: 1fr; }
      .planFormGrid .wide { grid-column: auto; }
      .manualProjectFields { grid-column: auto; grid-template-columns: 1fr; }
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #171a16;
        --surface: #1d211c;
        --raised: #242923;
        --ink: #edf1e9;
        --muted: #a6ada1;
        --faint: #7f877a;
        --line: #343a32;
        --line-strong: #444c40;
        --moss: #8cab74;
        --moss-hover: #7b9c65;
        --moss-soft: #2c3926;
        --shadow: 0 1px 1px rgb(0 0 0 / 16%), 0 10px 28px rgb(0 0 0 / 20%);
      }
      .mark { background: #536d45; }
      .primaryButton { color: #11160f; }
    }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { scroll-behavior: auto !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
    }
  </style>
</head>
<body>
  <div class="app">
    <section class="shell">
      <header class="topbar">
        <div class="mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="7" height="7" rx="2"/><rect x="14" y="4" width="7" height="7" rx="2"/><rect x="3" y="15" width="7" height="5" rx="2"/><rect x="14" y="15" width="7" height="5" rx="2"/></svg>
        </div>
        <div class="title"><strong>Plan Orchestrator</strong><span id="subtitle">任务控制台</span></div>
        <div class="topActions">
          <button class="iconButton" id="refreshButton" type="button" aria-label="刷新" title="刷新">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>
          </button>
          <button class="iconButton" id="floatButton" type="button" aria-label="浮动到对话旁" title="浮动到对话旁">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M12 10h6v6h-6z"/></svg>
          </button>
          <button class="iconButton" id="fullscreenButton" type="button" aria-label="全屏" title="全屏">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></svg>
          </button>
        </div>
      </header>
      <main class="content" id="content">
        <div class="loading empty"><div class="spinner"></div><p>正在读取 Plan 和 Todo…</p></div>
      </main>
    </section>
  </div>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>
  <script>
    (function () {
      "use strict";

      var STATUS = [
        { id: "all", label: "全部" },
        { id: "someday", label: "不急" },
        { id: "waiting", label: "等待" },
        { id: "queued", label: "待开始" },
        { id: "running", label: "进行中" },
        { id: "completed", label: "已完成" },
        { id: "ended", label: "已归档" }
      ];
      var MOVABLE_STATUS = [
        { id: "someday", label: "不急" },
        { id: "waiting", label: "等待" },
        { id: "queued", label: "待开始" },
        { id: "ended", label: "已归档" }
      ];
      var state = {
        overview: null,
        selectedPlanId: "",
        selectedStatus: "all",
        planFormOpen: false,
        busyTodoId: "",
        captureFile: null,
        draftTodo: ""
      };
      var pending = new Map();
      var nextRequestId = 1;
      var toastTimer;

      function icon(name) {
        var icons = {
          plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
          send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 12 14-7-7 14-2-7-5-2Z"/></svg>',
          inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 5h16l-2 14H6L4 5Z"/><path d="M4.8 13H9l1.5 2h3L15 13h4.2"/></svg>',
          play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m8 5 11 7-11 7V5Z"/></svg>',
          check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 12 4 4L19 6"/></svg>',
          arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 17 17 7M9 7h8v8"/></svg>',
          image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m4 17 5-4 3 3 3-2 5 4"/></svg>',
          folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 6h7l2 2h9v10H3V6Z"/></svg>',
          chevron: '<svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m7 10 5 5 5-5"/></svg>'
        };
        return icons[name] || "";
      }

      function escapeHtml(value) {
        return String(value == null ? "" : value)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");
      }

      function unwrap(payload) {
        if (!payload) return null;
        if (payload.result && payload.result.plans && payload.result.todos) return payload.result;
        if (payload.plans && payload.todos) return payload;
        if (payload.structuredContent) return unwrap(payload.structuredContent);
        if (payload.result) return unwrap(payload.result);
        if (payload.call_tool_result) return unwrap(payload.call_tool_result);
        if (payload.mcp_tool_result) return unwrap(payload.mcp_tool_result);
        return null;
      }

      function request(method, params) {
        var id = nextRequestId++;
        window.parent.postMessage({ jsonrpc: "2.0", id: id, method: method, params: params }, "*");
        return new Promise(function (resolve, reject) {
          pending.set(id, { resolve: resolve, reject: reject });
          window.setTimeout(function () {
            if (!pending.has(id)) return;
            pending.delete(id);
            reject(new Error("Codex UI bridge 请求超时"));
          }, 180000);
        });
      }

      function cleanToolArgs(args) {
        var source = args && typeof args === "object" ? args : {};
        return Object.keys(source).reduce(function (cleaned, key) {
          var value = source[key];
          if (value === undefined) return cleaned;
          if (value && typeof value === "object" && !Array.isArray(value)) {
            cleaned[key] = cleanToolArgs(value);
          } else {
            cleaned[key] = value;
          }
          return cleaned;
        }, {});
      }

      function callTool(name, args) {
        var cleanArgs = cleanToolArgs(args);
        if (window.openai && typeof window.openai.callTool === "function") {
          return window.openai.callTool(name, cleanArgs);
        }
        return request("tools/call", { name: name, arguments: cleanArgs });
      }

      function toolValue(payload) {
        if (!payload) return null;
        if (payload.structuredContent && Object.prototype.hasOwnProperty.call(payload.structuredContent, "result")) {
          return payload.structuredContent.result;
        }
        if (Object.prototype.hasOwnProperty.call(payload, "result")) return payload.result;
        if (payload.call_tool_result) return toolValue(payload.call_tool_result);
        if (payload.mcp_tool_result) return toolValue(payload.mcp_tool_result);
        return null;
      }

      async function sendHostMessage(prompt, scrollToBottom) {
        var host = window.openai || {};
        var response;
        if (typeof host.sendFollowUpMessage === "function") {
          response = await host.sendFollowUpMessage({ prompt: prompt, scrollToBottom: scrollToBottom !== false });
        } else if (typeof host.sendMessage === "function") {
          response = await host.sendMessage({ role: "user", content: [{ type: "text", text: prompt }] });
        } else {
          response = await request("ui/message", { role: "user", content: [{ type: "text", text: prompt }] });
        }
        if (response && response.isError === true) throw new Error("Codex 宿主没有接收这条消息");
        return response;
      }

      function friendlyError(error) {
        var message = error && error.message ? error.message : String(error || "操作失败");
        if (/invalid mcp tool call params/i.test(message)) return "提交内容不完整，请刷新后再试";
        if (/Completion requires/i.test(message)) return "请先开始这项 Todo，再标记完成";
        if (/Bind this Plan to the current Codex task/i.test(message)) return "请先把 Plan 绑定到当前 Codex task";
        if (/visible message was not found/i.test(message)) return "消息已发送，但 Plan 绑定的不是当前 task；请重新绑定后再试";
        if (/Plan not found/i.test(message)) return "这个 Plan 已不存在，请刷新后重试";
        if (/thread.*not found|rollout.*not found/i.test(message)) return "找不到这个 Codex 任务，请重新选择";
        if (/required/i.test(message)) return "请把必填内容补完整";
        return message;
      }

      function showToast(message, isError) {
        var toast = document.getElementById("toast");
        toast.textContent = message;
        toast.className = isError ? "toast show error" : "toast show";
        window.clearTimeout(toastTimer);
        toastTimer = window.setTimeout(function () { toast.className = "toast"; }, 2600);
      }

      function timeAgo(value) {
        var stamp = new Date(value).getTime();
        if (!Number.isFinite(stamp)) return "";
        var minutes = Math.max(0, Math.floor((Date.now() - stamp) / 60000));
        if (minutes < 1) return "刚刚";
        if (minutes < 60) return minutes + " 分钟前";
        var hours = Math.floor(minutes / 60);
        if (hours < 24) return hours + " 小时前";
        return Math.floor(hours / 24) + " 天前";
      }

      function selectedPlan() {
        if (!state.overview || !state.selectedPlanId) return null;
        return state.overview.plans.find(function (plan) { return plan.id === state.selectedPlanId; }) || null;
      }

      function visibleTodos() {
        if (!state.overview) return [];
        return state.overview.todos.filter(function (todo) {
          if (state.selectedPlanId && todo.planId !== state.selectedPlanId) return false;
          if (state.selectedStatus !== "all" && todo.status !== state.selectedStatus) return false;
          if (state.selectedStatus === "all" && todo.status === "ended") return false;
          return true;
        });
      }

      function statusCount(status) {
        if (!state.overview) return 0;
        return state.overview.todos.filter(function (todo) {
          if (state.selectedPlanId && todo.planId !== state.selectedPlanId) return false;
          if (status === "all") return todo.status !== "ended";
          return todo.status === status;
        }).length;
      }

      function taskOptionsForRoot(rootPath, selectedThreadId) {
        var allTasks = state.overview.codexThreads || [];
        var tasks = allTasks.filter(function (task) { return task.cwd === rootPath; });
        if (selectedThreadId && !tasks.some(function (task) { return task.id === selectedThreadId; })) {
          var selectedTask = allTasks.find(function (task) { return task.id === selectedThreadId; });
          if (selectedTask) tasks.unshift(selectedTask);
        }
        var options = '<option value="">新建一个 Codex 任务</option>' + tasks.map(function (task) {
          return '<option value="' + escapeHtml(task.id) + '" ' + (task.id === selectedThreadId ? "selected" : "") + '>' + escapeHtml(task.name) + '</option>';
        }).join("");
        if (selectedThreadId && !tasks.length) {
          options += '<option value="' + escapeHtml(selectedThreadId) + '" selected>继续已选任务</option>';
        }
        return options;
      }

      function renderPlanForm() {
        var projects = state.overview.codexProjects || [];
        var defaultProject = projects[0] || null;
        var projectOptions = projects.map(function (project) {
          return '<option value="' + escapeHtml(project.rootPath) + '">' + escapeHtml(project.name) + '</option>';
        }).join("") + '<option value="__manual__">其他项目…</option>';
        var taskOptions = taskOptionsForRoot(defaultProject ? defaultProject.rootPath : "", null);
        var manual = !defaultProject;
        return '<form class="planForm ' + (state.planFormOpen ? "open" : "") + '" id="planForm">' +
          '<header><h2>新建 Plan</h2><button class="iconButton" id="closePlanForm" type="button" aria-label="关闭">×</button></header>' +
          '<div class="planFormGrid">' +
            '<label><span>名称</span><input name="name" required placeholder="例如：登录重构" /></label>' +
            '<label class="projectPicker"><span>项目</span><select id="codexProjectSelect" name="codexProjectRoot" aria-label="选择项目">' + projectOptions + '</select>' + icon("chevron") + '</label>' +
            '<label class="projectPicker wide"><span>发送到</span><select id="codexTaskSelect" name="threadId" aria-label="选择 Codex 任务">' + taskOptions + '</select>' + icon("chevron") + '</label>' +
            '<div class="manualProjectFields ' + (manual ? "open" : "") + '" id="manualProjectFields">' +
              '<label><span>项目名称</span><input name="manualProjectName" ' + (manual ? "required" : "") + ' placeholder="Project A" /></label>' +
              '<label><span>项目位置</span><input name="manualProjectRoot" ' + (manual ? "required" : "") + ' placeholder="/Users/me/project-a" /></label>' +
            '</div>' +
          '</div>' +
          '<div class="formActions"><button class="smallButton" id="cancelPlan" type="button">取消</button><button class="primaryButton" type="submit">创建 Plan</button></div>' +
        '</form>';
      }

      function renderTodo(todo, plans) {
        var plan = plans.find(function (candidate) { return candidate.id === todo.planId; });
        var choices = MOVABLE_STATUS.slice();
        if (!choices.some(function (status) { return status.id === todo.status; })) {
          var currentStatus = STATUS.find(function (status) { return status.id === todo.status; });
          if (currentStatus) choices.push(currentStatus);
        }
        var canQueue = Boolean(todo.planId || state.selectedPlanId);
        var options = choices.map(function (status) {
          var disabled = status.id === "queued" && !canQueue ? "disabled" : "";
          return '<option value="' + status.id + '" ' + (status.id === todo.status ? "selected" : "") + ' ' + disabled + '>' + status.label + '</option>';
        }).join("");
        var action = "";
        if (todo.status === "queued") {
          action = '<button class="smallButton run" type="button" data-action="start" data-id="' + escapeHtml(todo.id) + '" title="作为当前 Codex task 的可见消息启动">' + icon("play") + '当前 task 启动</button>';
        } else if (todo.status === "running") {
          action = '<button class="smallButton done" data-action="complete" data-id="' + escapeHtml(todo.id) + '">' + icon("check") + '完成</button>';
        } else if (todo.status === "completed" && todo.completionThreadId) {
          action = '<button class="smallButton" data-action="receipt" data-id="' + escapeHtml(todo.id) + '">' + icon("arrow") + '查看结果</button>';
        }
        return '<article class="todo ' + (state.busyTodoId === todo.id ? "busy" : "") + '">' +
          '<div class="todoTop"><span class="dot ' + escapeHtml(todo.status) + '"></span><span class="planName">' + escapeHtml(plan ? plan.name : "未分组") + '</span>' +
          '<select class="statusSelect" data-action="status" data-id="' + escapeHtml(todo.id) + '" aria-label="移动 Todo 状态">' + options + '</select></div>' +
          '<h3>' + escapeHtml(todo.title) + '</h3>' +
          (todo.description ? '<p>' + escapeHtml(todo.description) + '</p>' : '') +
          '<footer class="todoFooter"><time datetime="' + escapeHtml(todo.updatedAt) + '">' + escapeHtml(timeAgo(todo.updatedAt)) + '</time>' + action + '</footer>' +
        '</article>';
      }

      function render() {
        if (!state.overview) return;
        var plans = state.overview.plans || [];
        var currentPlan = selectedPlan();
        var todos = visibleTodos();
        var planOptions = '<option value="">全部 Todo</option>' + plans.map(function (plan) {
          return '<option value="' + escapeHtml(plan.id) + '" ' + (plan.id === state.selectedPlanId ? "selected" : "") + '>' + escapeHtml(plan.projectName + " · " + plan.name) + '</option>';
        }).join("");
        var tabs = STATUS.map(function (status) {
          return '<button class="statusTab ' + (status.id === state.selectedStatus ? "active" : "") + '" type="button" data-status="' + status.id + '"><span>' + status.label + '</span><em>' + statusCount(status.id) + '</em></button>';
        }).join("");
        var list = todos.length
          ? '<section class="list">' + todos.map(function (todo) { return renderTodo(todo, plans); }).join("") + '</section>'
          : '<section class="empty">' + icon("inbox") + '<strong>这里暂时没有 Todo</strong><p>可以在上方直接添加一项。</p></section>';
        var binding = currentPlan
          ? '<section class="binding"><strong>' + escapeHtml(currentPlan.projectName) + '</strong><span>' + escapeHtml(currentPlan.name) + '</span><p class="bindingNote">插件启动会写入当前正在查看的 task；这里需绑定同一个 task，才能保存准确的完成链接。</p><label class="routePicker"><span>Plan 绑定</span><select id="planThreadSelect" aria-label="选择与当前 Plan 绑定的 Codex task">' + taskOptionsForRoot(currentPlan.projectRoot, currentPlan.threadId) + '</select></label></section>'
          : '';

        document.getElementById("subtitle").textContent = currentPlan ? currentPlan.projectName + " / " + currentPlan.name : "全部 Todo";
        document.getElementById("content").innerHTML =
          '<section class="lane"><label class="laneSelect">' + icon("folder") + '<select id="planSelect" aria-label="选择 Plan">' + planOptions + '</select>' + icon("chevron") + '</label>' +
          '<button class="newPlanButton" id="newPlanButton" type="button">' + icon("plus") + '<span>新建 Plan</span></button></section>' +
          binding +
          '<form class="capture" id="captureForm"><div class="captureMain"><input type="text" id="todoTitle" name="title" autocomplete="off" value="' + escapeHtml(state.draftTodo) + '" placeholder="写下一件事…" aria-label="Todo 内容" />' +
          '<div class="captureMeta"><label class="attachmentButton ' + (state.captureFile ? "active" : "") + '">' + icon("image") + '<span>' + escapeHtml(state.captureFile ? state.captureFile.name : "附截图") + '</span><input id="captureFile" type="file" accept="image/png,image/jpeg,image/webp" hidden /></label><span class="captureHint">直接添加，或让它帮你整理</span></div></div>' +
          '<div class="captureActions"><button class="smartButton" id="organizeTodoButton" type="button">整理</button><button class="primaryButton" type="submit" ' + (state.captureFile ? 'disabled title="附有截图时请使用整理"' : '') + '>' + icon("plus") + '添加</button></div></form>' +
          renderPlanForm() +
          '<nav class="statusTabs" aria-label="Todo 状态">' + tabs + '</nav>' +
          list;

        bindContentEvents();
        notifyHeight();
      }

      function bindContentEvents() {
        var planSelect = document.getElementById("planSelect");
        if (planSelect) planSelect.addEventListener("change", function (event) {
          state.selectedPlanId = event.target.value;
          render();
          persistUiState();
        });
        document.querySelectorAll("[data-status]").forEach(function (button) {
          button.addEventListener("click", function () {
            state.selectedStatus = button.getAttribute("data-status") || "all";
            render();
            persistUiState();
          });
        });
        var newPlanButton = document.getElementById("newPlanButton");
        if (newPlanButton) newPlanButton.addEventListener("click", function () { state.planFormOpen = !state.planFormOpen; render(); });
        ["closePlanForm", "cancelPlan"].forEach(function (id) {
          var button = document.getElementById(id);
          if (button) button.addEventListener("click", function () { state.planFormOpen = false; render(); });
        });
        var captureForm = document.getElementById("captureForm");
        if (captureForm) captureForm.addEventListener("submit", addTodo);
        var todoTitle = document.getElementById("todoTitle");
        if (todoTitle) todoTitle.addEventListener("input", function (event) { state.draftTodo = event.target.value; });
        var organizeTodoButton = document.getElementById("organizeTodoButton");
        if (organizeTodoButton) organizeTodoButton.addEventListener("click", organizeTodos);
        var captureFile = document.getElementById("captureFile");
        if (captureFile) captureFile.addEventListener("change", function (event) {
          state.captureFile = event.target.files && event.target.files[0] ? event.target.files[0] : null;
          render();
        });
        var planForm = document.getElementById("planForm");
        if (planForm) planForm.addEventListener("submit", createPlan);
        var codexProjectSelect = document.getElementById("codexProjectSelect");
        if (codexProjectSelect) codexProjectSelect.addEventListener("change", syncProjectSelection);
        var manualProjectRoot = document.querySelector('[name="manualProjectRoot"]');
        if (manualProjectRoot) manualProjectRoot.addEventListener("input", function (event) { updateTaskOptions(event.target.value); });
        var planThreadSelect = document.getElementById("planThreadSelect");
        if (planThreadSelect) planThreadSelect.addEventListener("change", routePlan);
        document.querySelectorAll('[data-action="status"]').forEach(function (select) {
          select.addEventListener("change", function () { moveTodo(select.getAttribute("data-id"), select.value); });
        });
        document.querySelectorAll('[data-action="start"]').forEach(function (button) {
          button.addEventListener("click", function () { runTodo(button.getAttribute("data-id")); });
        });
        document.querySelectorAll('[data-action="complete"]').forEach(function (button) {
          button.addEventListener("click", function () { completeTodo(button.getAttribute("data-id")); });
        });
        document.querySelectorAll('[data-action="receipt"]').forEach(function (button) {
          button.addEventListener("click", function () { openReceipt(button.getAttribute("data-id")); });
        });
      }

      function syncProjectSelection(event) {
        var select = event && event.currentTarget ? event.currentTarget : document.getElementById("codexProjectSelect");
        if (!select || !state.overview) return;
        var project = (state.overview.codexProjects || []).find(function (candidate) { return candidate.rootPath === select.value; }) || null;
        var manualFields = document.getElementById("manualProjectFields");
        var manualInputs = manualFields ? manualFields.querySelectorAll("input") : [];
        if (manualFields) manualFields.classList.toggle("open", !project);
        manualInputs.forEach(function (input) { input.required = !project; });
        updateTaskOptions(project ? project.rootPath : "");
      }

      function updateTaskOptions(rootPath) {
        var select = document.getElementById("codexTaskSelect");
        if (select) select.innerHTML = taskOptionsForRoot(String(rootPath || "").trim(), null);
      }

      async function refresh(silent) {
        try {
          var response = await callTool("get_overview", {});
          var overview = unwrap(response);
          if (!overview) throw new Error("未收到任务数据");
          state.overview = overview;
          render();
          if (!silent) showToast("已刷新");
        } catch (error) {
          showToast(friendlyError(error), true);
        }
      }

      async function addTodo(event) {
        event.preventDefault();
        var text = state.draftTodo.trim();
        if (!text) {
          showToast("先写下一件事", true);
          return;
        }
        if (state.captureFile) {
          showToast("附有截图时请使用整理", true);
          return;
        }
        var button = event.currentTarget.querySelector('[type="submit"]');
        button.disabled = true;
        try {
          var payload = { title: text, status: state.selectedPlanId ? "queued" : "someday" };
          if (state.selectedPlanId) payload.planId = state.selectedPlanId;
          await callTool("create_todo", payload);
          state.draftTodo = "";
          await refresh(true);
          showToast(state.selectedPlanId ? "已添加到当前 Plan" : "Todo 已添加");
        } catch (error) {
          showToast(friendlyError(error), true);
        } finally {
          button.disabled = false;
        }
      }

      async function organizeTodos() {
        var text = state.draftTodo.trim();
        if (!text && !state.captureFile) {
          showToast("先写下一件事或附一张截图", true);
          return;
        }
        var button = document.getElementById("organizeTodoButton");
        button.disabled = true;
        try {
          var image;
          if (state.captureFile) {
            if (!window.openai || typeof window.openai.uploadFile !== "function" || typeof window.openai.getFileDownloadUrl !== "function") {
              throw new Error("当前版本暂不支持截图上传");
            }
            var uploaded = await window.openai.uploadFile(state.captureFile);
            if (!uploaded || !uploaded.fileId) throw new Error("截图上传失败，请重试");
            var download = await window.openai.getFileDownloadUrl({ fileId: uploaded.fileId });
            var downloadUrl = download && (download.downloadUrl || download.download_url);
            if (!downloadUrl) throw new Error("截图读取失败，请重试");
            image = {
              download_url: downloadUrl,
              file_id: uploaded.fileId,
              mime_type: state.captureFile.type,
              file_name: state.captureFile.name
            };
          }
          await callTool("capture_todos", { text: text, image: image, planId: state.selectedPlanId || null });
          state.draftTodo = "";
          state.captureFile = null;
          await refresh(true);
          showToast(state.selectedPlanId ? "已整理并加入当前 Plan" : "已整理完成");
        } catch (error) {
          showToast(friendlyError(error), true);
        } finally {
          button.disabled = false;
        }
      }

      async function createPlan(event) {
        event.preventDefault();
        var form = new FormData(event.currentTarget);
        var selectedRoot = String(form.get("codexProjectRoot") || "");
        var codexProject = (state.overview.codexProjects || []).find(function (candidate) { return candidate.rootPath === selectedRoot; }) || null;
        var payload = {
          name: String(form.get("name") || "").trim(),
          codexProjectId: codexProject ? codexProject.id : null,
          projectName: codexProject ? codexProject.name : String(form.get("manualProjectName") || "").trim(),
          projectRoot: codexProject ? codexProject.rootPath : String(form.get("manualProjectRoot") || "").trim(),
          branch: codexProject && codexProject.branch ? codexProject.branch : "main"
        };
        var threadId = String(form.get("threadId") || "").trim();
        if (threadId) payload.threadId = threadId;
        if (!payload.name || !payload.projectName || !payload.projectRoot) {
          showToast("请把名称和项目补完整", true);
          return;
        }
        var button = event.currentTarget.querySelector('[type="submit"]');
        button.disabled = true;
        try {
          var response = await callTool("create_plan", payload);
          var created = response && response.structuredContent && response.structuredContent.result;
          if (created && created.id) {
            state.overview.plans = [created].concat((state.overview.plans || []).filter(function (plan) { return plan.id !== created.id; }));
            state.selectedPlanId = created.id;
          }
          state.planFormOpen = false;
          render();
          showToast("Plan 已创建");
          void refresh(true);
        } catch (error) {
          showToast(friendlyError(error), true);
        } finally {
          button.disabled = false;
        }
      }

      async function routePlan(event) {
        if (!state.selectedPlanId) return;
        var select = event.currentTarget;
        var threadId = select.value || null;
        select.disabled = true;
        try {
          var response = await callTool("set_plan_thread", {
            planId: state.selectedPlanId,
            threadId: threadId
          });
          var updated = response && response.structuredContent && response.structuredContent.result;
          state.overview.plans = (state.overview.plans || []).map(function (plan) {
            if (plan.id !== state.selectedPlanId) return plan;
            return updated && updated.id ? updated : Object.assign({}, plan, { threadId: threadId });
          });
          render();
          showToast(threadId ? "后续 Todo 会发送到所选任务" : "会在首次启动时新建任务");
          void refresh(true);
        } catch (error) {
          showToast(friendlyError(error), true);
          await refresh(true);
        } finally {
          if (select.isConnected) select.disabled = false;
        }
      }

      async function moveTodo(todoId, status) {
        if (!todoId) return;
        var todo = state.overview.todos.find(function (item) { return item.id === todoId; });
        if (!todo) return;
        var planId = todo.planId || state.selectedPlanId || null;
        if (status === "queued" && !planId) {
          showToast("进入队列前请先选择一个 Plan", true);
          render();
          return;
        }
        state.busyTodoId = todoId;
        render();
        try {
          await callTool("set_todo_status", { todoId: todoId, status: status, planId: planId });
          await refresh(true);
          showToast("Todo 状态已更新");
        } catch (error) {
          showToast(friendlyError(error), true);
          await refresh(true);
        } finally {
          state.busyTodoId = "";
          render();
        }
      }

      async function runTodo(todoId) {
        if (!todoId) return;
        state.busyTodoId = todoId;
        render();
        try {
          var preparedResponse = await callTool("prepare_current_todo", { todoId: todoId });
          var prepared = toolValue(preparedResponse);
          if (!prepared || !prepared.prompt || !prepared.marker) throw new Error("未收到 Todo 启动信息");
          await sendHostMessage(prepared.prompt, true);
          await callTool("register_current_todo", { todoId: todoId, marker: prepared.marker });
          await refresh(true);
          showToast("已发送到当前 Codex task");
        } catch (error) {
          showToast(friendlyError(error), true);
          await refresh(true);
        } finally {
          state.busyTodoId = "";
          render();
        }
      }

      async function completeTodo(todoId) {
        if (!todoId) return;
        state.busyTodoId = todoId;
        render();
        try {
          await callTool("complete_todo", { todoId: todoId });
          await refresh(true);
          showToast("已完成");
        } catch (error) {
          showToast(friendlyError(error), true);
          await refresh(true);
        } finally {
          state.busyTodoId = "";
          render();
        }
      }

      async function openReceipt(todoId) {
        var todo = state.overview.todos.find(function (item) { return item.id === todoId; });
        if (!todo) return;
        var prompt = "请打开 Todo「" + todo.title + "」的完成记录。taskId=" + todo.completionThreadId + "，turnId=" + todo.completionTurnId;
        try {
          await sendHostMessage(prompt, false);
          showToast("已请求打开完成记录");
        } catch (error) {
          showToast(friendlyError(error), true);
        }
      }

      function persistUiState() {
        if (window.openai && typeof window.openai.setWidgetState === "function") {
          window.openai.setWidgetState({ selectedPlanId: state.selectedPlanId, selectedStatus: state.selectedStatus });
        }
      }

      function restoreUiState() {
        var saved = window.openai && window.openai.widgetState;
        if (!saved) return;
        if (typeof saved.selectedPlanId === "string") state.selectedPlanId = saved.selectedPlanId;
        if (typeof saved.selectedStatus === "string") state.selectedStatus = saved.selectedStatus;
      }

      function notifyHeight() {
        if (window.openai && typeof window.openai.notifyIntrinsicHeight === "function") {
          window.openai.notifyIntrinsicHeight(document.documentElement.scrollHeight);
        }
      }

      window.addEventListener("message", function (event) {
        if (event.source !== window.parent) return;
        var message = event.data;
        if (!message || message.jsonrpc !== "2.0") return;
        if (message.id !== undefined && pending.has(message.id)) {
          var requestState = pending.get(message.id);
          pending.delete(message.id);
          if (message.error) requestState.reject(new Error(message.error.message || "工具调用失败"));
          else requestState.resolve(message.result);
          return;
        }
        if (message.method === "ui/notifications/tool-result") {
          var overview = unwrap(message.params);
          if (overview) {
            state.overview = overview;
            render();
          }
        }
      }, { passive: true });

      document.getElementById("refreshButton").addEventListener("click", function () { refresh(false); });
      document.getElementById("floatButton").addEventListener("click", function () {
        if (window.openai && typeof window.openai.requestDisplayMode === "function") {
          window.openai.requestDisplayMode({ mode: "pip" });
        } else {
          showToast("当前宿主不支持画中画", true);
        }
      });
      document.getElementById("fullscreenButton").addEventListener("click", function () {
        if (window.openai && typeof window.openai.requestDisplayMode === "function") {
          window.openai.requestDisplayMode({ mode: "fullscreen" });
        } else {
          showToast("当前宿主不支持全屏组件", true);
        }
      });

      restoreUiState();
      var initial = unwrap(window.openai && window.openai.toolOutput);
      if (initial) {
        state.overview = initial;
        render();
      } else {
        window.setTimeout(function () {
          if (!state.overview) refresh(true);
        }, 350);
      }
    })();
  </script>
</body>
</html>`;
