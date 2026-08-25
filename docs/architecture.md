# 系统架构

> 适用版本：v0.2
>
> 最后核对：2026-08-22

## 1. 架构概览

xdeco 是一个本地优先的 pnpm monorepo。HTTP 页面和 Codex 插件是两套入口，但最终都复用 `XdecoService`、同一个 SQLite 数据库和同一套 Codex App Server 适配层。

```text
Codex 对话 ── MCP tools / 嵌入式 Widget ─┐
                                         ├── XdecoService ── SQLite
浏览器 ── Next.js /api 代理 ── HTTP API ─┘       │
CLI ─────────────────────────── HTTP API          └── codex app-server
```

默认只在本机回环地址开放 HTTP API，不包含登录或鉴权能力。若修改 `XDECO_HOST` 对外监听，需要在外围自行增加访问控制。

## 2. 模块边界

| 模块 | 职责 | 关键入口 |
| --- | --- | --- |
| `apps/daemon` | 配置、SQLite、业务服务、HTTP/MCP 接口、Codex 调度 | `src/http.ts`、`src/mcp.ts`、`src/service.ts` |
| `apps/web` | 独立 Web 管理页及 API 反向代理 | `src/app/page.tsx`、`src/app/api/[...path]/route.ts` |
| `packages/shared` | Project、Todo、Run、Overview 类型与状态元数据 | `src/index.ts` |
| `plugins/xdeco` | Codex 插件 manifest、管理 skill、MCP 配置与打包产物 | `.codex-plugin/plugin.json`、`.mcp.json` |

`XdecoService` 是业务边界：入口层不直接操作数据库或 Codex。`XdecoDatabase` 管理持久化和原子领取，`CodexAppServer` 封装 `codex app-server` 的 JSON-RPC 生命周期。

## 3. 核心数据

SQLite 默认位于 `~/.codex/xdeco/xdeco.sqlite`，启用 WAL 和外键。主要表如下：

| 表 | 用途 |
| --- | --- |
| `projects` | 项目名称、本地根目录、目标 task、自动调度开关 |
| `todos` | Todo 内容、状态、排序、来源、完成结果与最近错误 |
| `todo_runs` | 每次实际发送对应的 task、turn、耗时状态和错误 |
| `settings` | 守护进程内部设置，目前保存捕获专用 task ID |

Todo 使用 `position, created_at` 确定项目内顺序。Project 删除时 Todo 的 `project_id` 会置空；Run 记录随 Todo 或 Project 删除级联清理。当前应用没有暴露删除接口。

旧版 `plans` 数据库会在首次打开时迁移成 `projects`。如果检测到 `~/.codex/plan-orchestrator/plan-orchestrator.sqlite`，默认继续使用该文件并执行兼容迁移。

## 4. Todo 调度链路

1. `draft` 仅保存；`ready` 表示进入某个 Project 的队列。
2. 自动调度开启，或显式调用“开始队列”后，服务为该 Project 创建一个内存 dispatcher。
3. `claimNextReady` 在 `BEGIN IMMEDIATE` 事务中确认项目没有 `sending/running` 项，并领取最早的 `ready`，原子更新为 `sending`。
4. Project 尚未绑定 task 时，以 `rootPath` 为工作目录创建 Codex task，并把 task ID 写回 Project；否则恢复既有 task。
5. 创建 turn 后写入 `todo_runs`，Todo 更新为 `running`。
6. turn 完成后写入摘要、task ID、turn ID，并继续领取下一条。
7. turn 失败、中断或调用异常时，Todo 更新为 `failed`，记录 `last_error`，该 Project 的本轮队列停止。

同一 Node.js 进程还通过 `dispatchers` Map 避免同一 Project 重复启动循环；SQLite 事务用于防止多个插件会话或进程重复领取同一 Todo。不同 Project 可以并行。

执行 turn 默认使用 `XDECO_EXECUTION_MODEL`，工作区权限为 `workspace-write`，批准策略为 `never`，最长等待 24 小时。

## 5. 内容捕获链路

`capture_todos` 和 `POST /api/capture` 接受文本或截图：

1. 截图校验为 PNG/JPEG/WebP 且不超过 10 MB，保存到数据目录。
2. 服务复用一个名为 `xdeco Inbox` 的捕获 task；不存在时创建并把 ID 存入 `settings`。
3. 使用 `XDECO_CAPTURE_MODEL` 和结构化 schema，把内容拆成 1–8 条 Todo。
4. 所有捕获结果都以 `draft` 保存，不自动发送。
5. 模型不可用或解析失败时，降级为按原文创建一条草稿，并返回 warning。

捕获 task 使用只读沙箱；Web 请求体上限为 12 MB，解码后的截图上限为 10 MB。

## 6. 状态不变量

- `ready`、`sending`、`running` 必须属于 Project。
- `sending` 和 `running` 只能由 dispatcher 写入，外部接口不能直接设置。
- 每个 Project 同时最多存在一个 `sending` 或 `running` Todo。
- 失败不会自动跳过，必须显式重试后才能继续。
- 完成结果保留 task/turn 标识；读取详细结果失败时可回退到数据库中的完成摘要。
- `archived` 是软归档，不删除本地文件、Run 或 Codex 历史。

## 7. 进程与故障语义

- dispatcher 只存在于当前 daemon 或 MCP 进程内，进程退出后不会自动恢复。
- v0.2 不会自动接管遗留的 `sending/running` Todo，以避免重复发送；需要人工确认后调整状态。
- HTTP API 将“not found”错误映射为 404，其余业务或输入错误映射为 400。
- `CodexAppServer` 在需要时惰性启动 `codex app-server`，并从事件流跟踪 turn 完成状态。
- Web 和插件 MCP 分别创建自己的 `XdecoService` 进程，但共享数据库；若二者同时使用，队列领取仍由 SQLite 事务保护。

## 8. 当前范围外

当前版本不负责 Git 分支/worktree、任务依赖、优先级/截止时间、多用户同步、远程鉴权、后台系统服务安装和崩溃后的自动恢复。这些能力若引入，应保持 Project → Queue → Dispatcher 的核心边界清晰。
