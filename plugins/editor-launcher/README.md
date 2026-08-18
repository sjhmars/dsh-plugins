# @dsh/editor-launcher

在 Session 头部（Session log 按钮左侧）加一个**编辑器选择器**：列出本机已安装的编辑器，选中即记为默认；之后**点击会话中模型 Read/Edit/Write 输出的文件路径链接**，就会用你选的编辑器打开该文件（Web 与桌面客户端都支持）。

Adds an **editor picker** to the Session header (left of the Session-log button): it lists the editors installed on this machine, and the one you choose is remembered as the default. After that, **clicking the file-path links the model produced in Read/Edit/Write tool rows opens those files with your chosen editor** (Web and Desktop).

## 工作原理 / How it works

- **Host half**（`src/index.ts`）暴露一个 Typert Remote 服务 `EditorLauncherService`（`editorLauncher/listEditors`、`editorLauncher/openWith`）。Gateway 的 SRC 声明路径自动发现它，无需生成 descriptors。
- **Browser half**（`src/client/`）：
  - 通过 `conversation.session.header.utilities` 槽位注册选择器胶囊（`order: -1`，位于 Session log 左侧）。
  - 在 `document` 捕获阶段拦截 `[data-tool]` 工具行里无 `aria-expanded` 的路径链接点击，改用所选编辑器打开；编辑器缺失或启动失败时回退系统默认应用。
  - 偏好（默认编辑器 id）存于 `localStorage['dsh.editor-launcher.preferred']`。
- Web 与桌面共用同一条 `/api` + Typert Gateway 链路（`createSharedFetchHandler`），因此两端零特判。

## 安装 / Install

要求先构建好插件产物，再装入 profile（Web 与桌面是两个 profile，patch 行可共用一份 home 级 `cordis.patch.yml`）。

```sh
# 1. 构建（见下方"构建 / Build"，tsc 产出 lib/types，tsdown 产出 lib/index.js + lib/client.js）

# 2. 安装到 profile（web 与 desktop 各一次；也可只装你要用的那个）
dsh plugin --profile web add H:\dsh-plugin
dsh plugin --profile desktop add H:\dsh-plugin
```

然后在 `$DSH_HOME/cordis.patch.yml`（home 级，web+desktop 均生效；或按 profile 分开放到各自目录）加入：

```yaml
- insert:
    - id: editor-launcher
      name: '@dsh/editor-launcher'
```

重启 `dsh web` / 桌面客户端即可。Session log 左侧会出现"用编辑器打开"胶囊；点击会话中的 Read/Edit/Write 文件链接即用所选编辑器打开。

## 构建 / Build

插件的 `@deepseek-ai/*` 是 peerDependencies（运行时由 harness 安装树提供），类型解析走 `tsconfig.json` 的 `paths`（指向 `../deepseek-harness` 各包的 `lib/types`）。构建使用 repo 的 tsc / tsdown（两者都在 `H:\deepseek-harness\node_modules\.bin` 下）：

```sh
# 方式一（推荐，针对本仓库 checkout）
cd H:\deepseek-harness
node node_modules\typescript\bin\tsc -p ..\dsh-plugin\tsconfig.json          # 产出 lib/types
node node_modules\tsdown\dist\run.mjs --config ..\dsh-plugin\tsdown.config.ts # 产出 lib/index.js + lib/client.js

# 方式二（在插件目录独立构建：先让 pnpm 装好 devDeps；peer 缺失可忽略）
cd H:\dsh-plugin
pnpm install
pnpm run build
```

`lib/client.js` 是浏览器 bundle（CJS + `window.__ModuleLoader__.load` 包装，externals 为平台模块），由 harness 的 `client-modules` 按 `exports["./client"]` 服务；`lib/index.js` 是 Node 半部，由 Loader 按包入口加载。

> 注意：若桌面客户端正从 `H:\deepseek-harness` 运行，`node_modules/.pnpm/electron@*` 的文件会被锁定，完整 `pnpm install` 会因 electron 而失败。此时先用 `pnpm install --offline --filter '!...@deepseek-ai/dsh-desktop-app'` 完成其余依赖，或在关闭客户端后再跑完整安装。插件自身构建不受影响。

## 支持的编辑器 / Detected editors

VS Code / VS Code Insiders、Cursor、Sublime Text、Notepad++、Neovim、Vim，以及 macOS 的 `open -a` 应用。检测方式：`where`/`which`（PATH）+ 各平台常见安装路径。

## 已知限制 / Known Limitations

- 编辑器候选清单内置在 Host 代码中，暂不支持用户配置额外编辑器（`extraEditors` 留作后续）。
- 点击拦截依赖 `ToolRow` 的 DOM 结构（`[data-tool]` 行 + 无 `aria-expanded` 的路径按钮）；若产品侧改动该结构，需同步更新 `src/client/index.ts` 的识别逻辑。
- 未设置默认编辑器时点击不拦截（保持系统默认应用行为）。
