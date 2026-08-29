# dsh-plugins

![dsh-plugin](https://img.shields.io/badge/topic-dsh--plugin-blue)
![deepseek-harness](https://img.shields.io/badge/topic-deepseek-harness-blue)
![plugins](https://img.shields.io/badge/topic-plugins-blue)

DeepSeek Harness 的**插件集合仓库**（pnpm workspace）。每个插件是一个独立 npm 包，位于 `plugins/<name>/`，可单独构建、打包、发布到 npm，通过 `dsh plugin` 安装到 profile。

## 仓库结构 / Layout

```
dsh-plugins/
├── package.json          # workspace 根（private，聚合脚本）
├── pnpm-workspace.yaml   # packages: ['plugins/*']
├── tsconfig.base.json    # 共享 TS 配置（paths 指向 harness checkout 的 lib/types）
└── plugins/
    └── <name>/           # 一个插件 = 一个 npm 包
        ├── package.json  # dsh.bundle + dsh.client manifest
        ├── cordis.patch.yml
        └── src/ lib/
```

## 插件列表 / Plugins

`web` 和 `desktop` 是两套互不相通的 profile：网页版用 `--profile web`，桌面客户端用 `--profile desktop`。装错 profile，另一个客户端看不见。

| 插件（npm） | 用途 | Web | 桌面 |
|---|---|---|---|
| [`@sjhmars/editor-launcher`](https://www.npmjs.com/package/@sjhmars/editor-launcher) · [源码](plugins/editor-launcher) | 在 Session 头部加编辑器选择器：列出本机已安装编辑器（含注册表检测，支持非 C 盘安装的 JetBrains / Visual Studio），选中记为默认；点击会话中模型 Read/Edit/Write 或正文提及的文件路径，用所选编辑器打开（Web 端）。 | `dsh plugin --profile web add @sjhmars/editor-launcher` | `dsh plugin --profile desktop add @sjhmars/editor-launcher` |
| [`@sjhmars/task-notify`](https://www.npmjs.com/package/@sjhmars/task-notify) · [源码](plugins/task-notify) | Agent 任务结束、工具要你批准、或向你提问时弹出桌面通知。Windows 上 Web 和 Desktop 的批准都是右下角卡片（允许一次 / 拒绝 / 关闭后出黄框）。 | `dsh plugin --profile web add @sjhmars/task-notify` | `dsh plugin --profile desktop add @sjhmars/task-notify` |
| [`@sjhmars/happy-bridge`](https://www.npmjs.com/package/@sjhmars/happy-bridge) · [源码](plugins/happy-bridge) | 电脑照常跑 dsh web/桌面；扫码后用手机 Happy App 遥控同一套会话（发消息、看回复、点批准）。 | `dsh plugin --profile web add @sjhmars/happy-bridge` | `dsh plugin --profile desktop add @sjhmars/happy-bridge` |
| [`@sjhmars/plugin-install`](https://www.npmjs.com/package/@sjhmars/plugin-install) · [源码](plugins/plugin-install) | 设置 → 插件页用 npm 包名安装树外插件（装完需重启）。 | `dsh plugin --profile web add @sjhmars/plugin-install` | 桌面组合已内置；设置页写入 `desktop` |

### 安装说明 / Install

网页版（`dsh web`）只认 `web` profile：

```sh
dsh plugin --profile web add @sjhmars/editor-launcher
dsh plugin --profile web add @sjhmars/task-notify
dsh plugin --profile web add @sjhmars/happy-bridge
dsh plugin --profile web add @sjhmars/pi-ai-thinking
dsh plugin --profile web add @sjhmars/plugin-install
```

桌面客户端只认 `desktop` profile。已内置安装器时，优先用设置 → 插件，不必再跑 CLI。没有安装器、或要用 CLI 时：

```sh
dsh plugin --profile desktop add @sjhmars/editor-launcher
dsh plugin --profile desktop add @sjhmars/task-notify
dsh plugin --profile desktop add @sjhmars/happy-bridge
dsh plugin --profile desktop add @sjhmars/pi-ai-thinking
```

不要把本仓库插件目录 `dsh plugin add` / pnpm link 进 profile。本地边改边测用客户端 overlay（绝对路径），见各插件 README。

安装后重启 `dsh web` 或桌面客户端即可生效。每个插件的详细使用说明见各自目录的 `README.md`。

## 发现本仓库插件 / Discover

本仓库打了 `dsh-plugin`、`deepseek-harness`、`plugin` 等 GitHub topic，会出现在：

- GitHub topic 聚合页：<https://github.com/topics/dsh-plugin>
- 社区插件市场（按 topic 抓取）：如 [DSH-Plugins-Marketplace](https://github.com/bradeGithub/DSH-Plugins-Marketplace)

所有插件均发布到 npm（`@sjhmars/*` scope），可直接按包名安装。

## 构建 / Build

在仓库根运行一次构建全部插件：

```sh
cd H:\dsh-plugin
pnpm run build        # = pnpm -r run build（tsc → lib/types，tsdown → lib/index.js + lib/client.js）
pnpm run typecheck    # = pnpm -r run typecheck
```

> 插件的 `@deepseek-ai/*` 是 peerDependencies，运行时由 harness 安装树提供；类型解析走 `tsconfig.base.json` 的 `paths`（指向本地 harness checkout 的 `lib/types`）。构建用本地 harness checkout 的 tsc / tsdown（见各插件 README）。

根目录 `dsh-plugins` 是 `private` 工作区，**不要在仓库根执行 `pnpm publish`**。发布某一个插件：

```sh
cd H:\dsh-plugin
pnpm --filter @sjhmars/task-notify publish --no-git-checks --access public
```

## License

MIT
