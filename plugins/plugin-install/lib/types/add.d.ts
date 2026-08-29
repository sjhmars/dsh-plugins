/**
 * 校验 npm 包名，并在 profile 目录执行与官方 `dsh plugin add` 相同的两步：
 * pnpm add，再按 `dsh.bundle` 调和 `dsh.profile.bundles`。
 * @module @sjhmars/plugin-install/add
 */
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
/**
 * 只接受注册表包名（含 scope）。拒绝路径、协议前缀、版本后缀与空白。
 * @param raw - 输入框原文。
 * @returns 规范化包名；非法时为 undefined。
 */
export declare function parseNpmPackageName(raw: string): string | undefined;
/**
 * 定位本包依赖的 pnpm CLI（`.cjs`，不必走 Windows `.cmd`）。
 * @param from - 解析起点，默认本模块。
 * @returns pnpm 入口文件绝对路径。
 */
export declare function resolvePnpmCli(from?: string): string;
/**
 * 从已安装的 harness 包推断安装锚（desktop-app / web-app / base）。
 * @returns 某个 harness 包的 package.json 路径。
 */
export declare function resolveInstallAnchor(): string;
/**
 * 在指定 profile 安装一个已校验的 npm 包名。
 * `web` 等价 `dsh plugin --profile web add`；`desktop` 等价 `dsh plugin --profile desktop add`。
 * @param profile - `web` 或 `desktop`。
 * @param packageName - {@link parseNpmPackageName} 的返回值。
 * @param installAnchor - 与 CLI `INSTALL_ANCHOR` 同角色。
 * @returns 退出码与 stdout/stderr。
 */
export declare function addProfilePlugin(profile: string, packageName: string, installAnchor: string): InstallResult;
//# sourceMappingURL=add.d.ts.map