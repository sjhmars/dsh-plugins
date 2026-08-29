/** Browser half: Happy remote card on Settings → Plugins. */

import type { ConnectionHandle, RpcResult } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type { PairingStatus, RemoteGrant } from '../types.ts'
import {
  HappyBridgeCard,
  type HappyBridgeInjected,
  type HappyBridgeSettings,
} from './HappyBridgeCard.tsx'
import { en, NS, zh, type HappyBridgeKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'happy-bridge': HappyBridgeKey
  }
}

/** Required client services. */
export const inject = ['slots', 'locale', 'connection', 'remote', 'settingsScope']

/**
 * Register the Happy remote card under the `happy-bridge` settings namespace.
 * @param ctx - browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  const connection = ctx.get('connection') as ConnectionHandle
  const scope = ctx.settingsScope.bind<HappyBridgeSettings>({ namespace: 'happy-bridge' })
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'happy-bridge: browser dictionaries')

  const rpc = async <T,>(method: string): Promise<T> => {
    const result = await connection.rpc.call('/api', `happyBridge/${method}`, { args: {} })
    return unwrap(result)
  }

  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: 'happy-bridge',
    locale: NS,
    inject: (): HappyBridgeInjected => ({
      getStatus: () => rpc<PairingStatus>('getStatus'),
      startPairing: () => rpc<PairingStatus>('startPairing'),
      disconnect: () => rpc<PairingStatus>('disconnect'),
      rePair: () => rpc<PairingStatus>('rePair'),
      setGrant: (grant: RemoteGrant) => scope.set('remoteGrant', grant),
      setEnabled: (enabled: boolean) => scope.set('enabled', enabled),
      hooks: { happySettings: scope },
    }),
  }, HappyBridgeCard))
}

function unwrap<T>(result: RpcResult<unknown>): T {
  if (result.ok) return result.value as T
  throw new Error(result.error.message)
}
