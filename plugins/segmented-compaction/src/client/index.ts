/** Register the plugin settings card through the existing client extension point. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import { Card } from './Card.tsx'
import type { Injected } from './Card.tsx'
import type { Config } from '../config.ts'
import { NS, zh, en } from './locales.ts'
import type { LocaleKey } from './locales.ts'
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'segmented-compaction': LocaleKey }
}
export const inject = ['slots', 'locale', 'settingsScope']
/** Bind locale and the versioned settings scope; no private RPC is required. */
export function apply(ctx: ClientContext): void {
  const scope = ctx.settingsScope.bind<Config>({ namespace: NS })
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'segmented-compaction: dictionaries')
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item', key: NS, locale: NS,
    inject: (): Injected => ({
      save: async value => {
        await scope.mutate(Object.entries(value).map(([key, value]) => ({ op: 'set' as const, path: [key], value })))
      },
      hooks: { segmentedSettings: scope },
    }),
  }, Card))
}
