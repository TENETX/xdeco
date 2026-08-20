# whomi

一个面向 Codex 的本地项目 Todo 队列。

whomi 只负责三件事：

- 按项目保存 Todo；
- 从任意 Codex 对话向项目添加 Todo；
- 把 `ready` Todo 按顺序逐条发送到项目绑定的 Codex task。

## 队列规则

Todo 状态为：

```text
draft → ready → sending → running → completed
                            └──────→ failed
任意非活动状态 ───────────────────→ archived
```

- `draft` 只保存，不发送。
- `ready` 进入项目队列。
- 每个项目同时最多有一个 `sending` 或 `running` Todo。
- 当前 Codex turn 完成后才发送下一条。
- 失败会暂停该项目的后续队列，重试后继续。
- 不同项目拥有独立队列。

## 本地运行

需要 Node.js 24+、pnpm 与已登录的 Codex CLI。

```bash
pnpm install
pnpm dev:web
```

打开 <http://localhost:3001>。本地 API 默认监听 `127.0.0.1:4317`，数据存放在 `~/.codex/whomi/`。

## Codex 插件

插件提供嵌入式项目/Todo UI，以及可从其他对话调用的 `add_todo` MCP tool。

典型请求：

```text
把“修复导航栏闪烁”作为草稿加到 Website 项目。
把“补登录回归测试”加入 Website 的发送队列。
打开 whomi。
```

构建并验证：

```bash
pnpm build:plugin
pnpm validate:plugin
```

插件更新后需要新开一个 Codex task，宿主才会加载新版 skills 和 tools。

## CLI

守护进程运行后：

```bash
pnpm --filter @whomi/daemon cli -- projects
pnpm --filter @whomi/daemon cli -- project-add "Website" D:/Project/site
pnpm --filter @whomi/daemon cli -- add "修复导航" <projectId> ready
pnpm --filter @whomi/daemon cli -- dispatch <projectId>
```

产品和调度约束见 [设计文档](docs/whomi-design.md)。
