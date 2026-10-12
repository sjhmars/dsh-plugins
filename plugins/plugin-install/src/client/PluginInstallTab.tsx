/** Plugins bundle page for installing npm names through the official manager. */

import { useEffect, useState, type ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { Config, InstallResult } from '../types.ts'
import type { PluginInstallKey } from './locales.ts'
import css from './PluginInstallTab.module.css'

/** 安装页注入的 Host RPC。 */
export interface PluginInstallTabInjected {
  /** 当前写入的 profile（web 或 desktop）。 */
  target: () => Promise<{ profile: Config['profile'] }>
  /** 校验后安装到当前 profile。 */
  install: (packageName: string) => Promise<InstallResult>
}

export type PluginInstallTabProps =
  PropsRuntime<'plugins.bundle.config'>
  & PropsLocale<'plugin-install'>
  & InjectFace<PluginInstallTabInjected>

/**
 * 包名输入与安装日志。
 * @param props - 插槽运行时、文案和安装请求。
 * @returns 安装输入框与官方操作结果。
 */
export function PluginInstallTab({ install, target, t, view }: PluginInstallTabProps): ReactNode {
  const [packageName, setPackageName] = useState('')
  const [busy, setBusy] = useState(false)
  const [profile, setProfile] = useState<Config['profile'] | undefined>()
  const [result, setResult] = useState<InstallResult | undefined>()

  useEffect(() => {
    let cancelled = false
    void target().then((next) => {
      if (!cancelled) setProfile(next.profile)
    }, (error: unknown) => {
      if (!cancelled) setResult({ ok: false, code: 1, stdout: '', stderr: error instanceof Error ? error.message : String(error) })
    })
    return () => {
      cancelled = true
    }
  }, [target])

  const submit = (): void => {
    if (busy || profile === undefined || packageName.trim() === '') return
    setBusy(true)
    setResult(undefined)
    void install(packageName).then(
      (next) => {
        setResult(next)
        setBusy(false)
      },
      (error: unknown) => {
        setResult({
          ok: false,
          code: 1,
          stdout: '',
          stderr: error instanceof Error ? error.message : String(error),
        })
        setBusy(false)
      },
    )
  }

  let status: PluginInstallKey = 'failure'
  if (result?.ok) {
    if (result.kind === 'dependency') status = 'dependencyRestart'
    else if (result.kind === 'bundle' && result.enabled === false) status = 'bundleDisabled'
    else status = 'restart'
  }
  const log = result === undefined ? undefined
    : [t(status), result.stdout, result.stderr].filter(part => part.length > 0).join('\n')

  if (view === 'summary') return t('title')

  return (
    <div className={css.section}>
      <h3 className={css.title}>{t('title')}</h3>
      <p className={css.hint}>{t('hint', { profile: profile ?? '…' })}</p>
      <div className={css.row}>
        <input
          value={packageName}
          placeholder={t('placeholder')}
          disabled={busy}
          onChange={event => setPackageName(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') submit()
          }}
        />
        <button type="button" disabled={busy || profile === undefined || packageName.trim().length === 0} onClick={submit}>
          {busy ? t('installing') : t('install')}
        </button>
      </div>
      {log !== undefined ? <pre className={css.log} data-ok={result?.ok === true ? 'true' : 'false'}>{log}</pre> : null}
    </div>
  )
}
