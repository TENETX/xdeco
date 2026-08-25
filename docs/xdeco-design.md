# xdeco 产品与技术设计

> 状态：v0.2
> 更新时间：2026-08-21

## 1. 产品边界

xdeco 是 Codex 的本地项目 Todo 队列，不负责 Git 分支、worktree、进程终端或复杂执行环境管理。

核心对象只有三个：

```text
Project → TodoQueue → MessageDispatcher
```

- Project：Todo 分组、本地项目根目录、目标 Codex task。
- TodoQueue：按项目和位置排序的待发送工作。
- MessageDispatcher：每个项目逐条创建 Codex turn。

## 2. 数据模型

### Project

```ts
type Project = {
  id: string;
  name: string;
  rootPath: string;
  targetThreadId: string | null;
  autoDispatch: boolean;
};
```

`targetThreadId` 为空时，首次发送会创建一个以项目命名的 Codex task，并保存其 ID。

### Todo

```ts
type TodoStatus =
  | "draft"
  | "ready"
  | "sending"
  | "running"
  | "completed"
  | "failed"
  | "archived";
```

只有 `ready` 会触发发送。`sending` 和 `running` 只能由调度器写入。

## 3. 串行调度

每个项目拥有一个独立队列：

```text
按 position、createdAt 找到首个 ready Todo
                ↓
原子更新为 sending
                ↓
向项目 targetThreadId 创建 Codex turn
                ↓
更新为 running，并等待 turn 结束
       ├── completed → Todo completed → 取下一条
       └── failed/interrupted → Todo failed → 暂停项目队列
```

领取 Todo 使用 SQLite `BEGIN IMMEDIATE`，避免多个插件会话重复发送同一条 Todo。

不同项目可以并行；同一项目始终串行。

## 4. 跨对话添加

插件公开 `add_todo`：

```ts
add_todo({
  title,
  description?,
  projectId?,
  projectName?,
  status?: "draft" | "ready"
})
```

- 默认创建 `draft`。
- 只有用户明确要求发送、启动或加入队列时使用 `ready`。
- `projectName` 必须精确匹配，不允许在多个候选项目之间猜测。
- `ready` Todo 必须属于一个 Project。

安装插件后，新开的 Codex 对话都可以调用该 tool，共享同一个本地 SQLite 数据库。

## 5. 插件 UI

嵌入式 UI 提供：

- 左侧以 `所属项目 / 无项目 → task` 的两层文件夹展示已关联项；
- 点击“新增”打开选择器，按项目浏览全部近期 Codex task，并可按项目名、目录或 task 标题搜索；
- 项目分组支持展开/收起；task 行仅展示标题，路径保留为搜索与悬停信息；
- 选中 task 后一键关联，并自动隐藏底层 Project 绑定细节；
- 向当前 task 加入 Todo 队列；
- 查看 Todo 状态、失败重试、AI 回复与产出物。

插件 UI 不提供手动放大/缩小、显示模式切换、看板列、状态编辑、项目管理或调度配置；布局跟随宿主宽度自适应。完整能力仍保留在 MCP tools 和本地数据层。

界面样式由 Tailwind CSS v4 在构建期编译，使用 shadcn 的语义 token、状态和组件约定，并统一采用 Lucide 图标。CSS 与图标全部打包进插件资源，不依赖运行时 CDN。

Next.js 页面保留为可选独立入口，与插件 UI 共用同一服务和数据库。

## 6. MCP tools

```text
open_xdeco
get_overview

add_todo
capture_todos
list_todos
set_todo_status
retry_todo
get_todo_result

create_project
list_projects
update_project
start_project_queue
```

## 7. 失败与恢复

- 发送失败记录在 Todo 的 `lastError` 和对应 `todo_run`。
- 失败后不自动跳过，避免在错误配置下连续创建 turn。
- 用户重试后 Todo 回到 `ready`，项目队列继续。
- 进程重启后会根据持久化的 thread/turn 重新读取 Codex 状态：已结束的 turn 立即落为 `completed/failed`，仍在执行的 turn 恢复等待。
- 如果 Todo 停在 `sending/running` 却没有对应执行记录，则标记为 `failed` 并要求用户重试，避免静默重复发送。
- 插件 UI 仅在存在 `sending/running` Todo 且页面可见、无弹窗操作时每 2.5 秒静默刷新；任务结束后自动停止。

## 8. 后续扩展

飞书 CLI、GitHub、Linear 或其他 MCP 都作为 Todo 来源或 UI capability 接入，不改变 Project/TodoQueue 核心模型。
