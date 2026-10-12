# @sjhmars/plugin-install

在侧栏 Plugins 中打开本包详情页，输入 npm 包名与可选 @版本，安装或更新 bundle 插件和普通组件。首次安装的 bundle 自动加入 profile 启用列表；普通组件保存为依赖，已有配置在重启后使用新版本，首次安装还需在配置文件中启用。更新停用的 bundle 保留停用状态。

Open this package's detail page in the sidebar Plugins panel and enter an npm name with an optional @version. The installer accepts bundles and plain components. New bundles join the profile's selected layers. A plain component becomes a dependency: an existing configuration uses its new version after restart, while a new component also needs a plugin entry. Updating a disabled bundle keeps it disabled.

所有成功安装都提示重启应用。浏览器刷新不能替代 Web 进程或 Desktop 应用重启。安装普通组件不会把它伪装为 bundle，也不会猜测组件所需的配置。

Every successful installation requires an application restart. Refreshing the browser does not restart Web or Desktop. Installing a plain component neither selects it as a bundle nor guesses its required configuration.

## 兼容版本 / Compatibility

0.5.0 适配 Harness 0.2.1-alpha.1，使用官方 `runProfilePnpm` 和 profile 文件锁，保留兼容性检查、Desktop 自带的 pnpm 和日志。客户端入口仍为 `plugins.bundle.config`。官方自带「添加插件」入口只接受 bundle；本包详情页的输入框也接受普通组件，例如 `@deepseek-ai/dsh-web-search-exa@0.2.1-alpha.1`。

Version 0.5.0 targets Harness 0.2.1-alpha.1. It uses official `runProfilePnpm` under the profile writer lock, retaining compatibility checks, Desktop's packaged pnpm and diagnostics. The client remains on `plugins.bundle.config`. The built-in Add plugin action accepts bundles; this package's detail-page input also accepts plain components such as `@deepseek-ai/dsh-web-search-exa@0.2.1-alpha.1`.

安装失败、兼容性拒绝、bundle 补丁无效或插件卸载取消安装时，恢复安装前的 `package.json` 和 `pnpm-lock.yaml`。用户 patch 保留；已经下载的模块、pnpm store、诊断日志和脚本授权配置可能留在磁盘。卸载会等待包进程停止后再释放资源。

On package failure, compatibility refusal, invalid bundle patches or cancellation during unload, the installer restores the previous `package.json` and `pnpm-lock.yaml`. It preserves the user patch. Downloaded modules, the pnpm store, diagnostics and script-approval settings can remain. Unload waits for the package process to stop before releasing resources.

## 安装与更新 / Install and update

安装入口和 profile 区别见 [仓库安装说明](../../README.md#install)。0.5.0 已构建为本地 tarball，尚待发布 npm。现在可从 Windows CMD 安装本地包：

See the [repository install guide](../../README.md#install) for profiles. The local 0.5.0 tarball is ready; npm publication is pending. Install it from Windows CMD:

~~~bat
cd /d H:\deepseek-harness
pnpm dsh plugin --profile web add H:\dsh-plugin\release\sjhmars-plugin-install-0.5.0.tgz --registry=https://registry.npmjs.org
~~~

发布 npm 后可改为以下命令。安装后重启，再打开「插件 → @sjhmars/plugin-install」使用包名输入框：

After npm publication, use the following command instead. Restart after installation, then open Plugins → @sjhmars/plugin-install to use its input:

~~~bat
cd /d H:\deepseek-harness
pnpm dsh plugin --profile web add @sjhmars/plugin-install@0.5.0 --registry=https://registry.npmjs.org
~~~

输入框只接受 npm 包名与版本，不接受路径、git 地址或协议。下载使用当前 profile 的 npm 源和 pnpm 配置。注册表访问或脚本授权失败时，日志保留诊断供修复后重试。

The input accepts npm names and versions, excluding paths, git addresses and protocols. Downloads use the profile's registry and pnpm settings. Registry and script-approval failures retain diagnostics for repair and retry.

## 配置 / Configuration

`profile` 必须与正在运行的 web 或 desktop profile 一致。Desktop 已使用本包时，将该字段设为 desktop；命令行管理 desktop 需完全退出应用，并使用 Desktop 注册的 dsh 命令。

The `profile` field must match the running web or desktop profile. Set it to desktop when using this package on Desktop. Command-line management requires the Desktop-registered dsh command while the application is fully quit.

| 字段 / Field | 默认 / Default | 用途 / Purpose |
|---|---|---|
| `profile` | `web` | 当前目标；可选 web、desktop / Current target: web or desktop |
| `pnpmCommand` | `pnpm` | 应用未提供包管理器时的可执行文件 / Executable when the application provides none |
| `outputBytes` | `16384` | 页面保留的日志字节数 / Captured log bytes |
| `lockWaitMs` | `120000` | 等待 profile 写锁的上限 / Profile-lock wait bound |
| `idleTimeoutMs` | `120000` | 包进程无输出的等待上限 / Package-output silence bound |
| `lookupTimeoutMs` | `120000` | 注册表兼容性预检上限 / Registry-preflight bound |

数值字段必须为正整数；毫秒上限为 2147483647。Desktop 提供的可执行文件、前缀参数和环境优先于 `pnpmCommand`。

Numeric fields require positive integers; millisecond bounds cannot exceed 2147483647. Desktop's executable, prefix arguments and environment take precedence over `pnpmCommand`.

Desktop profile 的配置补丁：

Desktop profile patch:

~~~yaml
- id: plugin-install
  config:
    profile: desktop
~~~

## 从 0.4.0 更新 / Updating from 0.4.0

应用使用者保留 profile 配置，安装 0.5.0 并重启即可。所有安装结果现在要求重启；首次安装普通组件后需要配置其插件行。

Application users keep their profile setting, install 0.5.0 and restart. All installations now require a restart. A newly installed plain component requires its plugin entry to be configured.

直接调用公开辅助函数的代码需将 `addProfilePlugin(manager, currentProfile, profile, raw)` 改为 `addProfilePlugin(profileContext, config, raw, signal?)`。`config` 使用本包导出的 `Config` 解析默认值；`InstallResult.kind` 区分 bundle 与普通依赖，`enabled` 表示 bundle 的保存状态，成功结果的 `application` 为 restart-required。

Direct consumers replace `addProfilePlugin(manager, currentProfile, profile, raw)` with `addProfilePlugin(profileContext, config, raw, signal?)`. Resolve defaults with this package's exported `Config`. `InstallResult.kind` distinguishes bundles from dependencies; `enabled` records a bundle's saved selection. Successful results use `application: restart-required`.

## 构建与验证 / Build and verification

开发依赖以 link: 指向相邻官方仓库的公开包。先构建 Harness，然后运行：

Development dependencies link to public packages in the adjacent Harness checkout. Build Harness first, then run:

~~~sh
pnpm install --ignore-scripts
pnpm --filter @sjhmars/plugin-install run build
pnpm --filter @sjhmars/plugin-install run test
pnpm run test:compat
pnpm --filter @sjhmars/plugin-install pack --pack-destination H:\dsh-plugin\release
~~~

测试使用独立 profile 和本地包管理器进程，覆盖普通组件更新、bundle 选择、停用状态、兼容性拒绝、失败回滚、输出截断、并行安装、取消及 Loader 卸载。真实 npm 安装验收也使用独立 DSH_HOME，不修改用户正在使用的 profile。

Tests use private profiles and a local package-manager process for component updates, bundle selection, disabled state, compatibility refusal, rollback, truncated output, concurrent installation, cancellation and Loader disposal. Real npm acceptance also uses a private DSH_HOME and leaves live profiles untouched.
