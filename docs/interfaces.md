# 接口参考

> 适用版本：v0.2
>
> 最后核对：2026-08-22

## 1. HTTP API

默认地址为 `http://127.0.0.1:4317`，请求和响应均使用 JSON。API 当前没有鉴权，建议仅绑定回环地址。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/health` | 进程健康状态和版本 |
| `GET` | `/api/overview?projectId=` | 项目、Todo、Codex 项目/task 和控制器状态 |
| `GET` | `/api/projects` | 项目列表 |
| `POST` | `/api/projects` | 创建项目 |
| `PATCH` | `/api/projects/:id` | 更新项目 |
| `POST` | `/api/projects/:id/dispatch` | 异步启动项目队列 |
| `GET` | `/api/todos?projectId=&includeArchived=true` | Todo 列表 |
| `POST` | `/api/todos` | 创建 Todo |
| `GET` | `/api/todos/:id` | Todo 详情 |
| `PATCH` | `/api/todos/:id/status` | 更新可由用户控制的状态/项目 |
| `POST` | `/api/todos/:id/retry` | 将失败 Todo 重新放回队列 |
| `POST` | `/api/capture` | 从文本/截图提炼草稿 Todo |

### 创建项目

```http
POST /api/projects
content-type: application/json

{
  "name": "Website",
  "rootPath": "D:/project/site",
  "targetThreadId": null,
  "autoDispatch": true,
  "color": "#6f8f4f"
}
```

`name` 和 `rootPath` 必填。名称在 SQLite 中不区分大小写且唯一。`targetThreadId` 为空时，首次发送会自动创建 task。

### 创建 Todo

```http
POST /api/todos
content-type: application/json

{
  "title": "修复导航栏闪烁",
  "description": "桌面端和移动端各验证一次",
  "projectId": "<project-id>",
  "status": "ready",
  "sourceType": "text"
}
```

`status` 默认是 `draft`。`ready` 必须提供有效 Project；`sending` 和 `running` 由调度器管理，不能通过状态接口设置。

### 更新状态

```http
PATCH /api/todos/<todo-id>/status
content-type: application/json

{
  "status": "archived",
  "projectId": "<project-id>"
}
```

允许的状态为 `draft | ready | sending | running | completed | failed | archived`，但 `sending/running` 会被业务层拒绝。省略 `projectId` 表示保留原项目，显式传 `null` 表示移出项目。

### 捕获文本或截图

```http
POST /api/capture
content-type: application/json

{
  "text": "整理登录页问题并补回归测试",
  "projectId": "<project-id>",
  "image": {
    "name": "bug.png",
    "dataBase64": "<base64>"
  }
}
```

文本和截图至少提供一个。图片支持 PNG、JPEG、WebP，解码后不超过 10 MB。结果始终保存为草稿。

错误响应形如 `{ "error": "message" }`。找不到资源返回 404，其余输入/业务错误通常返回 400。

## 2. CLI

CLI 通过 HTTP API 工作，因此 daemon 必须已运行。可用 `WHOMI_URL` 指向其他地址。

```bash
pnpm --filter @whomi/daemon cli -- projects
pnpm --filter @whomi/daemon cli -- project-add "Website" "D:/project/site" [threadId]
pnpm --filter @whomi/daemon cli -- todos [projectId]
pnpm --filter @whomi/daemon cli -- add "修复导航" [projectId] [draft|ready]
pnpm --filter @whomi/daemon cli -- status <todoId> <status> [projectId]
pnpm --filter @whomi/daemon cli -- dispatch <projectId>
pnpm --filter @whomi/daemon cli -- retry <todoId>
```

CLI 输出格式为 JSON，失败信息写到 stderr 并以非零状态退出。

## 3. MCP tools

Codex 插件通过 stdio MCP server 公开以下工具：

| Tool | 主要输入 | 行为 |
| --- | --- | --- |
| `open_whomi` | 无 | 打开嵌入式 Widget，并返回 overview |
| `get_overview` | 无 | 读取完整 overview |
| `add_todo` | `title`、可选 `projectId/projectName/status` | 创建单条 Todo；默认草稿 |
| `capture_todos` | 可选 `text/image/projectId` | 提炼 1–8 条草稿 Todo |
| `create_project` | `name`、`rootPath`、可选 task/自动发送 | 创建 Project |
| `list_projects` | 无 | 列出 Project |
| `update_project` | `projectId` 与需更新字段 | 更新 Project |
| `list_todos` | 可选 `projectId/includeArchived` | 列出 Todo |
| `set_todo_status` | `todoId`、`status`、可选 `projectId` | 更新状态或归属 |
| `start_project_queue` | `projectId` | 异步启动/继续队列 |
| `retry_todo` | `todoId` | 失败 Todo 回到 `ready` |
| `get_todo_result` | `todoId` | 读取完成回答与产物链接 |

`add_todo.projectName` 采用不区分大小写的精确名称匹配；找不到时直接报错，不做模糊猜测。MCP 返回同时包含文本 JSON 和 `structuredContent.result`。

## 4. 共享类型

跨模块契约集中在 `packages/shared/src/index.ts`，主要包括：

- `Project`：项目根目录、目标 task 和自动调度配置。
- `Todo`：内容、来源、状态、顺序、完成信息和错误。
- `TodoRun`：一次 Codex turn 的执行记录。
- `Overview`：UI 首屏所需的聚合数据。
- `TODO_STATUSES` / `STATUS_META`：状态全集和展示元数据。

修改这些结构时，应同步检查 SQLite 映射、MCP schema、HTTP body、Next.js UI 和嵌入式 Widget。
