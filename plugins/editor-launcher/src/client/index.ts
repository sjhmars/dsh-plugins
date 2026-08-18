/** Browser half of the editor launcher: the Session-header picker and the file-link click interceptor. */

import type { ConnectionHandle, RpcResult } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { OpenResult, EditorInfo } from '../types.ts'
import { EditorPicker, type EditorLauncherInjected } from './EditorPicker.tsx'
import { en, NS, zh, type EditorLauncherKey } from './locales.ts'
import { readPreferred } from './preference.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'editor-launcher': EditorLauncherKey
  }
}

/** Required client services: the slot registry, locale, connection RPC, and the session list store. */
export const inject = ['slots', 'locale', 'connection', 'sessions']

/** A bare filename (with extension) or a path containing a separator. */
function looksLikeFilePath(text: string): boolean {
  if (text.includes('/') || text.includes('\\')) return true
  return /^[^\s./\\]+\.\w+$/.test(text)
}

/**
 * Resolve a workspace-relative path into the Host-facing absolute spelling
 * (mirror of the runtime helper; kept local so the browser bundle stays free
 * of cross-package value imports).
 * @param cwd - session workspace root, when known.
 * @param path - absolute or workspace-relative path.
 * @returns an absolute path when a workspace root is available, otherwise the original path.
 */
function resolveWorkspacePath(cwd: string | undefined, path: string): string {
  if (path.startsWith('/') || /^[A-Za-z]:[/\\]/.test(path) || path.startsWith('\\\\')) return path
  if (cwd === undefined || cwd === '') return path
  const base = cwd.replace(/[/\\]+$/, '')
  const rel = path.replace(/^[/\\]+/, '')
  return `${base}/${rel}`
}

/**
 * Mount the browser half: register the picker into the Session-header
 * utilities seat (order -1 keeps it left of the Session-log capsule) and
 * intercept clicks on session file-path links so they open with the preferred
 * editor instead of the host OS default application.
 * @param ctx - Browser context carrying slots, locale, connection, and sessions.
 */
export function apply(ctx: ClientContext): void {
  const connection = ctx.get('connection') as ConnectionHandle

  // Cross-session shared detection cache: one RPC for all pickers, refreshed
  // only by the explicit menu refresh action. Without this, every page switch
  // remounts the session-scoped picker and re-issues the RPC.
  let editorsCache: EditorInfo[] | null = null
  const fetchEditors = async (): Promise<EditorInfo[]> => {
    const result = await connection.rpc.call('/api', 'editorLauncher/listEditors', { args: {} })
    return unwrap(result)
  }
  const listEditors = async (): Promise<EditorInfo[]> => {
    if (editorsCache !== null) return editorsCache
    editorsCache = await fetchEditors()
    return editorsCache
  }
  const refreshEditors = async (): Promise<EditorInfo[]> => {
    editorsCache = await fetchEditors()
    return editorsCache
  }

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'editor-launcher: browser dictionaries')

  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'editor-launcher',
    order: -1,
    locale: NS,
    inject: (): EditorLauncherInjected => ({ listEditors, refreshEditors }),
  }, EditorPicker))

  // Document-capture click interceptor: two kinds of session file buttons
  // open with the preferred editor when one is set —
  //   1. ToolRow's `[data-tool]` path links (Read/Edit/Write summaries);
  //   2. prose file mentions (ui-deliverables `fileMention` buttons) whose
  //      `title` carries the full produced path.
  // The capture phase runs before React's own handlers, so preventing default
  // and stopping propagation here replaces the chat view's default-app open.
  ctx.effect(() => {
    const onDocumentClick = (event: MouseEvent): void => {
      const preferred = readPreferred()
      if (preferred === undefined) return
      const target = event.target
      if (!(target instanceof Element)) return
      const button = target.closest('button')
      if (button === null) return
      // The row's expand toggle carries aria-expanded; neither file button does.
      if (button.hasAttribute('aria-expanded')) return

      // Prose file mention: `title` is the full path (MarkdownText's
      // fileMention button), so it is the open target directly.
      const titlePath = button.getAttribute('title')
      if (titlePath !== null && isAbsolutePath(titlePath)) {
        event.preventDefault()
        event.stopPropagation()
        void openWithPreferred(connection, ctx, preferred.id, titlePath)
        return
      }

      // ToolRow path link: inside a `[data-tool]` row, text is the path label.
      const row = button.closest('[data-tool]')
      if (row === null) return
      const text = button.textContent?.trim() ?? ''
      if (!looksLikeFilePath(text)) return
      event.preventDefault()
      event.stopPropagation()
      void openWithPreferred(connection, ctx, preferred.id, text)
    }
    document.addEventListener('click', onDocumentClick, true)
    return () => document.removeEventListener('click', onDocumentClick, true)
  }, 'editor-launcher: file-link click interceptor')
}

/** Whether a string is an absolute filesystem path (drive, UNC, or rooted). */
function isAbsolutePath(value: string): boolean {
  return value.startsWith('/') || value.startsWith('\\') || /^[A-Za-z]:[/\\]/.test(value)
}

/** Unwrap a Remote RPC result or throw its carrier error. */
function unwrap<T>(result: RpcResult<unknown>): T {
  if (result.ok) return result.value as T
  throw new Error(result.error.message)
}

/**
 * Open one file-path label with the preferred editor, falling back to the
 * host's default open when the editor is gone or the spawn fails.
 * @param connection - browser connection handle (RPC + host API).
 * @param ctx - browser context with the session list store.
 * @param editorId - the preferred editor id.
 * @param pathLabel - the file path text shown on the clicked link.
 */
async function openWithPreferred(
  connection: ConnectionHandle,
  ctx: ClientContext,
  editorId: string,
  pathLabel: string,
): Promise<void> {
  const snapshot = ctx.sessions.list.getSnapshot()
  const cwd = snapshot.current === undefined ? undefined : snapshot.byId[snapshot.current]?.cwd
  const filePath = resolveWorkspacePath(cwd, pathLabel)
  const result = await connection.rpc.call('/api', 'editorLauncher/openWith', {
    args: { editorId, filePath },
  }) as RpcResult<OpenResult>
  if (result.ok && result.value.ok) return
  // Fall back to the OS default application so the click always has an effect.
  await connection.api.host.openPath({ path: filePath })
}

export type { EditorLauncherInjected, EditorPickerProps } from './EditorPicker.tsx'
