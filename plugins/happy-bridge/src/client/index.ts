/** Browser half: Happy remote configuration on its Plugins bundle page. */

import type { ConnectionHandle, RpcResult } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
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
export const inject = ['slots', 'locale', 'connection', 'remote', 'configForms']

/**
 * Register the Happy remote page using its Loader entry configuration.
 * @param ctx - browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  const connection = ctx.get('connection') as ConnectionHandle
  const scope = ctx.configForms.get<HappyBridgeSettings>('happy-bridge')
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'happy-bridge: browser dictionaries')

  const rpc = async <T,>(method: string): Promise<T> => {
    const result = await connection.rpc.call('/api', `happyBridge/${method}`, { args: {} })
    return unwrap(result)
  }

  ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
    name: 'plugins.bundle.config',
    key: '@sjhmars/happy-bridge',
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
