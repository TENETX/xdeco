# xdeco 文档

这里记录当前代码已经实现的行为。接口与运行约束以代码为最终依据；行为发生变化时，应在同一个变更中同步更新对应文档。

## 阅读路径

### 使用者

1. 从仓库 [README](../README.md) 完成本地启动。
2. 阅读 [产品与技术设计](xdeco-design.md)，理解 Project、Todo 和队列状态。
3. 需要脚本化操作时查阅 [接口参考](interfaces.md)。

### 开发者

1. 阅读 [系统架构](architecture.md)，了解模块边界和两条主要执行链路。
2. 按 [开发与维护](development.md) 配置环境并运行验证。
3. 修改接口时同时核对 `packages/shared`、HTTP、MCP、Web 和插件 UI。

### 维护者

- 产品范围与不变量：[产品与技术设计](xdeco-design.md)
- 数据迁移、故障语义和已知限制：[系统架构](architecture.md)
- 发布前检查和排障：[开发与维护](development.md)
- 对外调用契约：[接口参考](interfaces.md)

## 文档维护约定

- 新增或修改环境变量：同步更新 `.env.example` 和 `development.md`。
- 新增或修改 HTTP/MCP/CLI 接口：同步更新 `interfaces.md`。
- 修改 Todo 状态、队列领取或失败恢复：同步更新 `xdeco-design.md` 和 `architecture.md`。
- 修改目录职责或启动方式：同步更新根目录 `README.md`。
- 文档描述“当前行为”，规划中的能力必须明确标为未实现。
