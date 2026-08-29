/** Settings → Plugins card: pairing QR, copy links, remote grant. */

import { useEffect, useState, type ReactNode } from 'react'
import type { SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { PairingStatus, RemoteGrant } from '../types.ts'
import { NS } from './locales.ts'
import css from './HappyBridgeCard.module.css'

/** Fields this card reads from the `happy-bridge` settings namespace. */
export interface HappyBridgeSettings {
  enabled?: boolean
  remoteGrant?: RemoteGrant
}

/** Injected Host RPC + settings writes. Snapshot rides `hooks.happySettings`. */
export interface HappyBridgeInjected {
  /** Poll pairing status (includes QR data URL). */
  getStatus: () => Promise<PairingStatus>
  /** Start or resume pairing. */
  startPairing: () => Promise<PairingStatus>
  /** Disconnect Happy; the web UI stays up. */
  disconnect: () => Promise<PairingStatus>
  /** Drop the current login and show a new QR. */
  rePair: () => Promise<PairingStatus>
  /** Persist the remote-grant field. */
  setGrant: (grant: RemoteGrant) => Promise<void>
  /** Persist the enabled field. */
  setEnabled: (enabled: boolean) => Promise<void>
  hooks: {
    /** Live settings snapshot for this namespace. */
    happySettings: {
      getSnapshot(): SettingsScopeSnapshot<HappyBridgeSettings>
      subscribe(fn: () => void): () => void
    }
  }
}

/** Card props: locale seat plus injected RPC. */
export type HappyBridgeCardProps =
  & PropsLocale<typeof NS>
  & InjectFace<HappyBridgeInjected>

const GRANTS: RemoteGrant[] = ['watch', 'chat', 'approve', 'full']

/**
 * Render the Happy remote plugin card.
 * @param props - locale + injected Host RPC.
 */
export function HappyBridgeCard(props: HappyBridgeCardProps): ReactNode {
  const { t, getStatus, startPairing, disconnect, rePair, setGrant, setEnabled } = props
  const snap = props.useHappySettings(snapshot => snapshot)
  const grant = snap.value?.remoteGrant ?? 'approve'
  const enabled = snap.value?.enabled !== false
  const writable = snap.writable
  const [open, setOpen] = useState(true)
  const [status, setStatus] = useState<PairingStatus | undefined>(undefined)
  const [copied, setCopied] = useState<'mobile' | 'web' | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    const tick = (): void => {
      void getStatus().then((next) => { if (!cancelled) setStatus(next) })
    }
    tick()
    const timer = setInterval(tick, 2000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [getStatus])

  const copy = async (which: 'mobile' | 'web', value: string | undefined): Promise<void> => {
    if (value === undefined) return
    await navigator.clipboard.writeText(value)
    setCopied(which)
    setTimeout(() => setCopied(undefined), 1500)
  }

  return (
    <li className={css.card}>
      <button
        type="button"
        className={css.header}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className={css.headText}>
          <span className={css.name}>{t('title')}</span>
          <span className={css.description}>{t('description')}</span>
        </span>
        <span className={css.chevron}>{open ? '▴' : '▾'}</span>
      </button>
      {open
        ? (
          <div className={css.body}>
            {!writable
              ? <p className={css.status} role="status">{t('readOnly')}</p>
              : null}
            <label className={css.label}>
              <input
                className={css.checkbox}
                type="checkbox"
                checked={enabled}
                disabled={!writable}
                onChange={event => void setEnabled(event.target.checked)}
              />
              {' '}
              {t('enabled')}
            </label>
            <p className={css.status}>
              {status?.paired === true
                ? (
                  <>
                    {t('status.paired')}
                    {typeof status.sessionCount === 'number'
                      ? ` · ${t('status.linked')} ${status.linkedCount ?? 0}/${status.sessionCount}`
                      : null}
                  </>
                )
                : status?.pairing === true
                  ? t('status.pairing')
                  : t('status.unpaired')}
            </p>
            {status?.error !== undefined ? <p className={css.error} role="status">{t('error')}: {status.error}</p> : null}
            {status?.qrDataUrl !== undefined
              ? <img className={css.qr} alt={t('qr.alt')} src={status.qrDataUrl} />
              : null}
            <div className={css.row}>
              {status?.paired === true
                ? <button type="button" className={css.button} onClick={() => void disconnect()}>{t('disconnect')}</button>
                : <button type="button" className={css.button} onClick={() => void startPairing()}>{t('start')}</button>}
              <button type="button" className={css.button} onClick={() => void rePair()}>{t('repair')}</button>
              <button type="button" className={css.button} onClick={() => void copy('mobile', status?.mobileUrl)}>
                {copied === 'mobile' ? t('copied') : t('copy.mobile')}
              </button>
              <button type="button" className={css.button} onClick={() => void copy('web', status?.webUrl)}>
                {copied === 'web' ? t('copied') : t('copy.web')}
              </button>
            </div>
            <label className={css.label}>
              {t('grant')}
              {' '}
              <select
                className={css.select}
                value={grant}
                disabled={!writable}
                onChange={event => void setGrant(event.target.value as RemoteGrant)}
              >
                {GRANTS.map(value => (
                  <option key={value} value={value}>{t(`grant.${value}`)}</option>
                ))}
              </select>
            </label>
            <p className={css.status}>{t('grant.hint')}</p>
          </div>
        )
        : null}
    </li>
  )
}
