# xdeco

一个面向 Codex 的本地项目 Todo 队列。它把散落在不同对话里的工作收集到本地，按项目排队，并将可执行的 Todo 串行发送到项目绑定的 Codex task。

xdeco 只负责三件事：

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

需要 Node.js 24+、pnpm 10+ 与已登录的 Codex CLI。

```bash
pnpm install
pnpm dev:web
```

打开 <http://localhost:3001>。Next.js 会把 `/api/*` 请求代理到本地守护进程；后者默认监听 `127.0.0.1:4317`，SQLite 数据与截图存放在 `~/.codex/xdeco/`。

验证当前工作区：

```bash
pnpm typecheck
pnpm test
pnpm build
```

## Codex 插件

插件提供嵌入式项目/Todo UI，以及可从其他对话调用的 `add_todo` MCP tool。

典型请求：

```text
把“修复导航栏闪烁”作为草稿加到 Website 项目。
把“补登录回归测试”加入 Website 的发送队列。
打开 xdeco。
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
pnpm --filter @xdeco/daemon cli -- projects
pnpm --filter @xdeco/daemon cli -- project-add "Website" D:/Project/site
pnpm --filter @xdeco/daemon cli -- add "修复导航" <projectId> ready
pnpm --filter @xdeco/daemon cli -- dispatch <projectId>
```

产品和调度约束见 [设计文档](docs/xdeco-design.md)。

## 项目结构

```text
apps/daemon      本地 HTTP API、MCP server、SQLite 与 Codex 调度器
apps/web         可选的 Next.js 独立管理页面
packages/shared  前后端共享的数据类型和状态元数据
plugins/xdeco    Codex 插件清单、skill、MCP 启动脚本和构建产物
scripts          插件校验等仓库脚本
docs             产品、架构、接口和开发文档
```

## 文档

- [文档导航](docs/README.md)：按使用者、开发者和维护者查找文档。
- [产品与技术设计](docs/xdeco-design.md)：产品边界、状态机与关键约束。
- [系统架构](docs/architecture.md)：模块、数据、调度链路和故障语义。
- [接口参考](docs/interfaces.md)：HTTP API、CLI 与 MCP tools。
- [开发与维护](docs/development.md)：环境、命令、配置、调试和发布检查。

## License

[MIT](LICENSE) © 2026 TENETX
