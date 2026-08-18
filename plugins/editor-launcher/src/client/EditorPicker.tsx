/** The Session-header editor picker: one capsule button opening a Menu of detected editors. */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { IconChevronDownOutline14, IconRefreshOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import { Menu, type MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { EditorInfo } from '../types.ts'
import { readPreferred, writePreferred } from './preference.ts'
import { NS } from './locales.ts'
import css from './EditorPicker.module.css'

/** Business face injected into the picker entry. */
export interface EditorLauncherInjected {
  /** Detect installed editors on the host. */
  listEditors: () => Promise<EditorInfo[]>
}

/** Full picker props: the utilities-slot runtime share, the locale seat, and the injected face. */
export type EditorPickerProps =
  PropsRuntime<'conversation.session.header.utilities'>
  & PropsLocale<typeof NS>
  & InjectFace<EditorLauncherInjected>

/** Menu row id for the manual re-detect action (icon-only row). */
const REFRESH_ID = '__refresh__'

/**
 * Render the Session-header editor picker capsule. Choosing an editor records
 * it as the preferred default (id + name, so the capsule label survives a
 * session switch); the click interceptor in the browser apply uses that id
 * when opening session file links. Editors are detected once on first mount —
 * re-opening the menu never re-probes the host — with a manual icon-only
 * refresh row for when editors are installed while the app is open.
 * @param props - slot runtime, localized copy, and the injected detection face.
 * @returns the picker capsule with its menu.
 */
export function EditorPicker({ listEditors, t }: EditorPickerProps): ReactNode {
  const [open, setOpen] = useState(false)
  const [editors, setEditors] = useState<EditorInfo[] | null>(null)
  const [preferred, setPreferred] = useState(readPreferred())

  // First mount only: probe once, then rely on the manual refresh row. The
  // previous per-open re-probe ran a `where`/`which` process per editor on
  // every menu open — the reported lag.
  useEffect(() => {
    let cancelled = false
    void listEditors().then(
      (found) => { if (!cancelled) setEditors(found) },
      () => { if (!cancelled) setEditors([]) },
    )
    return () => { cancelled = true }
    // listEditors is stable across mounts (apply-closure callback).
  }, [listEditors])

  const refreshing = useRef(false)
  const refresh = useCallback(() => {
    if (refreshing.current) return
    refreshing.current = true
    setEditors(null)
    void listEditors().then(
      (found) => { setEditors(found); refreshing.current = false },
      () => { setEditors([]); refreshing.current = false },
    )
  }, [listEditors])

  const label = preferred !== undefined ? t('trigger.preferred', { name: preferred.name }) : t('trigger.default')

  const items: MenuEntry[] = editors === null
    ? [{ type: 'label', id: 'loading', text: '…' }]
    : editors.length === 0
      ? [{ type: 'label', id: 'empty', text: t('menu.noEditors') }]
      : [
        { type: 'label', id: 'editors', text: t('menu.editors') },
        ...editors.map(editor => ({
          id: editor.id,
          label: editor.name,
        })),
      ]

  // Icon-only refresh row pinned at the menu tail: no visible text; the
  // accessible name rides the wrapping span, and the tooltip text is the same
  // localized string.
  const footer: MenuEntry[] = [
    { type: 'separator', id: 'refresh-sep' },
    {
      id: REFRESH_ID,
      label: '',
      icon: (
        <span role="img" aria-label={t('menu.refresh')} title={t('menu.refresh')}>
          <IconRefreshOutline14 size={14} />
        </span>
      ),
    },
  ]

  return (
    <Menu
      open={open}
      align="end"
      portal
      items={items}
      footer={footer}
      selectedId={preferred?.id}
      onSelect={(id) => {
        if (id === REFRESH_ID) {
          refresh()
          return
        }
        const editor = editors?.find(candidate => candidate.id === id)
        if (editor === undefined) return
        writePreferred({ id: editor.id, name: editor.name })
        setPreferred({ id: editor.id, name: editor.name })
        setOpen(false)
      }}
      onClose={() => { setOpen(false) }}
      anchor={(
        <button
          type="button"
          className={css.pickerButton}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => { setOpen(value => !value) }}
        >
          <span>{label}</span>
          <IconChevronDownOutline14 size={12} />
        </button>
      )}
    />
  )
}
