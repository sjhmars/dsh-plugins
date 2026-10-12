/**
 * Host half of Happy remote control: pair a running dsh web/desktop client
 * with Happy App so the phone drives the same harness sessions.
 * @module @sjhmars/happy-bridge
 */

import type { Context, Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-workspace'
import type {} from '@deepseek-ai/dsh-skill'
import type {} from '@deepseek-ai/dsh-permission-presets'
import type {} from '@deepseek-ai/dsh-user-approval'
import type {} from '@deepseek-ai/dsh-user-questions'
import type {} from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-attachment'
import { HappyBridge } from './bridge.ts'
import { HappyBridgeService } from './remote.ts'
import type { Config as HappyBridgeConfig } from './types.ts'

export type { Config as HappyBridgeConfig, PairingStatus, RemoteGrant } from './types.ts'

/** Cordis plugin name. */
export const name = 'happy-bridge'

/** Loader entry id used by the Plugins configuration page. */
export const HAPPY_BRIDGE_NS = 'happy-bridge'

/** Wait for the agent registry before mirroring sessions. */
export const inject = ['agents', 'sessionQuery']

/** Live references supplied by the Loader for this plugin instance. */
export type Config = { [K in keyof HappyBridgeConfig]: Volatile<HappyBridgeConfig[K]> }

/** Validate editable fields before committing their live references. */
export const Config = Schema.object({
  enabled: Schema.boolean().default(true).volatile(),
  serverUrl: Schema.string().default('https://api.cluster-fluster.com').volatile(),
  appUrl: Schema.string().default('https://app.happy.engineering').volatile(),
  credentialDir: Schema.string().default('').volatile(),
  pairOnStart: Schema.boolean().default(true).volatile(),
  remoteGrant: Schema.union([
    Schema.const('watch' as const),
    Schema.const('chat' as const),
    Schema.const('approve' as const),
    Schema.const('full' as const),
  ]).default('approve').volatile(),
  questionChannel: Schema.union([
    Schema.const('communications' as const),
    Schema.const('permission' as const),
  ]).default('communications').volatile(),
})

/**
 * Mount the Typert Remote and Happy relay; live Config edits update the running bridge.
 * @param ctx - Host context.
 * @param config - composition entry config.
 */
export function apply(ctx: Context, config: Config): void {
  const service = new HappyBridgeService(ctx)
  const source = (): HappyBridgeConfig => ({
    enabled: config.enabled.get(), serverUrl: config.serverUrl.get(), appUrl: config.appUrl.get(),
    credentialDir: config.credentialDir.get(), pairOnStart: config.pairOnStart.get(),
    remoteGrant: config.remoteGrant.get(), questionChannel: config.questionChannel.get(),
  })
  ctx.inject(['settings'], child => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)) })

  const rebuild = (): void => {
    service.live?.dispose()
    const current = source()
    if (!current.enabled) {
      service.live = undefined
      ctx.logger.info('happy-bridge: 已关闭')
      return
    }
    const bridge = new HappyBridge(ctx, current, message => ctx.logger.info(`happy-bridge: ${message}`))
    service.live = bridge
    void bridge.start().catch((error: unknown) => {
      ctx.logger.warn(`happy-bridge: 启动失败 ${error instanceof Error ? error.message : String(error)}`)
    })
  }

  ctx.on('loader/volatile-update', () => {
    const current = source()
    if (service.live?.acceptSettings(current) === true) return
    rebuild()
  })

  ctx.effect(() => {
    rebuild()
    return () => {
      service.live?.dispose()
      service.live = undefined
    }
  }, 'happy-bridge: runtime')
}
