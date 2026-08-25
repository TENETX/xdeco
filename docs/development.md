# 开发与维护

> 最后核对：2026-08-22

## 1. 环境要求

- Node.js 24+（项目直接使用内置 `node:sqlite`）。
- pnpm 10.32.1（版本声明在根 `package.json`）。
- 已安装并登录的 Codex CLI，且 `codex app-server` 可启动。
- 构建/校验插件时需要 Bash；校验脚本还需要 Python 3，缺少 PyYAML 时会在 `.data/plugin-validator-venv` 创建本地环境。

安装依赖：

```bash
pnpm install
```

`.env.example` 是配置项参考。代码目前直接读取进程环境变量，不主动加载 `.env`；本地 shell、进程管理器或开发工具需要负责注入变量。未配置时可直接使用默认值启动。

## 2. 常用命令

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` / `pnpm dev:web` | 同时启动 HTTP API 和 Next.js 开发服务 |
| `pnpm start:web` | 以非 watch 方式启动 API 和已构建 Web |
| `pnpm build` | 构建/检查所有 workspace 包 |
| `pnpm typecheck` | 全仓 TypeScript 类型检查 |
| `pnpm test` | 运行 daemon 的 Node test suite |
| `pnpm build:plugin` | 把 MCP server 打包到 `plugins/xdeco/scripts/mcp.mjs` |
| `pnpm validate:plugin` | 使用 Codex plugin validator 校验插件 |

建议提交前至少运行：

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm build:plugin
pnpm validate:plugin
```

若只修改 Markdown 文档，可省略插件构建，但仍建议确认链接、命令和接口名与代码一致。

## 3. 配置

| 变量 | 默认值 | 作用 |
| --- | --- | --- |
| `XDECO_HOST` | `127.0.0.1` | HTTP daemon 监听地址 |
| `XDECO_PORT` | `4317` | HTTP daemon 端口 |
| `XDECO_URL` | `http://127.0.0.1:4317` | Web 代理和 CLI 访问的 daemon 地址 |
| `XDECO_CAPTURE_MODEL` | `gpt-5.6-luna` | 文本/截图提炼模型 |
| `XDECO_EXECUTION_MODEL` | `gpt-5.6-terra` | Todo 执行模型 |
| `XDECO_DATA_DIR` | `<CODEX_HOME>/xdeco` | SQLite、上传和捕获文件目录 |
| `XDECO_DATABASE` | `<data-dir>/xdeco.sqlite` | 显式覆盖 SQLite 文件路径 |
| `CODEX_HOME` | `~/.codex` | Codex 状态及 xdeco 默认数据根目录 |
| `XDECO_PYTHON` | `python3` | 插件校验脚本使用的 Python |
| `XDECO_VALIDATOR_VENV` | `.data/plugin-validator-venv` | 校验器虚拟环境目录 |

为测试或并行开发设置独立 `XDECO_DATA_DIR`/`XDECO_DATABASE`，避免污染真实队列。不要把数据库、截图或 `.data` 提交到 Git。

## 4. 开发链路

### Web 页面

`pnpm dev:web` 启动：

- daemon：`http://127.0.0.1:4317`
- Next.js：`http://localhost:3001`

浏览器只调用 Next.js 下的 `/api/*`；route handler 使用 `XDECO_URL` 转发到 daemon。代理当前仅导出 GET、POST、PATCH。

### MCP 插件

`apps/daemon/src/mcp.ts` 是源码，`plugins/xdeco/scripts/mcp.mjs` 是提交在仓库中的打包产物。修改 daemon 中会影响插件的代码后，必须重新执行：

```bash
pnpm build:plugin
pnpm validate:plugin
```

插件 manifest 位于 `plugins/xdeco/.codex-plugin/plugin.json`，MCP 启动配置位于 `plugins/xdeco/.mcp.json`。宿主通常只在新 task 中重新加载插件 skill 和 tools，因此验证新版插件时请新开 task。

### 数据层

数据库 schema 在 `apps/daemon/src/database.ts` 内以幂等 SQL 创建。变更 schema 时：

1. 为已有数据库设计显式、可重复的迁移路径。
2. 保持 `packages/shared` 类型和 SQL 字段映射一致。
3. 使用临时 SQLite 路径覆盖新库与旧库迁移测试。
4. 特别验证 `claimNextReady` 的事务和每项目单活约束。

## 5. 测试分布

daemon 测试与源码同目录：

- `database.test.ts`：schema、旧数据迁移和持久化。
- `service.test.ts`：状态规则、串行调度、失败与重试。
- `app-server.test.ts`：Codex turn 结果提取。
- `projects.test.ts`：Codex 本地项目发现。
- `widget.test.ts`：嵌入式 HTML 的关键交互契约。

新增业务规则优先在 service/database 层覆盖；UI 测试只锁定必要的用户可见契约，避免依赖大段 HTML 快照。

## 6. 排障

### 页面显示“Codex 暂不可用”

确认 `codex` 在 PATH 中、CLI 已登录，并手动运行 `codex app-server` 检查启动错误。daemon 会把子进程 stderr 加上 `[codex app-server]` 前缀输出。

### 页面打不开或 API 报错

```bash
curl http://127.0.0.1:4317/health
```

若 daemon 正常但 Web 失败，检查 Web 进程的 `XDECO_URL`。若端口被占用，成对修改 `XDECO_PORT` 和 `XDECO_URL`。

### 队列停住

先查看最早的 `failed`、`sending` 或 `running` Todo。失败项需要显式 retry；进程崩溃遗留的活动状态在 v0.2 不会自动重放，以避免重复执行，处理前应核对对应 Codex task/turn 是否已经产生结果。

### 插件修改未生效

确认已执行 `pnpm build:plugin`，产物时间已更新，并新建 Codex task 重新加载插件。

## 7. 发布检查

1. 更新根 `package.json`、MCP server 和 plugin manifest 中需要同步的版本号。
2. 运行类型检查、测试、全量构建、插件构建和插件校验。
3. 用独立数据目录完成一次：创建项目 → 添加 `ready` Todo → 自动创建/复用 task → 完成 → 读取结果。
4. 验证失败会暂停队列，retry 后能继续下一条。
5. 验证 Web 页面和嵌入式 Widget 的项目、状态、结果展示一致。
6. 若接口、配置或状态规则变化，同步更新 `docs/`。
