/**
 * Host half of Happy remote control: pair a running dsh web/desktop client
 * with Happy App so the phone drives the same harness sessions.
 * @module @sjhmars/happy-bridge
 */

import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
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

/** Settings namespace keyed by the Plugins tab card. */
export const HAPPY_BRIDGE_NS = settingsNamespace('happy-bridge')

/** Wait for the agent registry before mirroring sessions. */
export const inject = ['agents']

/** Validated plugin config. Illegal values fail at load. */
export const Config: Schema<HappyBridgeConfig> = Schema.object({
  enabled: Schema.boolean().default(true),
  serverUrl: Schema.string().default('https://api.cluster-fluster.com'),
  appUrl: Schema.string().default('https://app.happy.engineering'),
  credentialDir: Schema.string().default(''),
  pairOnStart: Schema.boolean().default(true),
  remoteGrant: Schema.union([
    Schema.const('watch' as const),
    Schema.const('chat' as const),
    Schema.const('approve' as const),
    Schema.const('full' as const),
  ]).default('approve'),
})

/**
 * Mount the Host half: settings namespace, Typert Remote, Happy relay.
 * @param ctx - Host context.
 * @param config - composition entry config.
 */
export function apply(ctx: Context, config: HappyBridgeConfig): void {
  const service = new HappyBridgeService(ctx)
  let source = (): HappyBridgeConfig => config

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

  installSettingsSection(ctx, HAPPY_BRIDGE_NS, Config, config, {
    setSource: (current) => { source = current },
    onChange: () => {
      const current = source()
      if (service.live?.acceptSettings(current) === true) return
      rebuild()
    },
  })

  ctx.effect(() => {
    rebuild()
    return () => {
      service.live?.dispose()
      service.live = undefined
    }
  }, 'happy-bridge: runtime')
}
