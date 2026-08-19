# dsh-plugins

![dsh-plugin](https://img.shields.io/badge/topic-dsh--plugin-blue)
![deepseek-harness](https://img.shields.io/badge/topic-deepseek--harness-blue)
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

| 插件（npm） | 用途 | 安装命令 |
|---|---|---|
| [`@sjhmars/editor-launcher`](https://www.npmjs.com/package/@sjhmars/editor-launcher) · [源码](plugins/editor-launcher) | 在 Session 头部加编辑器选择器：列出本机已安装编辑器（含注册表检测，支持非 C 盘安装的 JetBrains / Visual Studio），选中记为默认；点击会话中模型 Read/Edit/Write 或正文提及的文件路径，用所选编辑器打开（Web 端）。 | `dsh plugin --profile web add @sjhmars/editor-launcher` |
| [`@sjhmars/task-notify`](https://www.npmjs.com/package/@sjhmars/task-notify) · [源码](plugins/task-notify) | Agent 任务结束、工具要你批准、或向你提问时弹出系统桌面通知（Web 与 Desktop 共用 Host 插件）。 | `dsh plugin --profile web add @sjhmars/task-notify` |

### 安装说明 / Install

在 web profile 安装已发布的包：

```sh
dsh plugin --profile web add @sjhmars/editor-launcher
dsh plugin --profile web add @sjhmars/task-notify
```

Desktop 是独立 profile，正式安装同样用包名：

```sh
dsh plugin --profile desktop add @sjhmars/task-notify
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

## License

MIT
