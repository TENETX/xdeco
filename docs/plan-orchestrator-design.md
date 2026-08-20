# Codex Plan Orchestrator 产品与技术设计

> 状态：Draft v0.1  
> 更新时间：2026-08-20  
> 暂定名称：Plan Orchestrator

## 1. 结论

可以使用 Next.js。

推荐让 Next.js 负责控制面 UI、页面路由和面向 UI 的本地 API；Codex App Server 连接、MCP、CLI 进程与 Git worktree 管理放在独立的常驻 Node.js daemon 中。这样既能使用 Next.js 快速完成看板，又不会让长生命周期任务受到 Next.js 请求生命周期、开发热重载或页面关闭的影响。

第一版是一个仅在本机运行的 Codex 插件。它以一个不属于任何项目的全局控制 thread 作为入口，管理多个绑定到不同项目、thread、worktree 和分支的 Plan。

## 2. 产品目标

用户可以在一个全局控制 thread 中完成以下事情：

1. 通过文字或截图快速创建 Todo。
2. 将 Todo 归入一个 Plan。
3. 用少量状态管理 Todo。
4. 将“队列中”的 Todo 投递到 Plan 对应的 Codex thread。
5. 一键创建、打开或继续对应的 Codex thread、worktree 或 CLI 环境。
6. Todo 完成后，保留完成所在的 thread 和 turn，可回看完成证据。

## 3. 核心概念

### 3.1 Plan

Plan 不是一条任务，而是一条稳定的执行通道：

```text
Plan = 项目 + 执行环境 + 分支 + 当前 Thread + Todo 集合
```

示例：

```text
Plan A
├── Project: A
├── Environment: permanent worktree
├── Branch: feat/a
├── Thread: thread a
└── Launch surface: Codex Desktop

Plan B
├── Project: B
├── Environment: local checkout
├── Branch: feat/b
├── Thread: thread b
└── Launch surface: CLI
```

为避免和 Codex 自身的 plan 概念混淆，代码和数据库中使用 `execution_plan`，产品界面仍显示“Plan”。

### 3.2 全局控制 Thread

系统维护一个不属于任何项目的 projectless thread，暂定名称为 `Plan Inbox`。

职责：

- 接收截图和文字。
- 用轻量模型提取 Todo。
- 设置 Todo 的 Plan 和状态。
- 查看所有 Plan 的运行情况。
- 一键启动或继续目标 thread。

默认模型建议使用适合高频、低成本任务的轻量模型，例如 `gpt-5.6-luna`，推理等级使用 `low`。模型只负责图片理解、文本整理和结构化提取，不负责实际编码。

### 3.3 Todo

Todo 是用户想跟踪或执行的一件事。它可以暂时不属于任何 Plan；进入“队列中”前必须绑定 Plan。

## 4. Todo 状态

系统只保留六个状态：

| 中文 | 内部值 | 含义 |
| --- | --- | --- |
| 不急 | `someday` | 暂存，不进入执行 thread |
| 等待 | `waiting` | 等待用户、外部条件或其他工作 |
| 队列中 | `queued` | 已进入所属 Plan 的待执行队列 |
| 运行中 | `running` | 已在目标 Codex thread 中启动 |
| 完成 | `completed` | 已完成，并保存 thread/turn 证据 |
| 结束 | `ended` | 用户认为不再需要，默认从界面隐藏 |

主要流转：

```text
不急 ─┐
等待 ─┼──> 队列中 ──> 运行中 ──> 完成 ──> 结束
      └───────────────────────────────> 结束
```

补充规则：

- “不急”和“等待”可以互相切换。
- “完成”可以重新进入“队列中”，用于返工或重试。
- 任意状态都可以“结束”。
- “结束”在产品上等同删除；第一版底层使用软删除，避免误操作导致无法恢复。

## 5. 核心工作流

### 5.1 从文字或截图创建 Todo

```text
用户向 Plan Inbox 发送文字/截图
        ↓
轻量模型提取标题、描述和候选 Plan
        ↓
调用 MCP create_todo
        ↓
默认进入“不急”，或按用户原话进入指定状态
```

规则：

- 用户明确指定 Plan 和状态时直接采用。
- 用户没有指定状态时默认“不急”。
- 模型无法可靠判断 Plan 时，Todo 可以保持 `plan_id = null`。
- 模型不得因为猜测而自动启动开发 thread。

### 5.2 进入队列

当 Todo 被设置为“队列中”时：

1. 校验 Todo 已绑定 Plan。
2. 校验 Plan 已绑定项目和执行环境。
3. 将 Todo 放入 Plan 的队列。
4. 在 UI 中同时按 Plan 和 `active_thread_id` 展示。
5. 此时不自动执行，除非用户同时选择“一键启动”。

第一版中的“对应 thread 的 Todo list”由插件数据库维护并在插件 UI 中按 thread 展示。它是事实来源，不依赖 Codex 内部 plan 是否存在。后续可增加向 Codex 原生 plan 的尽力同步。

### 5.3 一键启动

用户在 Plan Inbox 或 Next.js 看板点击“启动”后：

```text
检查 Plan 的 active thread
├── 已存在且正在运行：打开该 thread
├── 已存在但空闲：取首个 queued Todo，启动一个新 turn
└── 不存在：
    ├── 校验项目和 Git 状态
    ├── 创建或定位执行环境
    ├── 创建 Codex thread
    ├── 保存 thread ID
    └── 取首个 queued Todo，启动一个新 turn
```

启动成功后：

- Todo 状态改为“运行中”。
- 保存 `thread_id` 和 `start_turn_id`。
- 桌面模式导航到对应 thread。
- CLI 模式打开或恢复对应的终端会话。

### 5.4 完成

Todo 只有在用户或 agent 明确调用 `complete_todo` 后才变成“完成”。

Codex 的 `turn/completed` 只表示一轮 agent 执行结束，不必然表示业务 Todo 已完成，因此不能仅凭事件自动完成 Todo。

完成时保存：

```ts
type TodoCompletion = {
  threadId: string;
  turnId: string;
  itemId?: string;
  completedAt: string;
  summary?: string;
};
```

UI 示例：

```text
✓ 完成于 thread a · turn 18
```

### 5.5 完成链接

插件必须保存 `thread_id + turn_id`，不能只保存展示 URL。

当前官方 App Server 可以根据 thread 读取 turn，也能按 `turnId` 读取持久化 items；但官方文档没有公开稳定的 Codex 原生“跳转并滚动到指定 turn”的 deep link。

第一版采用插件自己的完成详情路由：

```text
/todos/:todoId/completion
```

点击完成链接后：

1. 从数据库读取 `thread_id` 和 `turn_id`。
2. 通过 App Server 读取该 turn 的内容。
3. 在 Next.js 详情页或插件面板中展示准确的完成 turn。
4. 同时提供“打开整个 Thread”按钮。

如果以后 Codex 提供稳定的 turn 级原生导航，只需要替换导航适配器，不需要迁移数据。

### 5.6 结束

用户点击“结束”后，Todo 立即从默认列表中消失：

```ts
{
  status: "ended",
  endedAt: "2026-08-20T12:00:00Z"
}
```

第一版保留“已结束”筛选和恢复能力。永久清除作为单独操作，不和普通“结束”共用。

## 6. 技术架构

### 6.1 总体结构

```text
Codex Plugin
├── Skills
│   ├── plan-inbox
│   └── plan-runner
├── MCP configuration
└── Optional embedded UI

Local Runtime
├── Next.js Web App
│   ├── Plan 看板
│   ├── Todo 列表
│   ├── 完成详情
│   └── 本地控制 API
├── Orchestrator Daemon
│   ├── MCP Server
│   ├── Codex App Server Client
│   ├── CLI Process Manager
│   ├── Worktree Manager
│   └── Event Reconciler
└── SQLite
```

### 6.2 为什么使用 Next.js

Next.js 适合：

- Plan/Todo 看板和详情页。
- 完成记录页面路由。
- 图片上传和本地预览。
- Server Components 或 Route Handlers 读取本地数据。
- 后续扩展到远程同步或团队版本。

Next.js 不直接承担：

- 长期持有 `codex app-server` stdio/WebSocket 连接。
- 运行和监控 CLI 子进程。
- 长时间后台监听 thread/turn 事件。
- 负责 MCP transport 的完整生命周期。

这些能力放到 daemon，Next.js 通过 localhost API 与 daemon 通信。

### 6.3 建议技术栈

| 层 | 选择 |
| --- | --- |
| Web | Next.js App Router + TypeScript |
| 本地 daemon | Node.js + TypeScript |
| MCP | `@modelcontextprotocol/sdk` |
| 数据库 | SQLite |
| 数据访问 | Drizzle ORM，或早期直接使用参数化 SQL |
| Codex 集成 | Codex App Server JSON-RPC |
| UI 更新 | Server-Sent Events 或 WebSocket |
| 校验 | Zod |
| 测试 | Vitest + Playwright |

首版只支持本机 Node runtime，不使用 Edge runtime。

### 6.4 推荐目录

```text
whomi/
├── apps/
│   ├── web/                    # Next.js
│   └── daemon/                 # 本地编排服务 + MCP
├── packages/
│   ├── core/                   # 状态机和领域逻辑
│   ├── db/                     # SQLite schema/migrations
│   ├── codex-client/           # App Server 适配器
│   └── shared/                 # types/schemas
├── plugin/
│   └── plan-orchestrator/
│       ├── .codex-plugin/
│       │   └── plugin.json
│       ├── skills/
│       │   ├── plan-inbox/
│       │   │   └── SKILL.md
│       │   └── plan-runner/
│       │       └── SKILL.md
│       ├── .mcp.json
│       └── .app.json           # 后续需要嵌入 UI 时添加
├── docs/
│   └── plan-orchestrator-design.md
└── package.json
```

## 7. 数据模型

### 7.1 `projects`

```text
id
codex_project_id
name
root_path
host_id
created_at
updated_at
```

### 7.2 `execution_plans`

```text
id
name
project_id
environment_kind          # managed_worktree | permanent_worktree | local_checkout
launch_surface            # desktop | cli
base_branch
branch_name
worktree_path
active_thread_id
created_at
updated_at
```

### 7.3 `plan_threads`

```text
id
plan_id
thread_id
role                      # active | previous
source_kind               # app | cli
cwd
git_branch
worktree_path
created_at
retired_at
```

Plan 和 thread 使用一对多历史关系。Plan 只保留一个 active thread，但旧 thread 不丢失。

### 7.4 `todos`

```text
id
plan_id                   # nullable
title
description
status                    # 六种状态
source_thread_id
created_at
updated_at
ended_at
```

### 7.5 `todo_runs`

```text
id
todo_id
thread_id
start_turn_id
completion_turn_id
status                    # running | completed | failed | interrupted
started_at
completed_at
```

同一 Todo 可以拥有多次执行记录。Todo 的完成链接默认指向最近一次成功记录。

### 7.6 `attachments`

```text
id
todo_id
kind                      # image | file
local_path
mime_type
sha256
created_at
```

## 8. MCP 工具

第一版提供以下工具：

```text
create_todo
list_todos
get_todo
set_todo_status
end_todo

create_plan
list_plans
get_plan
update_plan_binding

start_todo
prepare_current_todo
register_current_todo
complete_todo
get_todo_completion
reconcile_plan
```

关键约束：

- `set_todo_status(status = queued)` 时必须校验 `plan_id`。
- `prepare_current_todo` 生成带一次性关联标记的当前 task 可见消息；组件通过 Codex 宿主桥发送。
- `register_current_todo` 必须在 Plan 绑定的 task 中匹配该标记，记录真实 turn，并把 Todo 置为运行中。
- `start_todo` 只用于 CLI/后台执行，必须通过 Plan 解析目标 thread 和执行环境；不得宣称它会渲染到当前打开的 task。
- `complete_todo` 必须写入 `thread_id` 和 `turn_id`。
- `end_todo` 默认软删除。
- MCP 不暴露任意 shell 执行工具。

## 9. Worktree 与分支规则

执行环境和启动界面分开建模：

```text
environment_kind = managed_worktree | permanent_worktree | local_checkout
launch_surface   = desktop | cli
```

规则：

- 临时、可丢弃任务可以使用 Codex-managed worktree。
- 需要稳定绑定 `feat/a` 这类命名分支的长期 Plan，优先使用 permanent/existing worktree。
- 启动前校验 repo root、worktree path、当前 branch 和 dirty 状态。
- 分支不匹配时显示错误或修复选项，不静默切换。
- 删除或清理 worktree 必须是单独的显式操作。

## 10. 状态同步

daemon 监听 App Server 事件：

```text
turn/started
turn/completed
thread/status/changed
thread/archived
```

同步规则：

- 由插件启动 turn 时，立即记录返回的 `turn_id`。
- `turn/started` 可将已投递 Todo 变为“运行中”。
- `turn/completed` 更新运行记录，但不自动把业务 Todo 标记为“完成”。
- `complete_todo` 负责确认业务完成，并将最近相关 turn 作为完成证据。
- 事件处理使用幂等键，防止重连后重复更新。

## 11. 本地安全边界

- daemon 只监听 localhost 或 Unix socket。
- Next.js 到 daemon 使用随机本地 token。
- 只允许操作用户登记过的项目目录。
- Git 和 CLI 参数全部使用结构化参数，不拼接未经校验的 shell 字符串。
- 不记录访问令牌、模型密钥或无关的 thread 全文。
- 截图保存在受控数据目录，可由用户清理。
- 永久删除、worktree 清理和强制结束进程需要显式确认。

## 12. MVP 范围

### v0.1

- Next.js Plan/Todo 看板。
- SQLite 持久化。
- 六种 Todo 状态。
- 文字创建 Todo。
- 截图创建 Todo。
- Plan 绑定项目、thread、worktree、branch。
- “队列中”按 Plan/thread 展示。
- 一键打开或启动目标 thread。
- 手动完成并保存 thread/turn。
- 完成详情页。
- 软删除“结束”。

### v0.2

- CLI 进程管理与恢复。
- App Server 实时事件同步。
- permanent worktree 创建和修复流程。
- 自动识别 thread/branch 漂移。
- Todo 重试和多次执行历史。

### 暂不包含

- 多用户和云同步。
- 团队权限管理。
- 自动合并分支。
- 自动删除 worktree。
- 将 Codex 原生 plan 作为主数据源。
- 承诺原生 UI 能直接滚动到某个 turn。

## 13. 验收标准

1. 用户能在 Plan Inbox 中通过一句话创建 Todo。
2. 用户能通过截图创建至少一个可编辑 Todo。
3. Todo 只使用六种约定状态。
4. Todo 进入“队列中”时，能显示在对应 Plan/thread 的列表中。
5. 用户点击“启动”后，系统使用正确的项目、环境和 thread。
6. Todo 运行时能记录实际 `thread_id` 和 `turn_id`。
7. Todo 完成后，点击链接能看到准确的完成 turn，并可打开完整 thread。
8. Todo 结束后默认列表不再显示，且可以从已结束列表恢复。
9. 重启 Next.js 页面或关闭浏览器不会中断 daemon 管理的运行任务。

## 14. 相关官方文档

- Codex 插件架构：<https://developers.openai.com/plugins/concepts/plugins>
- Codex App Server：<https://learn.chatgpt.com/docs/app-server>
- Codex Git worktrees：<https://learn.chatgpt.com/docs/environments/git-worktrees>
- OpenAI 模型目录：<https://developers.openai.com/api/docs/models>
