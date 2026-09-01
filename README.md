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
| [`@sjhmars/happy-bridge`](https://www.npmjs.com/package/@sjhmars/happy-bridge) · [源码](plugins/happy-bridge) | **Remote-control bridge**（远程控制桥）：电脑照常跑 dsh web/桌面；扫码后用手机 Happy App 遥控同一套会话（发消息、看回复、点批准）。Pair by QR code, then the Happy mobile app remote-controls the same harness sessions. | `dsh plugin --profile web add @sjhmars/happy-bridge` | `dsh plugin --profile desktop add @sjhmars/happy-bridge` |
| [`@sjhmars/pi-ai-thinking`](https://www.npmjs.com/package/@sjhmars/pi-ai-thinking) · [源码](plugins/pi-ai-thinking) | **Model configuration helper**（模型配置辅助）：给设置页创建的自定义 `llm-pi-ai` 模型自动补思考强度四档（`off`/`low`/`high`/`max`），不用改源码或手改 settings.yaml。Automatically adds reasoning-effort presets to custom pi-ai models. | `dsh plugin --profile web add @sjhmars/pi-ai-thinking` | `dsh plugin --profile desktop add @sjhmars/pi-ai-thinking` |
| [`@sjhmars/plugin-install`](https://www.npmjs.com/package/@sjhmars/plugin-install) · [源码](plugins/plugin-install) | 设置 → 插件页用 npm 包名安装树外插件（0.3.1+ 装完与换版本都会热挂载）。 | `dsh plugin --profile web add @sjhmars/plugin-install` | 桌面组合已内置；设置页写入 `desktop` |

### 版本兼容 / Harness Compatibility

插件版本与 harness 版本要配套：大版本适配错位时插件可能无法挂载或行为异常。以各插件 `package.json` 的 `peerDependencies` 为准，当前范围：

| 插件版本 | harness 要求 | 说明 |
|---|---|---|
| `@sjhmars/happy-bridge` **0.2.0+** | ≥ `0.1.2-alpha.1` | 适配新 RPC 架构（`sessionController.selectModel` 直调 + `model/selection` 事件观察）。`0.1.0` 只配旧 harness（≤ `0.1.1-rc.1`，apiProxy 时代）。 |
| `@sjhmars/plugin-install` **0.2.0+** | ≥ `0.1.2-alpha.1` | 需要 `PROFILE_TEMPLATES` 对象形状与 `initProfile(dir, bundles, patchReload)` 新签名。`0.1.0` 只配旧 harness。 |
| `@sjhmars/editor-launcher` / `task-notify` / `pi-ai-thinking` / `deepseek-thinking` | `>=0.1.0-rc.5` | `0.1.2-alpha.1` 更新后未逐一复核；如遇挂载异常以各插件 `peerDependencies` 为准。 |

规则：装插件前先看 harness 版本（`dsh --version` 或 git tag），再选插件版本；发布新插件版本时同步更新本表。

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

安装后的生效方式：**设置页（plugin-install 0.3.1+）安装或换版本都会热挂载**，无需重启客户端（界面部分刷新页面即可；更新 `@sjhmars/plugin-install` 自己仍需重启）；**CLI（`dsh plugin add`）在应用进程外运行**，装完仍需重启 `dsh web` 或桌面客户端。每个插件的详细使用说明见各自目录的 `README.md`。

## 发现本仓库插件 / Discover

本仓库打了 `dsh-plugin`、`deepseek-harness`、`plugin` 等 GitHub topic，会出现在：

- GitHub topic 聚合页：<https://github.com/topics/dsh-plugin>
- 社区插件市场：https://github.com/bradeGithub/DSH-Plugins-Marketplace

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
