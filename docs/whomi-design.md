# whomi 产品与技术设计

> 状态：v0.2
> 更新时间：2026-08-21

## 1. 产品边界

whomi 是 Codex 的本地项目 Todo 队列，不负责 Git 分支、worktree、进程终端或复杂执行环境管理。

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

- 项目列表；
- 草稿或待发送 Todo 的快速创建；
- 项目目标 task 选择；
- 自动发送开关和手动“开始队列”；
- Todo 状态与失败重试。

Next.js 页面保留为可选独立入口，与插件 UI 共用同一服务和数据库。

## 6. MCP tools

```text
open_whomi
get_overview

add_todo
capture_todos
list_todos
set_todo_status
retry_todo

create_project
list_projects
update_project
start_project_queue
```

## 7. 失败与恢复

- 发送失败记录在 Todo 的 `lastError` 和对应 `todo_run`。
- 失败后不自动跳过，避免在错误配置下连续创建 turn。
- 用户重试后 Todo 回到 `ready`，项目队列继续。
- 进程异常退出后，处于 `sending/running` 的 Todo 需要后续恢复机制；v0.2 先在 UI 中显式呈现，不静默重复发送。

## 8. 后续扩展

飞书 CLI、GitHub、Linear 或其他 MCP 都作为 Todo 来源或 UI capability 接入，不改变 Project/TodoQueue 核心模型。
