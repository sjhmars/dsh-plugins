# 归档同步验证

## 自动验证

2026-09-08，Windows / 本地插件源码。协议参考 Happy `ac64b9b4677870f7b7a9eacfd0780959229717f1`。

| 检查 | 结果 |
|---|---|
| 插件 `test` 脚本 | 72 项通过，其中新增归档集成测试 16 项 |
| 插件 `typecheck` 脚本 | 通过 |
| 插件 `build` 脚本 | 通过，生成 Host、Client 和声明文件 |
| 编译后 Host 模块的归档集成测试 | 16 项通过 |

执行命令：

```powershell
pnpm --config.verify-deps-before-run=false run test
pnpm --config.verify-deps-before-run=false run typecheck
pnpm --config.verify-deps-before-run=false run build
```

编译后模块验证使用同一组断言，测试 loader 将 Bridge 和 Socket 入口切换到 `lib/types/*.js`：

```powershell
$env:HAPPY_BRIDGE_TEST_BUILT = '1'
node --experimental-transform-types --experimental-test-isolation=none --import ./tests/peer-stubs/register.mjs --test tests/archive-integration.test.ts
```

本机 pnpm 默认会在运行脚本前尝试安装整个插件工作区依赖，因此指定 `verify-deps-before-run=false`，使用现有依赖执行包中原有脚本，不修改工作区依赖或锁文件。构建中的 `external` / `noExternal` 弃用提示来自现有 tsdown 配置。

`archive-integration.test.ts` 执行实际 `HappyBridge`、`HappySessionSocket`、归档适配器、模型同步、历史回放和消息编排。Happy Socket/HTTP、DSH Registry/Agent/模型服务和附件准入使用测试替身，没有访问账号或调用真实模型。

覆盖启动归档、自动重连、模型元数据回声、ACK 超时后回声、版本冲突的两种到达顺序、新消息恢复、换模型及思考强度恢复、无效选择、Host 写入失败重试、图片输入、历史同步期间输入排队、云端归档失败重试、快速归档恢复、DSH 主动恢复、多会话同步和卸载期间禁止继续发消息或心跳。

## 实际手机联调

尚未执行实际 Happy 手机端联调。当前安装实例未被替换，部署中的 Happy 服务版本也未验证。自动测试不能替代下面的真实联调；以下为待执行步骤，不是通过记录。

1. 在单独测试 profile 安装该构建，使用专门测试会话和可识别的标题；不要替换日常使用的 profile。
2. DSH 归档一场含历史的对话，重启测试服务。检查 DSH 仍隐藏、Happy 仍可查看历史；仅打开历史不恢复。
3. 手机发送新文字，检查原 DSH 会话显示、原 Happy ID 上线并返回回复。重新归档后分别发送图片加文字和纯图片。
4. 在「完整」档，手机为已归档会话切换模型，再切换或清空思考强度。检查两端选择一致、原会话恢复、切换本身没有模型请求。
5. 在未归档会话的两端分别切换模型，检查即时同步。手机切换后马上发消息，核对该请求使用新选择。
6. 手机归档后立即发消息或换模型，检查不会被迟到的归档请求再次隐藏。中断测试网络后恢复，检查归档连接重连不会自行上线。
7. 降为「只看」档，检查发消息或切换模型不会恢复。记录错误反馈和原会话 ID；无需在记录中包含凭据或连接 token。

## 保留限制

Happy 首次创建记录默认活跃，首次导入归档历史可能短暂显示活跃，随后归档接口纠正；DSH 的归档标记不会被该过程删除。没有新增跨进程消息收件箱，不承诺关机消息补拉或崩溃后的恰好一次交付。旧模型快照只作为启动基线，不触发恢复。
