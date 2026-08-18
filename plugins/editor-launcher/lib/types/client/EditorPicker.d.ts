/** The Session-header editor picker: one capsule button opening a Menu of detected editors. */
import type { ReactNode } from 'react';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { EditorInfo } from '../types.ts';
import { NS } from './locales.ts';
/** Business face injected into the picker entry. */
export interface EditorLauncherInjected {
    /** Detect installed editors on the host. */
    listEditors: () => Promise<EditorInfo[]>;
}
/** Full picker props: the utilities-slot runtime share, the locale seat, and the injected face. */
export type EditorPickerProps = PropsRuntime<'conversation.session.header.utilities'> & PropsLocale<typeof NS> & InjectFace<EditorLauncherInjected>;
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
export declare function EditorPicker({ listEditors, t }: EditorPickerProps): ReactNode;
//# sourceMappingURL=EditorPicker.d.ts.map