import { type ProfileContext } from '@deepseek-ai/dsh-app-boot';
import type { Config, InstallResult } from './types.ts';
export type { InstallResult } from './types.ts';
/** Profiles exposed by this installer. */
export declare const INSTALL_PROFILES: readonly ["web", "desktop"];
/** Npm identity of this installer. */
export declare const INSTALLER_PACKAGE = "@sjhmars/plugin-install";
/**
 * Check the configured profile name.
 * @param profile - Requested profile.
 * @returns Whether the name is web or desktop.
 */
export declare function isInstallProfile(profile: string): profile is Config['profile'];
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
 * Install an npm bundle or plain dependency in the current profile.
 * Newly installed bundles are selected; updates preserve existing selections.
 * Failures restore the manifest and lockfile, while downloaded files and diagnostics may remain.
 * @param current - Launcher-owned profile locations and optional packaged pnpm invocation.
 * @param config - Resolved target, executable and operation bounds.
 * @param raw - Npm package name with an optional version.
 * @param signal - Cancels the package process; completion waits for it to stop.
 * @returns Saved package kind and diagnostics; success requires a process restart.
 */
export declare function addProfilePlugin(current: ProfileContext, config: Config, raw: string, signal?: AbortSignal): Promise<InstallResult>;
//# sourceMappingURL=add.d.ts.map