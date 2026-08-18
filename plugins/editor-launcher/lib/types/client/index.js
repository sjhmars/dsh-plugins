/** Browser half of the editor launcher: the Session-header picker and the file-link click interceptor. */
import { EditorPicker } from "./EditorPicker.js";
import { en, NS, zh } from "./locales.js";
import { readPreferred } from "./preference.js";
/** Required client services: the slot registry, locale, connection RPC, and the session list store. */
export const inject = ['slots', 'locale', 'connection', 'sessions'];
/** A bare filename (with extension) or a path containing a separator. */
function looksLikeFilePath(text) {
    if (text.includes('/') || text.includes('\\'))
        return true;
    return /^[^\s./\\]+\.\w+$/.test(text);
}
/**
 * Resolve a workspace-relative path into the Host-facing absolute spelling
 * (mirror of the runtime helper; kept local so the browser bundle stays free
 * of cross-package value imports).
 * @param cwd - session workspace root, when known.
 * @param path - absolute or workspace-relative path.
 * @returns an absolute path when a workspace root is available, otherwise the original path.
 */
function resolveWorkspacePath(cwd, path) {
    if (path.startsWith('/') || /^[A-Za-z]:[/\\]/.test(path) || path.startsWith('\\\\'))
        return path;
    if (cwd === undefined || cwd === '')
        return path;
    const base = cwd.replace(/[/\\]+$/, '');
    const rel = path.replace(/^[/\\]+/, '');
    return `${base}/${rel}`;
}
/**
 * Mount the browser half: register the picker into the Session-header
 * utilities seat (order -1 keeps it left of the Session-log capsule) and
 * intercept clicks on session file-path links so they open with the preferred
 * editor instead of the host OS default application.
 * @param ctx - Browser context carrying slots, locale, connection, and sessions.
 */
export function apply(ctx) {
    const connection = ctx.get('connection');
    // Cross-session shared detection cache: one RPC for all pickers, refreshed
    // only by the explicit menu refresh action. Without this, every page switch
    // remounts the session-scoped picker and re-issues the RPC.
    let editorsCache = null;
    const fetchEditors = async () => {
        const result = await connection.rpc.call('/api', 'editorLauncher/listEditors', { args: {} });
        return unwrap(result);
    };
    const listEditors = async () => {
        if (editorsCache !== null)
            return editorsCache;
        editorsCache = await fetchEditors();
        return editorsCache;
    };
    const refreshEditors = async () => {
        editorsCache = await fetchEditors();
        return editorsCache;
    };
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'editor-launcher: browser dictionaries');
    ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
        name: 'conversation.session.header.utilities',
        id: 'editor-launcher',
        order: -1,
        locale: NS,
        inject: () => ({ listEditors, refreshEditors }),
    }, EditorPicker));
    // Document-capture click interceptor: two kinds of session file buttons
    // open with the preferred editor when one is set —
    //   1. ToolRow's `[data-tool]` path links (Read/Edit/Write summaries);
    //   2. prose file mentions (ui-deliverables `fileMention` buttons) whose
    //      `title` carries the full produced path.
    // The capture phase runs before React's own handlers, so preventing default
    // and stopping propagation here replaces the chat view's default-app open.
    ctx.effect(() => {
        const onDocumentClick = (event) => {
            const preferred = readPreferred();
            if (preferred === undefined)
                return;
            const target = event.target;
            if (!(target instanceof Element))
                return;
            const button = target.closest('button');
            if (button === null)
                return;
            // The row's expand toggle carries aria-expanded; neither file button does.
            if (button.hasAttribute('aria-expanded'))
                return;
            // Prose file mention: `title` is the full path (MarkdownText's
            // fileMention button), so it is the open target directly.
            const titlePath = button.getAttribute('title');
            if (titlePath !== null && isAbsolutePath(titlePath)) {
                event.preventDefault();
                event.stopPropagation();
                void openWithPreferred(connection, ctx, preferred.id, titlePath);
                return;
            }
            // ToolRow path link: inside a `[data-tool]` row, text is the path label.
            const row = button.closest('[data-tool]');
            if (row === null)
                return;
            const text = button.textContent?.trim() ?? '';
            if (!looksLikeFilePath(text))
                return;
            event.preventDefault();
            event.stopPropagation();
            void openWithPreferred(connection, ctx, preferred.id, text);
        };
        document.addEventListener('click', onDocumentClick, true);
        return () => document.removeEventListener('click', onDocumentClick, true);
    }, 'editor-launcher: file-link click interceptor');
}
/** Whether a string is an absolute filesystem path (drive, UNC, or rooted). */
function isAbsolutePath(value) {
    return value.startsWith('/') || value.startsWith('\\') || /^[A-Za-z]:[/\\]/.test(value);
}
/** Unwrap a Remote RPC result or throw its carrier error. */
function unwrap(result) {
    if (result.ok)
        return result.value;
    throw new Error(result.error.message);
}
/**
 * Open one file-path label with the preferred editor, falling back to the
 * host's default open when the editor is gone or the spawn fails.
 * @param connection - browser connection handle (RPC + host API).
 * @param ctx - browser context with the session list store.
 * @param editorId - the preferred editor id.
 * @param pathLabel - the file path text shown on the clicked link.
 */
async function openWithPreferred(connection, ctx, editorId, pathLabel) {
    const snapshot = ctx.sessions.list.getSnapshot();
    const cwd = snapshot.current === undefined ? undefined : snapshot.byId[snapshot.current]?.cwd;
    const filePath = resolveWorkspacePath(cwd, pathLabel);
    const result = await connection.rpc.call('/api', 'editorLauncher/openWith', {
        args: { editorId, filePath },
    });
    if (result.ok && result.value.ok)
        return;
    // Fall back to the OS default application so the click always has an effect.
    await connection.api.host.openPath({ path: filePath });
}
//# sourceMappingURL=index.js.map