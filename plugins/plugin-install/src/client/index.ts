/** 浏览器半：Plugins 配置页 的安装页。 */

import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type { InstallResult } from '../types.ts'
import { PluginInstallTab, type PluginInstallTabInjected } from './PluginInstallTab.tsx'
import { en, NS, zh, type PluginInstallKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'plugin-install': PluginInstallKey
  }
}

export const inject = ['slots', 'locale']

/**
 * Call the installer's same-origin GET routes with parameters in the query string.
 * The Web route or Desktop IPC carrier owns admission and authentication.
 * @param path - route path below /api.
 * @param query - query parameters.
 * @returns the parsed JSON response.
 */
async function get<T>(path: string, query: Record<string, string> = {}): Promise<T> {
  const url = Object.keys(query).length === 0 ? path : `${path}?${new URLSearchParams(query).toString()}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`plugin-install: HTTP ${String(response.status)}`)
  return await response.json() as T
}

/**
 * 注册本包的安装页面。
 * @param ctx - 浏览器插件上下文。
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'plugin-install: 文案')

  const injected = (): PluginInstallTabInjected => ({
    target: () => get<{ profile: 'web' | 'desktop' }>('/api/pluginInstall/target'),
    install: (packageName) => get<InstallResult>('/api/pluginInstall/install', { package: packageName }),
  })

  ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
    name: 'plugins.bundle.config',
    key: '@sjhmars/plugin-install',
    locale: NS,
    inject: injected,
  }, PluginInstallTab))
}
