/** Register the plugin settings card through the existing client extension point. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import { Card } from './Card.tsx'
import type { Injected } from './Card.tsx'
import type { Config } from '../config.ts'
import { NS, zh, en } from './locales.ts'
import type { LocaleKey } from './locales.ts'
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'segmented-compaction': LocaleKey }
}
export const inject = ['slots', 'locale', 'configForms']
/**
 * Bind the live Config form and localized bundle configuration page.
 * @param ctx - Browser context providing configuration and rendering services.
 */
export function apply(ctx: ClientContext): void {
  const scope = ctx.configForms.get<Config>(NS)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'segmented-compaction: dictionaries')
  ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
    name: 'plugins.bundle.config', key: '@sjhmars/segmented-compaction', locale: NS,
    inject: (): Injected => ({
      save: (value, revision) => scope.mutate(
        Object.entries(value).map(([key, value]) => ({ op: 'set' as const, path: [key], value })), revision,
      ),
      hooks: { segmentedSettings: scope },
    }),
  }, Card))
}
