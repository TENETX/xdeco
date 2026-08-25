export const TODO_STATUSES = [
  "draft", "ready", "sending", "running", "completed", "failed", "archived",
] as const;

export type TodoStatus = (typeof TODO_STATUSES)[number];

export const TODO_MODES = ["default", "plan"] as const;

export type TodoMode = (typeof TODO_MODES)[number];

export const TODO_MODE_META: Record<TodoMode, { label: string; description: string }> = {
  default: { label: "执行", description: "直接完成任务" },
  plan: { label: "规划", description: "先梳理方案" },
};

export const STATUS_META: Record<TodoStatus, { label: string; description: string; tone: string }> = {
  draft: { label: "草稿", description: "先记下来，暂不发送", tone: "quiet" },
  ready: { label: "待发送", description: "进入项目发送队列", tone: "queued" },
  sending: { label: "发送中", description: "正在投递给 Codex", tone: "waiting" },
  running: { label: "执行中", description: "Codex 正在处理", tone: "running" },
  completed: { label: "已完成", description: "本次执行已经结束", tone: "completed" },
  failed: { label: "失败", description: "发送或执行失败", tone: "waiting" },
  archived: { label: "已归档", description: "不再显示在日常列表", tone: "ended" },
};

export type TodoSource = "text" | "screenshot" | "mcp";

export interface Project {
  id: string;
  name: string;
  rootPath: string;
  targetThreadId: string | null;
  autoDispatch: boolean;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface CodexProject {
  id: string;
  name: string;
  rootPath: string;
}

export interface CodexThread {
  id: string;
  name: string;
  cwd: string;
  status: "active" | "idle" | "notLoaded" | "systemError";
  updatedAt: string;
}

export interface Todo {
  id: string;
  projectId: string | null;
  title: string;
  description: string;
  mode: TodoMode;
  status: TodoStatus;
  sourceType: TodoSource;
  sourcePath: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  completionThreadId: string | null;
  completionTurnId: string | null;
  completionSummary: string | null;
  lastError: string | null;
}

export interface TodoArtifact {
  kind: "file" | "link";
  name: string;
  uri: string;
}

export interface TodoResult {
  title: string;
  answer: string;
  answerHtml: string;
  artifacts: TodoArtifact[];
}

export interface TodoRun {
  id: string;
  todoId: string;
  projectId: string;
  threadId: string;
  turnId: string;
  status: "running" | "completed" | "failed" | "interrupted";
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
}

export interface ControllerState {
  threadId: string | null;
  model: string;
  codexAvailable: boolean;
}

export interface Overview {
  projects: Project[];
  codexProjects: CodexProject[];
  codexThreads: CodexThread[];
  todos: Todo[];
  counts: Record<TodoStatus, number>;
  controller: ControllerState;
}

export interface CreateProjectInput {
  name: string;
  rootPath: string;
  targetThreadId?: string | null;
  autoDispatch?: boolean;
  color?: string;
}

export interface CreateTodoInput {
  title: string;
  description?: string;
  mode?: TodoMode;
  status?: TodoStatus;
  projectId?: string | null;
  sourceType?: TodoSource;
  sourcePath?: string | null;
}

export interface CaptureResult {
  todos: Todo[];
  threadId: string | null;
  turnId: string | null;
  usedModel: boolean;
  warning?: string;
}

export function isTodoStatus(value: unknown): value is TodoStatus {
  return typeof value === "string" && (TODO_STATUSES as readonly string[]).includes(value);
}

export function isTodoMode(value: unknown): value is TodoMode {
  return typeof value === "string" && (TODO_MODES as readonly string[]).includes(value);
}

export function countByStatus(todos: Todo[]): Record<TodoStatus, number> {
  return Object.fromEntries(
    TODO_STATUSES.map((status) => [status, todos.filter((todo) => todo.status === status).length]),
  ) as Record<TodoStatus, number>;
}
