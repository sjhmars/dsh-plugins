/**
 * Host：设置里用 npm 包名给当前 profile 安装树外插件。
 * @module @sjhmars/plugin-install
 */

import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { PluginInstallService } from './remote.ts'
import type { Config as InstallConfig } from './types.ts'

export type { Config as PluginInstallConfig, InstallResult } from './types.ts'
export { parseNpmPackageName, addProfilePlugin, isInstallProfile, INSTALL_PROFILES } from './add.ts'

/** Cordis 插件名。 */
export const name = 'plugin-install'

/** 非法 profile 名在加载时失败。 */
export const Config: Schema<InstallConfig> = Schema.object({
  profile: Schema.union([Schema.const('web' as const), Schema.const('desktop' as const)]).default('web'),
})

/**
 * 挂上安装 Remote，并把 profile 钉在组合配置上。
 * @param ctx - Host 上下文。
 * @param config - 组合行配置。
 */
export function apply(ctx: Context, config: InstallConfig): void {
  const service = new PluginInstallService(ctx)
  service.profile = config.profile
  ctx.logger.info(`plugin-install: 安装目标 profile=${config.profile}`)
}
