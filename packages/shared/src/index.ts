export const TODO_STATUSES = [
  "someday",
  "waiting",
  "queued",
  "running",
  "completed",
  "ended",
] as const;

export type TodoStatus = (typeof TODO_STATUSES)[number];

export const STATUS_META: Record<
  TodoStatus,
  { label: string; description: string; tone: string }
> = {
  someday: { label: "不急", description: "先记下来，暂时不排期", tone: "quiet" },
  waiting: { label: "等待", description: "被外部条件阻塞", tone: "waiting" },
  queued: { label: "待开始", description: "已经安排好，随时可以开始", tone: "queued" },
  running: { label: "进行中", description: "正在处理", tone: "running" },
  completed: { label: "已完成", description: "已经处理完成", tone: "completed" },
  ended: { label: "已归档", description: "暂时不再显示", tone: "ended" },
};

export type TodoSource = "text" | "screenshot" | "mcp";

export interface Plan {
  id: string;
  name: string;
  codexProjectId: string | null;
  projectName: string;
  projectRoot: string;
  branch: string;
  worktreePath: string;
  threadId: string | null;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface CodexProject {
  id: string;
  name: string;
  rootPath: string;
  branch: string | null;
  isGitRepository: boolean;
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
  planId: string | null;
  title: string;
  description: string;
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
}

export interface TodoArtifact {
  kind: "file" | "link";
  name: string;
  uri: string;
}

export interface TodoResult {
  title: string;
  answer: string;
  artifacts: TodoArtifact[];
}

export interface TodoRun {
  id: string;
  todoId: string;
  planId: string;
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
  plans: Plan[];
  codexProjects: CodexProject[];
  codexThreads: CodexThread[];
  todos: Todo[];
  counts: Record<TodoStatus, number>;
  controller: ControllerState;
}

export interface CreatePlanInput {
  name: string;
  codexProjectId?: string | null;
  projectName: string;
  projectRoot: string;
  branch: string;
  worktreePath?: string;
  threadId?: string | null;
  color?: string;
}

export interface CreateTodoInput {
  title: string;
  description?: string;
  status?: TodoStatus;
  planId?: string | null;
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

export function countByStatus(todos: Todo[]): Record<TodoStatus, number> {
  return Object.fromEntries(
    TODO_STATUSES.map((status) => [status, todos.filter((todo) => todo.status === status).length]),
  ) as Record<TodoStatus, number>;
}
