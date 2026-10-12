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
├── release/              # 六个插件的 npm tarball
└── plugins/
    └── <name>/           # 一个插件 = 一个 npm 包
        ├── package.json  # dsh.bundle + dsh.client manifest
        ├── cordis.patch.yml
        └── src/ lib/
```

## 插件列表 / Plugins

`web` 和 `desktop` 是两套互不相通的 profile：网页版用 `--profile web`，桌面客户端用 `--profile desktop`。装错 profile，另一个客户端看不见。

| 插件（npm） | 用途 |
|---|---|
| [`@sjhmars/editor-launcher`](https://www.npmjs.com/package/@sjhmars/editor-launcher) · [源码](plugins/editor-launcher) | 在 Session 头部加编辑器选择器：列出本机已安装编辑器（含注册表检测，支持非 C 盘安装的 JetBrains / Visual Studio），选中记为默认；点击会话中模型 Read/Edit/Write 或正文提及的文件路径，用所选编辑器打开（Web 端）。 |
| [`@sjhmars/task-notify`](https://www.npmjs.com/package/@sjhmars/task-notify) · [源码](plugins/task-notify) | Agent 任务结束、工具要你批准、或向你提问时弹出桌面通知。Windows 上 Web 和 Desktop 的批准都是右下角卡片（允许一次 / 拒绝 / 关闭后出黄框）。 |
| [`@sjhmars/happy-bridge`](https://www.npmjs.com/package/@sjhmars/happy-bridge) · [源码](plugins/happy-bridge) | **Remote-control bridge**（远程控制桥）：电脑照常跑 dsh web/桌面；扫码后用手机 Happy App 遥控同一套会话（发消息、看回复、点批准）。Pair by QR code, then the Happy mobile app remote-controls the same harness sessions. |
| [`@sjhmars/pi-ai-thinking`](https://www.npmjs.com/package/@sjhmars/pi-ai-thinking) · [源码](plugins/pi-ai-thinking) | **Model configuration helper**（模型配置辅助）：给设置页创建的自定义 `llm-pi-ai` 模型自动补思考强度四档（`off`/`low`/`high`/`max`），不用改源码或手改 profile patch。Automatically adds reasoning-effort presets to custom pi-ai models. |
| [`@sjhmars/plugin-install`](https://www.npmjs.com/package/@sjhmars/plugin-install) · [源码](plugins/plugin-install) | Plugins 的本包详情页安装 npm bundle 和普通组件；安装后提示重启。 |
| [`@sjhmars/segmented-compaction`](https://www.npmjs.com/package/@sjhmars/segmented-compaction) · [源码与本地开发说明](plugins/segmented-compaction) | 原 basic-compaction 超限后，按完整历史与必要的文本切片滚动压缩；含中英文设置。 |

### 版本兼容 / Harness Compatibility

插件版本与 harness 版本要配套：大版本适配错位时插件可能无法挂载或行为异常。以各插件 `package.json` 的 `peerDependencies` 为准，当前范围：

| 插件版本 | harness 要求 | 说明 |
|---|---|---|
| `@sjhmars/happy-bridge` **0.3.10+** | ≥ `0.2.1-alpha.1` | Loader volatile 配置、configForms、sessionQuery 和 assistant stream API。 |
| `@sjhmars/pi-ai-thinking` **0.1.1+** | ≥ `0.2.1-alpha.1` | 以 Loader entry id 定位官方模型配置，保存到 profile patch。 |
| `@sjhmars/segmented-compaction` **0.1.3+** | ≥ `0.2.1-alpha.1` | 新的配置页、request-only 摘要指令、tool 消息及原压缩事务跟踪。 |
| `@sjhmars/plugin-install` **0.5.0+** | ≥ `0.2.1-alpha.1` | 官方包操作安装 bundle 和普通组件；失败恢复清单与锁文件，安装后重启。 |
| `@sjhmars/editor-launcher` **0.1.6+** | ≥ `0.2.1-alpha.1` | 当前会话作用域、Host home 路径、图标和系统关联应用回退。 |
| `@sjhmars/task-notify` **0.1.3+** | ≥ `0.2.1-alpha.1` | 异步会话历史、提问 waterfall、卸载后取消通知投递。 |

这六个插件的开发依赖通过 link: 指向相邻 deepseek-harness checkout 的公开包。官方仓库先完成构建，然后在此仓库运行 pnpm install --ignore-scripts；pnpm run test:compat 验证 Loader 热更新、拒绝写入、客户端页面、编辑器路径和通知生命周期；pnpm --filter @sjhmars/plugin-install run test 检查安装结果。此表依据本地 Harness 0.2.1-alpha.1，并在独立 DSH_HOME 下验证了六个包的 CLI 安装和 bundle 选择。原生弹窗、具体编辑器启动和独立 Desktop 壳需另行验收。

当前适配使用官方 Cordis 4.0.5-alpha.1 和 Schemastery 3.18.5-alpha.1；各插件的 peer 范围明确包含这两个预发布版本。

规则：装插件前先看 harness 版本（`dsh --version` 或 git tag），再选插件版本；发布新插件版本时同步更新本表。

<a id="install"></a>
### 安装与更新 / Install and update

这些版本适配 Harness 0.2.1-alpha.1。Web 和 Desktop 分别保存插件；Desktop 还需要确认应用自身的版本。下面的源码命令在 Windows CMD 中执行。

#### 应用内安装

打开侧栏「插件 / Plugins」→「添加插件 / Add plugin」，选择 npm 官方源，输入兼容表中的 `包名@版本` 后安装。已有插件也可以用相同入口更新，按结果提示重启。Happy 和分段压缩的配置位于各自的插件详情页。

其他五个兼容版本已发布 npm。plugin-install 0.5.0 是待发布的新版本；现在可安装 release 中的本地 tarball，见 [本地包与开发联调](#local-packages)。

<a id="web-install"></a>
#### Web：从官方源码仓库安装

plugin-install 0.5.0 发布 npm 后，这条命令可安装六个指定版本；发布前将其包名参数换为 H:\dsh-plugin\release\sjhmars-plugin-install-0.5.0.tgz：

```bat
cd /d H:\deepseek-harness
pnpm dsh plugin --profile web add ^
  @sjhmars/editor-launcher@0.1.6 ^
  @sjhmars/happy-bridge@0.3.10 ^
  @sjhmars/pi-ai-thinking@0.1.1 ^
  @sjhmars/plugin-install@0.5.0 ^
  @sjhmars/segmented-compaction@0.1.3 ^
  @sjhmars/task-notify@0.1.3 ^
  --registry=https://registry.npmjs.org
```

`plugin-install` 是可选插件；官方「添加插件」支持 bundle，本包详情页的安装框也接受普通组件。普通组件首次安装还需配置启用，已有配置在重启后使用新版本。若使用 npm 安装的 Web CLI，把 `pnpm dsh` 换成 `dsh`。

已有插件仍使用 `add 包名@版本` 更新。例如：

```bat
cd /d H:\deepseek-harness
pnpm dsh plugin --profile web add @sjhmars/happy-bridge@0.3.10 --registry=https://registry.npmjs.org
```

CLI 安装或更新后，停止并重新启动 Web 进程，再在插件页核对版本和启用状态。单纯刷新浏览器不能替代进程重启。

<a id="desktop-install"></a>
#### Desktop：应用内安装或使用桌面版注册的命令

Desktop 优先使用上面的应用内安装入口。命令行安装需要先启动 Desktop 一次以初始化 profile，再通过应用的「管理 dsh 命令 / Manage dsh Command」注册命令；完全退出 Desktop 后，使用该命令：

```bat
dsh plugin --profile desktop add @sjhmars/happy-bridge@0.3.10 --registry=https://registry.npmjs.org
```

源码仓库的 `pnpm dsh` 和 npm 安装的 `dsh` 都不能管理 `desktop` profile。Desktop 注册的命令可以管理已有的桌面 profile，完成后重新打开应用。

Desktop 通常无需安装可选的 `plugin-install`。如果已使用它，更新前应确认其 `profile` 配置为 `desktop`；配置示例见 [plugin-install README](plugins/plugin-install/README.md)。

<a id="local-packages"></a>
#### 本地包与开发联调

本地构建可以用 `release` 目录里的 `.tgz` 替代包名安装，也可以在应用内安装框填写其绝对路径。例如安装尚未发布 npm 的新版安装器：

```bat
cd /d H:\deepseek-harness
pnpm dsh plugin --profile web add H:\dsh-plugin\release\sjhmars-plugin-install-0.5.0.tgz --registry=https://registry.npmjs.org
```

路径必须指向运行 Harness 的机器；浏览器所在机器的文件不会自动上传。开发时的客户端 overlay 和构建方式见各插件 README。

## 发现本仓库插件 / Discover

本仓库打了 `dsh-plugin`、`deepseek-harness`、`plugin` 等 GitHub topic，会出现在：

- GitHub topic 聚合页：<https://github.com/topics/dsh-plugin>
- 社区插件市场：https://github.com/bradeGithub/DSH-Plugins-Marketplace

安装指定兼容版本或本地 tarball，见 [安装与更新](#install)。

## 构建 / Build

在仓库根运行一次构建全部插件：

```bat
cd /d H:\dsh-plugin
pnpm install --ignore-scripts
pnpm run build
pnpm run typecheck
```

> 插件的 `@deepseek-ai/*` 是 peerDependencies，运行时由 harness 安装树提供；类型解析走 `tsconfig.base.json` 的 `paths`（指向本地 harness checkout 的 `lib/types`）。构建工具由各插件的开发依赖提供，具体步骤见各插件 README。

构建后可把六个插件打包到统一目录，检查包内文件后再发布 `.tgz`。以下命令在 Windows CMD 中执行：

```bat
cd /d H:\dsh-plugin
pnpm run pack --pack-destination H:\dsh-plugin\release
```

根目录 `dsh-plugins` 是 `private` 工作区；发布时指定单个插件的 tarball。npm 已存在的版本号不能重复发布；每次发布同步更新插件版本和兼容表。plugin-install 0.5.0 已构建打包，等待发布；其他五个插件无需重复发布。以下命令对新版安装器做预检：

```bat
cd /d H:\dsh-plugin\release
npm publish sjhmars-plugin-install-0.5.0.tgz --dry-run --access public --registry=https://registry.npmjs.org
```

正式发布新版本时，将文件名换为对应的新 tarball，并去掉 `--dry-run`。如果尚未登录 npm，先运行 `npm login --registry=https://registry.npmjs.org`。发布预检不上传安装包。

## License

MIT
