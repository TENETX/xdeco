import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { TODO_STATUSES } from "@whomi/shared";
import { DATA_DIR } from "./config.js";
import { WhomiService } from "./service.js";
import { WHOMI_HTML, WHOMI_URI } from "./widget.js";

const service = new WhomiService();
const server = new McpServer({ name: "whomi", version: "0.2.0" });
const WIDGET_CALLABLE_META = { ui: { visibility: ["app"] }, "openai/widgetAccessible": true } as const;

function result(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: { result: value },
  };
}

const widgetFileSchema = z.object({
  download_url: z.string().url(), file_id: z.string().min(1),
  mime_type: z.string().optional(), file_name: z.string().optional(),
});

async function saveWidgetImage(file: z.infer<typeof widgetFileSchema>): Promise<string> {
  const allowedTypes: Record<string, string> = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" };
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

server.registerResource("whomi", WHOMI_URI, {}, async () => ({
  contents: [{
    uri: WHOMI_URI,
    mimeType: "text/html;profile=mcp-app",
    text: WHOMI_HTML,
    _meta: {
      ui: { prefersBorder: true },
      "openai/widgetDescription": "A compact project and Todo queue. Ready Todos are sent to each project's Codex task one at a time.",
      "openai/widgetPrefersBorder": true,
    },
  }],
}));

server.registerTool("get_overview", {
  title: "Get whomi overview",
  description: "Return projects, Todos, queue states, Codex projects and destination tasks.",
  inputSchema: {}, outputSchema: { result: z.any() },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  _meta: WIDGET_CALLABLE_META,
}, async () => result(await service.overview()));

server.registerTool("open_whomi", {
  title: "Open whomi",
  description: "Open the interactive whomi project and Todo queue.",
  inputSchema: {}, outputSchema: { result: z.any() },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  _meta: {
    ui: { resourceUri: WHOMI_URI }, "openai/outputTemplate": WHOMI_URI,
    "openai/widgetAccessible": true,
    "openai/toolInvocation/invoking": "正在打开 whomi…", "openai/toolInvocation/invoked": "whomi 已打开",
  },
}, async () => result(await service.overview()));

server.registerTool("add_todo", {
  title: "Add Todo",
  description: "Add one Todo to whomi from any Codex conversation. Use projectId or an exact projectName. Default status is draft; use ready only when the user explicitly wants it queued for sequential sending.",
  inputSchema: {
    title: z.string().min(1),
    description: z.string().optional(),
    projectId: z.string().nullable().optional(),
    projectName: z.string().nullable().optional(),
    status: z.enum(TODO_STATUSES).optional(),
  },
  outputSchema: { result: z.any() },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  _meta: WIDGET_CALLABLE_META,
}, async (input) => result(service.addTodo({ ...input, sourceType: "mcp" })));

server.registerTool("capture_todos", {
  title: "Capture Todos",
  description: "Turn text or a screenshot into draft Todos. Captured items are never sent automatically.",
  inputSchema: { text: z.string().optional(), image: widgetFileSchema.optional(), projectId: z.string().nullable().optional() },
  outputSchema: { result: z.any() },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  _meta: { ...WIDGET_CALLABLE_META, "openai/fileParams": ["image"], "openai/toolInvocation/invoking": "正在整理 Todo…", "openai/toolInvocation/invoked": "Todo 已创建" },
}, async (input) => {
  const imagePath = input.image ? await saveWidgetImage(input.image) : null;
  return result(await service.capture(input.text ?? "", imagePath, input.projectId));
});

server.registerTool("create_project", {
  title: "Create Project",
  description: "Create a whomi project with a local root and optional destination Codex task.",
  inputSchema: {
    name: z.string().min(1), rootPath: z.string().min(1),
    targetThreadId: z.string().nullable().optional(), autoDispatch: z.boolean().optional(),
  },
  outputSchema: { result: z.any() },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  _meta: WIDGET_CALLABLE_META,
}, async (input) => result(service.createProject(input)));

server.registerTool("list_projects", {
  title: "List Projects", description: "List whomi projects and their destination Codex tasks.",
  inputSchema: {}, outputSchema: { result: z.any() },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
}, async () => result(service.listProjects()));

server.registerTool("update_project", {
  title: "Update Project",
  description: "Update a project's name, root, destination Codex task, or automatic queue dispatch setting.",
  inputSchema: {
    projectId: z.string(), name: z.string().min(1).optional(), rootPath: z.string().min(1).optional(),
    targetThreadId: z.string().nullable().optional(), autoDispatch: z.boolean().optional(),
  },
  outputSchema: { result: z.any() },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  _meta: WIDGET_CALLABLE_META,
}, async ({ projectId, ...input }) => result(service.updateProject(projectId, input)));

server.registerTool("list_todos", {
  title: "List Todos", description: "List Todos, optionally for one project.",
  inputSchema: { projectId: z.string().nullable().optional(), includeArchived: z.boolean().optional() },
  outputSchema: { result: z.any() },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
}, async (input) => result(service.listTodos(input.projectId, input.includeArchived ?? false)));

server.registerTool("set_todo_status", {
  title: "Set Todo Status",
  description: "Move a Todo to draft, ready, completed, failed, or archived. Setting ready enters its project's sequential send queue.",
  inputSchema: { todoId: z.string(), status: z.enum(TODO_STATUSES), projectId: z.string().nullable().optional() },
  outputSchema: { result: z.any() },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  _meta: WIDGET_CALLABLE_META,
}, async (input) => result(service.setStatus(input.todoId, input.status, input.projectId)));

server.registerTool("start_project_queue", {
  title: "Start Project Queue",
  description: "Start or resume sequential sending for one project. Returns immediately while the queue continues in the background.",
  inputSchema: { projectId: z.string() }, outputSchema: { result: z.any() },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  _meta: WIDGET_CALLABLE_META,
}, async (input) => result(service.startProjectQueue(input.projectId)));

server.registerTool("retry_todo", {
  title: "Retry Todo", description: "Move one failed Todo back to ready and resume its project queue.",
  inputSchema: { todoId: z.string() }, outputSchema: { result: z.any() },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  _meta: WIDGET_CALLABLE_META,
}, async (input) => result(service.retryTodo(input.todoId)));

await server.connect(new StdioServerTransport());
