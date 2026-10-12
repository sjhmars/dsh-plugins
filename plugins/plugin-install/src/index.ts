/** Same-origin npm installation routes using the official profile package operations. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-app-boot'
import Schema from '@deepseek-ai/schemastery'
import { addProfilePlugin } from './add.ts'
import type { Config as InstallConfig, InstallResult } from './types.ts'

export type { Config as PluginInstallConfig, InstallResult } from './types.ts'
export { parseNpmPackageName, addProfilePlugin, isInstallProfile, INSTALL_PROFILES, INSTALLER_PACKAGE } from './add.ts'
export type { NpmPackageSpec } from './add.ts'

/** Cordis plugin name. */
export const name = 'plugin-install'
/** Current-profile target and bounds for package operations. */
export const Config: Schema<InstallConfig> = Schema.object({
  profile: Schema.union([Schema.const('web' as const), Schema.const('desktop' as const)]).default('web'),
  pnpmCommand: Schema.string().pattern(/\S/).default('pnpm'),
  outputBytes: Schema.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(16_384),
  lockWaitMs: Schema.number().step(1).min(1).max(2_147_483_647).default(120_000),
  idleTimeoutMs: Schema.number().step(1).min(1).max(2_147_483_647).default(120_000),
  lookupTimeoutMs: Schema.number().step(1).min(1).max(2_147_483_647).default(120_000),
})
/** Launcher profile and authenticated route carrier. */
export const inject = ['connection', 'profileContext']

/**
 * Register target and installation routes; unloading cancels and joins owned package operations.
 * @param ctx - Host context with launcher-owned profile information.
 * @param config - Validated target and package-operation settings.
 */
export function apply(ctx: Context, config: InstallConfig): void {
  if (config.profile !== ctx.profileContext.name) {
    throw new Error('plugin-install: profile 必须与当前运行的 profile 一致：' + ctx.profileContext.name)
  }
  const abort = new AbortController()
  const operations = new Set<Promise<InstallResult>>()
  ctx.effect(() => async () => {
    abort.abort()
    await Promise.allSettled(operations)
  }, 'plugin-install: package operations')
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/pluginInstall/target', methods: ['GET'], requestBody: 'buffered',
    fetch: async () => Response.json({ profile: config.profile }),
  }), 'plugin-install: target route')
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/pluginInstall/install', methods: ['GET'], requestBody: 'buffered',
    fetch: async (request) => {
      const raw = new URL(request.url).searchParams.get('package') ?? ''
      const operation = addProfilePlugin(ctx.profileContext, config, raw, abort.signal)
      operations.add(operation)
      try { return Response.json(await operation) }
      finally { operations.delete(operation) }
    },
  }), 'plugin-install: installation route')
}
