/** 浏览器半：设置 → 插件 的安装页。 */

import type { ConnectionHandle, RpcResult } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { InstallResult } from '../types.ts'
import { PluginInstallTab, type PluginInstallTabInjected } from './PluginInstallTab.tsx'
import { en, NS, zh, type PluginInstallKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'plugin-install': PluginInstallKey
  }
}

export const inject = ['slots', 'locale', 'connection']

/**
 * 注册安装标签页。
 * @param ctx - 浏览器插件上下文。
 */
export function apply(ctx: ClientContext): void {
  const connection = ctx.get('connection') as ConnectionHandle
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'plugin-install: 文案')

  const injected = (): PluginInstallTabInjected => ({
    target: async () => {
      const result = await connection.rpc.call('/api', 'pluginInstall/target', { args: {} })
      return unwrap<{ profile: 'web' | 'desktop' }>(result)
    },
    install: async (packageName) => {
      const result = await connection.rpc.call('/api', 'pluginInstall/install', { args: { packageName } })
      return unwrap<InstallResult>(result)
    },
  })

  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'install',
    order: 20,
    label: () => ctx.locale.bind(NS)('tab'),
    locale: NS,
    inject: injected,
  }, PluginInstallTab))
}

function unwrap<T>(result: RpcResult<unknown>): T {
  if (result.ok) return result.value as T
  throw new Error(result.error.message)
}
