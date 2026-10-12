/** Settings card with explicit save, validation and localized feedback. */
import { useEffect, useState, type ReactNode } from 'react'
import type { ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { defaults, validateConfig } from '../config.ts'
import type { Config } from '../config.ts'
import { NS } from './locales.ts'

export interface Injected {
  save(value: Config, revision?: number): Promise<boolean>
  hooks: { segmentedSettings: {
    getSnapshot(): ConfigFormSnapshot<Config>
    subscribe(listener: () => void): () => void
  } }
}
export type CardProps = PropsRuntime<'plugins.bundle.config'> & PropsLocale<typeof NS> & InjectFace<Injected>
const numeric = ['contextRatio', 'maxShrinkRetries', 'maxCalls'] as const
/**
 * Render the shared Web/Desktop plugin settings.
 * @param props - Configuration writes, live snapshot hook, and locale dictionary.
 * @returns Bundle configuration form with validation and save feedback.
 */
export function Card(props: CardProps): ReactNode {
  const snap = props.useSegmentedSettings(snapshot => snapshot)
  const [draft, setDraft] = useState<Config>({ ...defaults, ...snap.value })
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error' | 'invalid'>('idle')
  useEffect(() => { setDraft({ ...defaults, ...snap.value }); setState('idle') }, [snap.value])
  const submit = async (): Promise<void> => {
    try { validateConfig(draft) } catch (_error) { setState('invalid'); return }
    setState('saving')
    try { setState(await props.save(draft, snap.revision) ? 'saved' : 'error') } catch (_error) { setState('error') }
  }
  return <section style={{ listStyle: 'none', padding: 20, border: '1px solid var(--border-color, #7775)', borderRadius: 12 }}>
    <h3>{props.t('title')}</h3>
    <p>{props.t('description')}</p>
    <form onSubmit={event => { event.preventDefault(); void submit() }}>
      <fieldset disabled={!snap.writable || state === 'saving'} style={{ border: 0, padding: 0, display: 'grid', gap: 14 }}>
        <label><input type="checkbox" checked={draft.enabled}
          onChange={event => setDraft({ ...draft, enabled: event.target.checked })} /> {props.t('enabled')}</label>
        {numeric.map(key => <label key={key} style={{ display: 'grid', gap: 5 }}>
          {props.t(key)}
          <input type="number" required value={Number.isNaN(draft[key]) ? '' : draft[key]}
            min={key === 'contextRatio' ? 0.01 : key === 'maxShrinkRetries' ? 0 : 1}
            max={key === 'contextRatio' ? 1 : undefined}
            step={key === 'contextRatio' ? 0.01 : 1}
            onChange={event => setDraft({ ...draft, [key]: event.target.valueAsNumber })} />
        </label>)}
        <button type="submit">{props.t(state === 'saving' ? 'saving' : 'save')}</button>
      </fieldset>
    </form>
    <p>{props.t('hint')}</p>
    {!snap.writable ? <p>{props.t('readOnly')}</p> : null}
    {state === 'saved' || state === 'error' || state === 'invalid' ? <p role="status">{props.t(state)}</p> : null}
  </section>
}
