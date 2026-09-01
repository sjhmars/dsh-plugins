/**
 * 校验 npm 包名，并在 profile 目录执行与官方 `dsh plugin add` 相同的两步：
 * pnpm add，再按 `dsh.bundle` 调和 `dsh.profile.bundles`。
 * @module @sjhmars/plugin-install/add
 */
import type { SpawnSyncReturns } from 'node:child_process';
import type { Config, InstallResult } from './types.ts';
export type { InstallResult } from './types.ts';
/** 安装器只写这两套 profile：浏览器 `dsh web` 与桌面客户端各一份，互不相通。 */
export declare const INSTALL_PROFILES: readonly ["web", "desktop"];
/**
 * 是否为本安装器允许写入的 profile。
 * @param profile - 组合配置或 RPC 传入的名字。
 * @returns 是否为 `web` 或 `desktop`。
 */
export declare function isInstallProfile(profile: string): profile is Config['profile'];
/** 本安装器的 npm 包名。设置页更新自己时不热替换，避免处理请求时卸掉当前实例。 */
export declare const INSTALLER_PACKAGE = "@sjhmars/plugin-install";
/**
 * Loader 行是否属于该 npm 包：启动时的包名行、旧式 `包名?hot=`、以及
 * `file://…/node_modules/<包名>/…?hot=` 热挂行。
 * @param entryName - Loader `options.name`。
 * @param packageName - 不含版本后缀的 npm 包名。
 * @returns 是否应在热替换前卸掉。
 */
export declare function entryBelongsToPackage(entryName: string | undefined, packageName: string): boolean;
/**
 * 从 profile 的 node_modules 解析刚装好的包入口 URL（不用已加载模块的 resolve 缓存）。
 * @param profile - `web` 或 `desktop`。
 * @param packageName - 不含版本后缀的 npm 包名。
 * @returns `file://` 入口 URL。
 */
export declare function resolveInstalledPackageUrl(profile: string, packageName: string): string;
/** 输入框解析结果:npm 包名与可选版本。 */
export interface NpmPackageSpec {
    /** 不含版本后缀的注册表包名。 */
    readonly name: string;
    /** 请求的版本(dist-tag、精确 semver、`~`/`^` 范围);纯包名输入为 undefined。 */
    readonly version: string | undefined;
}
/**
 * 只接受注册表包名(含 scope,可带可选 `@version` 后缀)。拒绝路径、协议
 * 前缀与空白。
 * @param raw - 输入框原文。
 * @returns 规范化的包名与可选版本;非法时为 undefined。
 */
export declare function parseNpmPackageName(raw: string): NpmPackageSpec | undefined;
/**
 * 沿 node_modules 链直寻 pnpm CLI。pnpm 的 exports 只暴露 package.json,
 * `require.resolve('pnpm/bin/pnpm.cjs')` 即使文件存在也会被拒;直接按
 * 路径查找是唯一可靠的定位方式。
 * @param from - 起始目录,默认本模块目录。
 * @returns `bin/pnpm.cjs` 绝对路径;整条链都没有时为 undefined。
 */
export declare function resolvePnpmCli(from?: string): string | undefined;
/** 读 profile 的 node_modules/.modules.yaml 里记录的 storeDir;全新或非 pnpm 布局时为 undefined。 */
export declare function readProfileStoreDir(profileDir: string): string | undefined;
/** One runnable pnpm candidate: an explicit CLI file (Node-run) or the system command. */
interface PnpmLauncher {
    readonly label: string;
    storePath(cwd: string): string | undefined;
    run(args: readonly string[], cwd: string): SpawnSyncReturns<string>;
}
/**
 * 选出与 profile 兼容的 pnpm:两个大版本的 pnpm store 布局互不兼容
 * (ERR_PNPM_UNEXPECTED_STORE),必须由创建该 node_modules 的同一套
 * store 继续管理。先读 .modules.yaml 的 storeDir,在 profile 目录里
 * 探测各候选的 store(与实际运行同 cwd,避免 npmrc 链差异),取匹配
 * 者;全新 profile 或无人匹配时优先系统 pnpm(官方 `dsh plugin` 的同
 * 源管理者),内置 CLI 只在没有系统 pnpm 的机器上兜底。
 * @param profileDir - 目标 profile 目录。
 * @returns 可用的 pnpm 启动器;一个都没有时为 undefined。
 */
export declare function selectPnpm(profileDir: string): PnpmLauncher | undefined;
/**
 * 从已安装的 harness 包推断安装锚（desktop-app / web-app / base）。
 * @returns 某个 harness 包的 package.json 路径。
 */
export declare function resolveInstallAnchor(): string;
/**
 * 在指定 profile 安装一个已校验的 npm 包名。
 * `web` 等价 `dsh plugin --profile web add`；`desktop` 等价 `dsh plugin --profile desktop add`。
 * @param profile - `web` 或 `desktop`。
 * @param packageName - 不含版本后缀的包名。
 * @param installAnchor - 与 CLI `INSTALL_ANCHOR` 同角色。
 * @param version - 可选版本(dist-tag、semver 或范围),拼入 pnpm 安装参数。
 * @returns 退出码与 stdout/stderr。
 */
export declare function addProfilePlugin(profile: string, packageName: string, installAnchor: string, version?: string | undefined): InstallResult;
//# sourceMappingURL=add.d.ts.map