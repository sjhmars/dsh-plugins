/** Load and store Happy credentials. Prefer `~/.happy/access.key`, else plugin dir. */
import type { Credentials } from './types.ts';
/**
 * Resolve the plugin credential directory.
 * @param configured - Config.credentialDir; empty means the default under home.
 * @returns absolute directory path.
 */
export declare function resolveCredentialDir(configured: string): string;
/**
 * Load credentials: Happy CLI file first, then this plugin's file.
 * @param credentialDir - plugin directory.
 * @returns credentials, or `undefined` when nothing usable is on disk.
 */
export declare function loadCredentials(credentialDir: string): Promise<Credentials | undefined>;
/**
 * Persist credentials in the plugin directory. Does not overwrite `~/.happy/access.key`.
 * @param credentialDir - plugin directory.
 * @param credentials - token + encryption + machineId.
 */
export declare function saveCredentials(credentialDir: string, credentials: Credentials): Promise<void>;
/**
 * Mark the plugin disconnected without deleting Happy CLI credentials.
 * Clears phone-dismissed ids so a later pair remirrors those sessions.
 * @param credentialDir - plugin directory.
 * @param machineId - last known machine id to keep stable.
 */
export declare function markDisconnected(credentialDir: string, machineId?: string): Promise<void>;
/**
 * Clear the local disconnected flag so existing credentials can be reused.
 * @param credentialDir - plugin directory.
 * @param machineId - machine id to keep.
 */
export declare function markConnected(credentialDir: string, machineId: string): Promise<void>;
/**
 * Last stored machine id, even when locally disconnected.
 * @param credentialDir - plugin directory.
 * @returns machine id, or `undefined`.
 */
export declare function peekMachineId(credentialDir: string): Promise<string | undefined>;
/**
 * Session ids the phone asked to stop mirroring. stop-session / archive
 * persist here so a later scan does not recreate the Happy row.
 * @param credentialDir - plugin directory.
 * @returns harness session ids, possibly empty.
 */
export declare function loadDismissed(credentialDir: string): Promise<string[]>;
/**
 * Forget a previously dismissed harness session so it can remirror.
 * @param credentialDir - plugin directory.
 * @param dshId - harness session id.
 */
export declare function removeDismissed(credentialDir: string, dshId: string): Promise<void>;
/**
 * Remember that the phone dismissed this harness session.
 * @param credentialDir - plugin directory.
 * @param dshId - harness session id.
 */
export declare function addDismissed(credentialDir: string, dshId: string): Promise<void>;
//# sourceMappingURL=credentials.d.ts.map