/** The Session-header editor picker: one capsule button opening a Menu of detected editors. */
import type { ReactNode } from 'react';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { EditorInfo } from '../types.ts';
import { NS } from './locales.ts';
/** Business face injected into the picker entry. */
export interface EditorLauncherInjected {
    /** Detect installed editors (cross-session cached in the browser apply). */
    listEditors: () => Promise<EditorInfo[]>;
    /** Force a fresh host detection, bypassing the browser-side cache. */
    refreshEditors: () => Promise<EditorInfo[]>;
}
/** Full picker props: the utilities-slot runtime share, the locale seat, and the injected face. */
export type EditorPickerProps = PropsRuntime<'conversation.session.header.utilities'> & PropsLocale<typeof NS> & InjectFace<EditorLauncherInjected>;
/**
 * Render the Session-header editor picker capsule. Choosing an editor records
 * it as the preferred default (id + name, so the capsule label survives a
 * session switch); the click interceptor in the browser apply uses that id
 * when opening session file links. Editors load lazily on first menu open and
 * are cached across sessions in the browser apply, so page switches never
 * re-issue detection RPCs; the icon-only refresh row forces a fresh probe.
 * @param props - slot runtime, localized copy, and the injected detection face.
 * @returns the picker capsule with its menu.
 */
export declare function EditorPicker({ listEditors, refreshEditors, t }: EditorPickerProps): ReactNode;
//# sourceMappingURL=EditorPicker.d.ts.map