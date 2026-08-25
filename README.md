<div align="center">

# xdeco

**给 Codex 一个可靠、可见、可恢复的项目任务队列。**

Collect work from any Codex task, queue it by project, and send it to the right task — one item at a time.

[![CI](https://github.com/TENETX/xdeco/actions/workflows/ci.yml/badge.svg)](https://github.com/TENETX/xdeco/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-black.svg)](LICENSE)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-black.svg)](https://nodejs.org/)

</div>

## xdeco 是什么？

Codex 很擅长完成工作，但工作本身经常散落在不同的 task 里：一个想法在当前对话中产生，真正执行它的上下文却在另一个项目 task 中；多个任务同时启动后，状态、结果和产物也很难集中查看。

xdeco 是运行在本地的 Codex 项目 Todo 队列。它连接 Codex 中已有的项目和 task，让你可以从任意对话收集工作，按项目排队，并把 Todo 逐条发送到正确的 Codex task。

```text
任意 Codex task
      │  文字 / 截图 / 自然语言
      ▼
 xdeco 项目队列 ──── 本地 SQLite
      │  每个项目串行调度
      ▼
项目绑定的 Codex task
      │
      └── 自动回收状态、AI 回复与产出物
```

## 核心能力

- **从任意 task 收集工作**：通过自然语言、文字或截图创建结构化 Todo，不必离开当前对话。
- **复用 Codex 项目与 task**：读取 Codex 已同步的本地项目，按项目浏览和搜索 task，不再维护第二份项目清单。
- **按项目独立排队**：不同项目可以并行；同一项目一次只运行一个 Todo，避免上下文和执行顺序失控。
- **自动跟踪执行结果**：Todo 会随着 Codex turn 自动进入运行、完成或失败状态，并保留最终回复与产出物。
- **失败可恢复**：发送失败会暂停当前项目队列；重试后从失败项继续，不会静默跳过或重复发送。
- **插件 UI 与 Web UI**：既可以在 Codex 内使用嵌入式界面，也可以打开独立的本地管理页面。
- **Local-first**：项目、Todo、截图和执行记录默认存放在 `~/.codex/xdeco/`，xdeco 不要求账号，也不依赖远程数据库。

## Todo 如何流转？

```text
draft → ready → sending → running → completed
                            └──────→ failed
任意非活动状态 ───────────────────→ archived
```

| 状态 | 含义 |
| --- | --- |
| `draft` | 只记录，不发送给 Codex |
| `ready` | 已进入所属项目的待执行队列 |
| `sending` / `running` | 正在创建或等待 Codex turn |
| `completed` | 已完成，可以查看 AI 回复和产出物 |
| `failed` | 当前项失败，项目队列暂停，等待重试 |
| `archived` | 已归档，不再参与调度 |

只有用户明确要求“发送”“启动”或“加入队列”时，Todo 才会进入 `ready`。通过截图或普通收集创建的内容默认只是草稿。

## 快速开始

### 环境要求

- Node.js 22+
- pnpm 10+
- 已安装并登录的 Codex App 或 Codex CLI

### 运行本地 Web UI

```bash
git clone https://github.com/TENETX/xdeco.git
cd xdeco
pnpm install
pnpm dev:web
```

打开 [http://localhost:3001](http://localhost:3001)。本地 API 默认监听 `127.0.0.1:4317`。

### 安装 Codex 插件

将本仓库添加为 Codex plugin marketplace，然后安装 xdeco：

```bash
codex plugin marketplace add TENETX/xdeco
codex plugin add xdeco@personal
```

安装或升级插件后，请新建一个 Codex task，让宿主加载最新的 skills、tools 和嵌入式 UI。

## 在 Codex 中使用

你可以直接用自然语言操作：

```text
把“修复导航栏闪烁”作为草稿加到 Website 项目。

把“补登录回归测试”加入 Website 的发送队列。

从这张截图里整理 Todo，先不要执行。

打开 xdeco，看看各项目现在有哪些任务在运行。
```

插件提供的主要能力包括：

- 打开 xdeco 项目/Todo 界面；
- 从文字或截图提炼 Todo；
- 创建草稿或加入项目队列；
- 关联、浏览和搜索 Codex task；
- 查看执行状态、AI 最终回复和产出物；
- 重试失败项或归档不再需要的 Todo。

## 本地数据与隐私

xdeco 自身没有云端服务，默认数据目录为：

```text
~/.codex/xdeco/
├── xdeco.sqlite       # 项目、Todo 与运行记录
├── captures/          # 用户主动提交的截图
└── backups/           # 本地数据库备份
```

这些文件已被仓库的忽略规则排除，不应提交到 Git。发送给 Codex 的内容仍遵循你所使用的 Codex 产品、账户及工作区策略。

## 技术架构

| 模块 | 职责 |
| --- | --- |
| `apps/daemon` | 本地 HTTP API、MCP server、SQLite 和 Codex 调度器 |
| `apps/web` | Next.js 独立管理页面 |
| `packages/shared` | 前后端共享类型与状态定义 |
| `plugins/xdeco` | Codex 插件清单、skill、MCP 启动脚本和构建产物 |
| `docs` | 产品、架构、接口和开发文档 |

调度器使用 SQLite 事务领取 Todo，保证多个插件会话不会重复发送同一项。进程重启后，它会根据已持久化的 task/turn 信息恢复仍在执行的工作。

## 开发与验证

```bash
pnpm typecheck       # TypeScript 检查
pnpm test            # daemon 与调度逻辑测试
pnpm build           # 构建全部 workspace
pnpm build:plugin    # 生成 Codex 插件 bundle
pnpm validate:plugin # 校验插件结构
```

`main` 分支要求 CI 通过，并禁止强制推送和删除。提交改动时请从分支发起 Pull Request。

## 文档

- [产品与技术设计](docs/xdeco-design.md)：产品边界、状态机与调度约束
- [系统架构](docs/architecture.md)：模块、数据链路与故障语义
- [接口参考](docs/interfaces.md)：HTTP API、CLI 和 MCP tools
- [开发与维护](docs/development.md)：环境、配置、调试和发布检查
- [文档导航](docs/README.md)：完整文档索引

## 项目状态

xdeco 目前处于早期开发阶段，数据模型、插件安装方式和界面仍可能调整。欢迎通过 [Issues](https://github.com/TENETX/xdeco/issues) 提交问题或建议，也欢迎发送 Pull Request。

## License

[MIT](LICENSE) © 2026 TENETX
