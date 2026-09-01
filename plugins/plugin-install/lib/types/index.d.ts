/**
 * Host:设置里用 npm 包名给当前 profile 装树外插件。
 *
 * RPC 面走 connection 的精确 Fetch 路由而不是 Typert Remote:Remote 的
 * 方法标记寄存在 typert-protocol 模块内的注册表里,树外插件经 profile
 * node_modules 解析到的是另一份模块实例,gateway 永远看不见那些标记
 * (表现为 /api 调用 404)。精确路由由 connection 服务直接派发,不经
 * gateway 的端点认领,是官方为"不能用 JSON Remote 的调用"留的通道。
 * @module @sjhmars/plugin-install
 */
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import type { Config as InstallConfig } from './types.ts';
export type { Config as PluginInstallConfig, InstallResult } from './types.ts';
export { parseNpmPackageName, addProfilePlugin, entryBelongsToPackage, isInstallProfile, INSTALL_PROFILES, INSTALLER_PACKAGE, } from './add.ts';
export type { NpmPackageSpec } from './add.ts';
/** Cordis 插件名。 */
export declare const name = "plugin-install";
/** 非法 profile 名在加载时失败。 */
export declare const Config: Schema<InstallConfig>;
/** 精确 Fetch 路由挂在 connection 服务上。 */
export declare const inject: string[];
/**
 * 注册两条安装路由并挂上热挂载,按组合配置钉住目标 profile。
 *
 * GET 携带查询参数:精确 Fetch 路由只认 GET/HEAD(POST 保留给 JSON
 * Remote 通道),这个本地同源工具 API 以查询参数传包名。
 * @param ctx - Host 插件上下文。
 * @param config - 组合行配置。
 */
export declare function apply(ctx: Context, config: InstallConfig): void;
//# sourceMappingURL=index.d.ts.map