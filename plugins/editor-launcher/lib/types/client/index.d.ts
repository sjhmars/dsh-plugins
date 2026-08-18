/** Browser half of the editor launcher: the Session-header picker and the file-link click interceptor. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import { type EditorLauncherKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'editor-launcher': EditorLauncherKey;
    }
}
/** Required client services: the slot registry, locale, connection RPC, and the session list store. */
export declare const inject: string[];
/**
 * Mount the browser half: register the picker into the Session-header
 * utilities seat (order -1 keeps it left of the Session-log capsule) and
 * intercept clicks on session file-path links so they open with the preferred
 * editor instead of the host OS default application.
 * @param ctx - Browser context carrying slots, locale, connection, and sessions.
 */
export declare function apply(ctx: ClientContext): void;
export type { EditorLauncherInjected, EditorPickerProps } from './EditorPicker.tsx';
//# sourceMappingURL=index.d.ts.map