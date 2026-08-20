import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { TODO_STATUSES } from "@plan-orchestrator/shared";
import { DATA_DIR } from "./config.js";
import { PlanService } from "./service.js";
import { PLAN_BOARD_HTML, PLAN_BOARD_URI } from "./widget.js";

const service = new PlanService();
const server = new McpServer({ name: "plan-orchestrator", version: "0.1.0" });
const WIDGET_CALLABLE_META = {
  ui: { visibility: ["app"] },
  "openai/widgetAccessible": true,
} as const;

function result(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: { result: value },
  };
}

const widgetFileSchema = z.object({
  download_url: z.string().url(),
  file_id: z.string().min(1),
  mime_type: z.string().optional(),
  file_name: z.string().optional(),
});

async function saveWidgetImage(file: z.infer<typeof widgetFileSchema>): Promise<string> {
  const allowedTypes: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
  };
  const extension = file.mime_type ? allowedTypes[file.mime_type] : undefined;
  if (!extension) throw new Error("Screenshot must be PNG, JPEG, or WebP");
  const response = await fetch(file.download_url);
  if (!response.ok) throw new Error(`Unable to download screenshot (${response.status})`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 10 * 1024 * 1024) throw new Error("Screenshot must be smaller than 10 MB");
  const captureDir = join(DATA_DIR, "captures");
  await mkdir(captureDir, { recursive: true });
  const path = join(captureDir, `${randomUUID()}${extension}`);
  await writeFile(path, bytes);
  return path;
}

server.registerResource("plan-board", PLAN_BOARD_URI, {}, async () => ({
  contents: [
    {
      uri: PLAN_BOARD_URI,
      mimeType: "text/html;profile=mcp-app",
      text: PLAN_BOARD_HTML,
      _meta: {
        ui: { prefersBorder: true },
        "openai/widgetDescription": "A compact interactive Plan and Todo board with project, branch, worktree, task, and status controls.",
        "openai/widgetPrefersBorder": true,
      },
    },
  ],
}));

server.registerTool(
  "get_overview",
  {
    title: "Get Plan Overview",
    description: "Return Codex projects plus the current Plans, Todos, status counts, and controller state without rendering UI.",
    inputSchema: {},
    outputSchema: { result: z.any() },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: WIDGET_CALLABLE_META,
  },
  async () => result(await service.overview()),
);

server.registerTool(
  "open_plan_board",
  {
    title: "Open Plan Board",
    description: "Render the interactive Plan Orchestrator UI. Use when the user asks to open, show, or manage the visual Plan/Todo board.",
    inputSchema: {},
    outputSchema: { result: z.any() },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: {
      ui: { resourceUri: PLAN_BOARD_URI },
      "openai/outputTemplate": PLAN_BOARD_URI,
      "openai/widgetAccessible": true,
      "openai/toolInvocation/invoking": "正在打开 Plan Board…",
      "openai/toolInvocation/invoked": "Plan Board 已打开",
    },
  },
  async () => result(await service.overview()),
);

server.registerTool(
  "capture_todos",
  {
    title: "Capture Todos",
    description: "Turn text or a screenshot into actionable Todos through the global projectless Capture task and its lightweight model.",
    inputSchema: {
      text: z.string().optional(),
      image: widgetFileSchema.optional(),
      planId: z.string().nullable().optional(),
    },
    outputSchema: { result: z.any() },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    _meta: {
      ...WIDGET_CALLABLE_META,
      "openai/fileParams": ["image"],
      "openai/toolInvocation/invoking": "正在整理 Todo…",
      "openai/toolInvocation/invoked": "Todo 已创建",
    },
  },
  async (input) => {
    const imagePath = input.image ? await saveWidgetImage(input.image) : null;
    return result(await service.capture(input.text ?? "", imagePath, input.planId));
  },
);

server.registerTool(
  "create_plan",
  {
    title: "Create Plan",
    description: "Create an execution lane that binds a project, worktree/branch, and Codex task.",
    inputSchema: {
      name: z.string().min(1),
      codexProjectId: z.string().nullable().optional(),
      projectName: z.string().min(1),
      projectRoot: z.string().min(1),
      branch: z.string().min(1),
      worktreePath: z.string().optional(),
      threadId: z.string().nullable().optional(),
    },
    _meta: WIDGET_CALLABLE_META,
  },
  async (input) => result(service.createPlan(input)),
);

server.registerTool(
  "list_codex_projects",
  {
    title: "List Codex Projects",
    description: "List local projects currently registered in Codex, including their root paths and active Git branches.",
    inputSchema: {},
    outputSchema: { result: z.any() },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  async () => result(await service.listCodexProjects()),
);

server.registerTool(
  "list_codex_threads",
  {
    title: "List Codex Tasks",
    description: "List recent Codex tasks that a Plan can send its Todos to.",
    inputSchema: {},
    outputSchema: { result: z.any() },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  async () => result(await service.codex.listThreads()),
);

server.registerTool(
  "list_plans",
  {
    title: "List Plans",
    description: "List Plan execution lanes and their project, branch, worktree, and task bindings.",
    inputSchema: {},
  },
  async () => result(service.listPlans()),
);

server.registerTool(
  "set_plan_thread",
  {
    title: "Set Plan Destination",
    description: "Choose the existing Codex task that receives Todos from a Plan, or clear it so a new task is created on first start.",
    inputSchema: {
      planId: z.string(),
      threadId: z.string().nullable(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    _meta: WIDGET_CALLABLE_META,
  },
  async (input) => result(service.updatePlan(input.planId, { threadId: input.threadId })),
);

server.registerTool(
  "ensure_plan_worktree",
  {
    title: "Ensure Plan Worktree",
    description: "Create the Plan's configured Git worktree and branch when the path does not exist.",
    inputSchema: {
      planId: z.string(),
      baseRef: z.string().optional(),
    },
  },
  async (input) => result(await service.ensureWorktree(input.planId, input.baseRef)),
);

server.registerTool(
  "create_todo",
  {
    title: "Create Todo",
    description: "Create one Todo directly without rewriting or splitting the user's text. Use queued only when planId is supplied.",
    inputSchema: {
      title: z.string().min(1),
      description: z.string().optional(),
      status: z.enum(TODO_STATUSES).optional(),
      planId: z.string().nullable().optional(),
    },
    _meta: WIDGET_CALLABLE_META,
  },
  async (input) => result(service.createTodo({ ...input, sourceType: "mcp" })),
);

server.registerTool(
  "list_todos",
  {
    title: "List Todos",
    description: "List Todos, optionally scoped to one Plan.",
    inputSchema: {
      planId: z.string().nullable().optional(),
      includeEnded: z.boolean().optional(),
    },
  },
  async (input) => result(service.listTodos(input.planId, input.includeEnded ?? false)),
);

server.registerTool(
  "set_todo_status",
  {
    title: "Set Todo Status",
    description: "Move a Todo between 不急, 等待, 队列中, 运行中, 完成, and 结束.",
    inputSchema: {
      todoId: z.string(),
      status: z.enum(TODO_STATUSES),
      planId: z.string().nullable().optional(),
    },
    _meta: WIDGET_CALLABLE_META,
  },
  async (input) => result(service.setStatus(input.todoId, input.status, input.planId)),
);

server.registerTool(
  "start_todo",
  {
    title: "Start Todo in Background",
    description: "Launch a queued Todo through the daemon in its Plan-bound Codex task. Use for CLI/background execution, not for a visible message in the currently open task.",
    inputSchema: { todoId: z.string() },
    _meta: WIDGET_CALLABLE_META,
  },
  async (input) => result(await service.launch(input.todoId)),
);

server.registerTool(
  "prepare_current_todo",
  {
    title: "Prepare Todo for Current Task",
    description: "Build the prompt and one-time marker used by the plugin UI to start a queued Todo as a visible message in the currently open Codex task.",
    inputSchema: { todoId: z.string() },
    outputSchema: { result: z.any() },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: WIDGET_CALLABLE_META,
  },
  async (input) => result(await service.prepareCurrentLaunch(input.todoId)),
);

server.registerTool(
  "register_current_todo",
  {
    title: "Register Current Todo Turn",
    description: "Match a plugin-authored execution marker inside the Plan-bound Codex task, record that exact visible turn, and move the Todo to running. Call at the start of a plugin-authored Todo turn.",
    inputSchema: {
      todoId: z.string(),
      marker: z.string().min(1),
    },
    outputSchema: { result: z.any() },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    _meta: WIDGET_CALLABLE_META,
  },
  async (input) => result(await service.registerCurrentLaunch(input.todoId, input.marker)),
);

server.registerTool(
  "complete_todo",
  {
    title: "Complete Todo",
    description: "Mark a Todo complete and save the exact Codex task and turn that produced the result.",
    inputSchema: {
      todoId: z.string(),
      threadId: z.string().optional(),
      turnId: z.string().optional(),
      summary: z.string().optional(),
    },
    _meta: WIDGET_CALLABLE_META,
  },
  async (input) => result(service.complete(input.todoId, input)),
);

server.registerTool(
  "get_todo_completion",
  {
    title: "Get Todo Completion",
    description: "Return completion details, including the exact taskId and turnId for routing.",
    inputSchema: { todoId: z.string() },
  },
  async (input) => result(service.getTodo(input.todoId)),
);

await server.connect(new StdioServerTransport());
