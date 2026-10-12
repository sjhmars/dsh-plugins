# @sjhmars/editor-launcher

在 Session 头部（Session log 按钮左侧）加一个**编辑器选择器**：列出本机已安装的编辑器，选中即记为默认；之后**点击会话中模型 Read/Edit/Write 输出的文件路径链接**，就会用你选的编辑器打开该文件（Web 端）。

Adds an **editor picker** to the Session header (left of the Session-log button): it lists the editors installed on this machine, and the one you choose is remembered as the default. After that, **clicking the file-path links the model produced in Read/Edit/Write tool rows opens those files with your chosen editor** (Web).

## 兼容版本 / Compatibility

0.1.6 适配 Harness 0.2.1-alpha.1。客户端使用 Cordis Context、ui-renderer、uiSession 和 api-session-controller；图标采用当前 ui-primitives 导出。相对路径用当前会话工作目录，~/ 标签用 Host home；启动失败通过官方 session.openWorkspacePath 回退。无需 client-runtime 或 invariant companion。

Version 0.1.6 targets Harness 0.2.1-alpha.1. The client uses Cordis Context, ui-renderer, uiSession, api-session-controller and current icons. Relative paths use the current Session directory, and ~/ labels use the Host home. Failed launches fall back through session.openWorkspacePath.

构建后运行 pnpm run test:compat，验证构建客户端的槽位、缓存、会话切换、路径与系统打开回退。测试替身处理启动请求，具体编辑器需另行验收。

Run pnpm run test:compat after building to check the built client's slot, cache, Session switching, paths and default-open fallback. Launch requests use a test double; native editors require separate verification.

## 工作原理 / How it works

- **Host half**（`src/index.ts`）暴露一个 Typert Remote 服务 `EditorLauncherService`（`editorLauncher/listEditors`、`editorLauncher/openWith`）。Gateway 的 SRC 声明路径自动发现它，无需生成 descriptors。
- **Browser half**（`src/client/`）：
  - 通过 `conversation.session.header.utilities` 槽位注册选择器胶囊（`order: -1`，位于 Session log 左侧）。
  - 在 `document` 捕获阶段拦截 `[data-tool]` 工具行里无 `aria-expanded` 的路径链接点击，改用所选编辑器打开；编辑器缺失或启动失败时回退系统默认应用。
  - 偏好（默认编辑器 id）存于 `localStorage['dsh.editor-launcher.preferred']`。
- Web 与桌面共用同一条 `/api` + Typert Gateway 链路（`createSharedFetchHandler`），因此两端零特判。

## 安装 / Install

安装入口和 profile 的区别见 [仓库安装说明](../../README.md#install)。Web 从 npm 安装 0.1.6；以下命令在 Windows CMD 中执行：

```bat
cd /d H:\deepseek-harness
pnpm dsh plugin --profile web add @sjhmars/editor-launcher@0.1.6 --registry=https://registry.npmjs.org
```

本地构建可把包名替换为已打包的 `.tgz` 绝对路径。Desktop 通过应用内「插件 → 添加插件」安装；如需命令行，使用 Desktop 注册的 `dsh`，完全退出应用后再执行。

重启对应应用后，Session log 左侧会出现“用编辑器打开”胶囊；点击会话中的 Read/Edit/Write 文件链接即用所选编辑器打开。

## 构建 / Build

开发依赖 link: 到相邻 deepseek-harness 的公开包。先构建官方仓库，然后在本仓库运行：

Development dependencies link to the adjacent Harness checkout. Build Harness first, then run in this repository:

~~~sh
pnpm install --ignore-scripts
pnpm --filter @sjhmars/editor-launcher run build
pnpm run test:compat
~~~

lib/client.js 是浏览器 bundle；lib/index.js 是 Node 入口。

lib/client.js is the browser bundle; lib/index.js is the Node entry.

## 支持的编辑器 / Detected editors

VS Code / VS Code Insiders、Cursor、Sublime Text、Notepad++、Neovim、Vim，以及 macOS 的 `open -a` 应用。检测方式：`where`/`which`（PATH）+ 各平台常见安装路径。

## 已知限制 / Known Limitations

- 编辑器候选清单内置在 Host 代码中，暂不支持用户配置额外编辑器（`extraEditors` 留作后续）。
