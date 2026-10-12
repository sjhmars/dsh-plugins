/** Same-origin npm installation routes using the official profile package operations. */
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import type { Config as InstallConfig } from './types.ts';
export type { Config as PluginInstallConfig, InstallResult } from './types.ts';
export { parseNpmPackageName, addProfilePlugin, isInstallProfile, INSTALL_PROFILES, INSTALLER_PACKAGE } from './add.ts';
export type { NpmPackageSpec } from './add.ts';
/** Cordis plugin name. */
export declare const name = "plugin-install";
/** Current-profile target and bounds for package operations. */
export declare const Config: Schema<InstallConfig>;
/** Launcher profile and authenticated route carrier. */
export declare const inject: string[];
/**
 * Register target and installation routes; unloading cancels and joins owned package operations.
 * @param ctx - Host context with launcher-owned profile information.
 * @param config - Validated target and package-operation settings.
 */
export declare function apply(ctx: Context, config: InstallConfig): void;
//# sourceMappingURL=index.d.ts.map