/** 设置 → 插件：只填 npm 包名安装。 */

import { useEffect, useState, type ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { Config, InstallResult } from '../types.ts'
import css from './PluginInstallTab.module.css'

/** 安装页注入的 Host RPC。 */
export interface PluginInstallTabInjected {
  /** 当前写入的 profile（web 或 desktop）。 */
  target: () => Promise<{ profile: Config['profile'] }>
  /** 校验后安装到当前 profile。 */
  install: (packageName: string) => Promise<InstallResult>
}

export type PluginInstallTabProps =
  PropsRuntime<'settings.plugins.tab'>
  & PropsLocale<'plugin-install'>
  & InjectFace<PluginInstallTabInjected>

/**
 * 包名输入与安装日志。
 * @param props - 插槽运行时 + 文案 + RPC。
 */
export function PluginInstallTab({ install, target, t }: PluginInstallTabProps): ReactNode {
  const [packageName, setPackageName] = useState('')
  const [busy, setBusy] = useState(false)
  const [profile, setProfile] = useState<Config['profile'] | undefined>()
  const [result, setResult] = useState<InstallResult | undefined>()

  useEffect(() => {
    let cancelled = false
    void target().then((next) => {
      if (!cancelled) setProfile(next.profile)
    })
    return () => {
      cancelled = true
    }
  }, [target])

  const submit = (): void => {
    if (busy) return
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

  const log = result === undefined
    ? undefined
    : [result.ok ? t('success') : t('failure'), result.stdout, result.stderr]
      .filter(part => part.length > 0)
      .join('\n')

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
        <button type="button" disabled={busy || packageName.trim().length === 0} onClick={submit}>
          {busy ? t('installing') : t('install')}
        </button>
      </div>
      {log !== undefined ? <pre className={css.log} data-ok={result?.ok === true ? 'true' : 'false'}>{log}</pre> : null}
    </div>
  )
}
