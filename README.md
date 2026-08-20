# Plan Orchestrator

一个面向 Codex 的本地任务控制台。你可以创建 Todo、把它们放进 Plan，并在当前 Codex task 或指定的后台 task 中执行。

Codex 内嵌的 Plan Board 是主入口，可浮动在对话右侧。Next.js Web 控制台和 `planctl` CLI 作为独立管理入口，共用同一份本地 SQLite 数据。

初版包含：

- Next.js 控制台与快捷捕获区；
- `不急 / 等待 / 队列中 / 运行中 / 完成 / 结束` 六状态；
- 文本或截图创建 Todo，独立 Capture task 使用轻量模型；
- SQLite 本地存储；
- 自动读取 Codex 本地项目，新建 Plan 时带入项目 ID、根目录与当前 Git 分支；
- 插件内一键把 Todo 作为当前 Codex task 的可见消息启动；
- CLI/后台可在 Plan 绑定的 worktree + Codex task 中启动 Todo；
- 完成记录保存准确的 `threadId + turnId`；
- 可选的 MCP 工具与 `planctl` CLI。

## 本地运行

要求 Node.js 24+、pnpm 与已登录的 Codex CLI。

```bash
pnpm install
pnpm dev:web
```

打开 [http://localhost:3001](http://localhost:3001)。端口固定为 `3001`，本地服务监听 `127.0.0.1:4317`，数据默认存到 `~/.codex/plan-orchestrator/`。

日常使用：

1. 新建 Plan，选择项目和接收 Todo 的 Codex 任务；
2. 输入一件事；
3. 点“添加”只保存 Todo，点“发给 Codex”则保存并立即开始执行。

生产方式启动：

```bash
pnpm build
pnpm start:web
```

## CLI

守护进程运行后：

```bash
pnpm --filter @plan-orchestrator/daemon cli -- plans
pnpm --filter @plan-orchestrator/daemon cli -- plan-add "A plan" "Project A" /path/to/project feat/a /path/to/worktree
pnpm --filter @plan-orchestrator/daemon cli -- worktree <planId>
pnpm --filter @plan-orchestrator/daemon cli -- todos
pnpm --filter @plan-orchestrator/daemon cli -- add "修复登录回归" <planId>
pnpm --filter @plan-orchestrator/daemon cli -- launch <todoId>
pnpm --filter @plan-orchestrator/daemon cli -- complete <todoId> "验证已通过"
```

## Codex 插件

插件提供 Codex 内嵌 UI，也是向当前 task 写入可见消息的唯一入口。独立 Web 后端仍可直接使用本机 Codex，但它通过 App Server 启动的是后台 turn，不会渲染成当前对话中的可见消息。

构建并安装本地插件：

```bash
pnpm install
pnpm build:plugin
pnpm validate:plugin
codex plugin marketplace add "$(pwd)"
codex plugin add plan-orchestrator@personal
```

安装或更新后需要新开一个 Codex task，让宿主加载新版本。打开 `Plan Board` 后可点右上角浮动按钮放到对话右侧。使用“当前 task 启动”前，应把 Plan 绑定到正在查看的同一个 task，以便插件匹配真实 turn 并保存完成链接。

产品与技术细节见 [设计文档](docs/plan-orchestrator-design.md)。

## 关于完成链接

控制台的完成卡片链接会进入插件自己的稳定回执页，并精确保留 Codex `threadId + turnId`。当前官方 App Server 可读取对应 turn，但尚未公开跨版本稳定的原生 turn deep-link 格式；未来只需替换回执页的跳转适配层。
