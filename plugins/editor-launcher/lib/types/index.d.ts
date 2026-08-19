/**
 * Host half of the editor launcher: detects installed editors and opens a
 * file with a chosen one. Exposed to the browser through the Typert Gateway's
 * SRC claim path (`TypertRemoteService` binding + `@Remote` markers), which is
 * reachable from both the Web and Desktop carriers over the shared `/api`
 * channel.
 * @module @sjhmars/editor-launcher
 */
import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { EditorInfo, OpenResult } from './types.ts';
/** Stable Cordis plugin name (host half). */
export declare const name = "editor-launcher";
/** No required services: detection and launching are pure process capabilities. */
export declare const inject: string[];
/** The Remote service: browser-facing endpoints for detection and launching. */
export declare class EditorLauncherService extends TypertRemoteService {
    /**
     * Register the service under the `editorLauncher` context key.
     * @param ctx - Host context (the plugin apply context).
     */
    constructor(ctx: Context);
    /**
     * List every detected editor on this machine (cached for the detection TTL).
     * @returns resolved editor entries in candidate order.
     */
    listEditors(): Promise<EditorInfo[]>;
    /**
     * Open one file with a previously detected editor.
     * @param editorId - editor id returned by {@link listEditors}.
     * @param filePath - absolute path to open.
     * @returns success, or a stable error string for an unknown editor or a failed spawn.
     */
    openWith(editorId: string, filePath: string): Promise<OpenResult>;
}
/**
 * Mount the Host half: constructing the service registers it on the context,
 * which is what makes its `@Remote` endpoints claimable through the Gateway.
 * @param ctx - Host context.
 */
export declare function apply(ctx: Context): void;
//# sourceMappingURL=index.d.ts.map