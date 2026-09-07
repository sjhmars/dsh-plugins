# 分段压缩 / Segmented compaction

`@sjhmars/segmented-compaction` 只在原 basic-compaction 摘要请求明确返回 `CONTEXT_WINDOW_EXCEEDED` 后恢复。原请求成功、普通对话、其他压缩提供方以及认证、限额、网络等错误均不触发分段。

Recover an original basic-compaction request only after a classified context overflow. Successful requests and unrelated failures pass through.

## 工作方式

插件通过公开 `llm/stream` waterfall 接入，保留原系统提示、工具定义、模型参数与最后的八节压缩指令。每段调用原请求绑定的 LLM runtime，内部身份标记避免递归；不会调用受保护的 summarize，也不会嵌套 compactRegion。

优先组合完整消息和工具调用组。完整单元无法容纳时，将文本按段落、行和 Unicode 字符边界切片。工具参数和结果成为带来源、调用标识和范围的历史文本，半截 JSON 不会作为工具调用发送。图片保持完整，无法容纳时失败。每段合并上一段的 `<compacted-summary>`，串行得到最终摘要。

原始失败流、失败分段内容和中间摘要不向外输出。全部完成后仅返回最终摘要及累计用量，仍由原 compactRegion 验证并提交一次历史替换。取消、卸载或失败不提交中间摘要；原 Harness 已执行的工具结果裁剪不回滚。失败运行不会自动续用中间摘要。

## 设置

Web/Desktop 共用客户端设置入口：设置 → 插件 → 分段压缩。支持中文和英文。保存影响下一次恢复；当前恢复使用配置快照。模型窗口和原压缩触发阈值不会被修改。

| 字段 | 默认 | 含义 |
|---|---:|---|
| enabled | true | 原摘要超限后启用恢复 |
| contextRatio | 0.8 | 可使用的模型窗口比例 |
| maxShrinkRetries | 8 | 当前段首次尝试失败后，最多缩小重试次数 |
| maxCalls | 128 | 原摘要请求和所有分段成功/失败尝试的总调用上限 |

分段大小自动跟随当前压缩模型的窗口，不再配置固定输入上限。输入预算为 `floor(contextWindow × contextRatio) − maxTokens`。使用 Harness token meter 和路由图片定价估算系统提示、工具、指令、来源说明、历史与滚动摘要。输出预留继承原请求，未显式提供时取模型默认值。估价不是服务端 tokenizer；当前段明确超限后，按历史预算与被拒绝请求实际历史估算量的较小值减半，未成功前不推进位置。

计数单位是本插件观察或发起的 LLM 调用；其他中间件内部隐藏的网络重试不属于独立可观察调用。空摘要、截断、工具输出、摘要未缩小、固定内容超预算或达到上限均停止恢复。请仍将模型 contextWindow 配置为服务端实际支持值，插件不会把 256K 服务变成 1M 服务。

## 日志与数据

每次恢复在 `$DSH_HOME/segmented-compaction/<session-hash>/<run-id>.jsonl` 建立独立日志，关联原 sessionId 和 compactionId。分段请求在发送前写入并同步日志；响应包含内容、错误和用量。日志失败会停止恢复。目录和文件使用私有权限创建，Windows 的实际访问控制仍由所在目录 ACL 决定。

日志包含会话原文、工具参数和摘要，应按会话数据保护；请求对象不包含模型连接凭据。本插件不创建额外凭据存储，也不连接其他模型服务。日志没有自动清理或失败恢复复用，运维可在任务结束后按保留策略删除。主会话不增加自定义事件类型；内部请求详情由旁路日志保存。

## 开发与兼容

本次验证使用相邻 Harness checkout `cd5ef81481` 的已构建公开包。需要 Node 22.23.2 或更新的受支持 Node，以及当前的 llm/stream、tokenMeter、settingsScope、客户端 slots/locale API。package.json 的版本下限不是所有历史 alpha 构建的兼容证明；特别需要拆分后的 dsh-client-ui-settings 和 dsh-client-ui-renderer。Desktop 使用同一 Web 客户端模块，但本次没有启动独立 Desktop 壳验证。

```powershell
cd H:\dsh-plugin\plugins\segmented-compaction
node scripts/prepare-dev.mjs
node scripts/build.mjs --check
node scripts/build.mjs
node --import ./tests/register.mjs --test tests/*.test.mjs
npm pack --ignore-scripts --pack-destination .artifacts
```

prepare-dev 只在插件自己的 node_modules 建立开发依赖链接。默认读取相邻 deepseek-harness 已构建的公开包，可用 HARNESS_ROOT 指向其他 checkout。不修改 Harness、preset 或运行中 profile。测试通过公开服务加载真实 BasicCompactionEngine，模型适配器使用合成响应，私人会话不作为夹具。

`dev/cordis.patch.yml` 使用此机器的绝对 file URL，可在其他机器修改该 URL。用独立 DSH_HOME、DSH_AGENTS_HOME 和空工作区启动；--patch 放在应用参数之前：

```powershell
$env:DSH_HOME = 'H:/dsh-plugin/plugins/segmented-compaction/.artifacts/home'
$env:DSH_AGENTS_HOME = 'H:/dsh-plugin/plugins/segmented-compaction/.artifacts/agents'
node H:/deepseek-harness/apps/cli/lib/bin.js --profile web --patch H:/dsh-plugin/plugins/segmented-compaction/dev/cordis.patch.yml --port 3197 --no-open
```

真实模型连接须通过隔离环境的正常设置/凭据配置提供。不要将凭据或 .artifacts 提交到版本库。

## 安装

当前交付为源码和本地 tarball，尚未发布 npm，也未安装到用户运行的 profile。开发验证使用上述 overlay。发布后可按目标 profile 安装：

```powershell
dsh plugin --profile web add @sjhmars/segmented-compaction
dsh plugin --profile desktop add @sjhmars/segmented-compaction
```

Web 与 Desktop 是两个独立 profile。CLI 安装后重启相应应用，客户端刷新后查看设置卡。

## 验证范围

单元和服务集成测试覆盖原请求放行、触发分类、完整分组、Unicode/工具内容精确覆盖、滚动摘要、缩小重试、取消与卸载、并发隔离、调用上限、日志失败、图片拒绝、手动/压力/溢出压缩、一次提交和事件种子重新加载后继续对话。事件重新加载测试不等同于磁盘数据库迁移测试。

隔离 Web 界面验证了中英文设置卡与配置保存。隔离 headless profile 通过现有真实模型连接返回 SEGMENTED_SMOKE_OK，证明插件挂载后的普通调用通路；真实服务端超限恢复仍以合成模型适配器的确定性集成测试验证，没有声称真实服务端完整超限场景已通过。GIF 编码需要可用 ffprobe；当前环境缺少此依赖，尚未生成 GIF。
