/** Happy HTTP helpers: auth, sessions, machines, attachments. */
import type { CryptoContext } from './encryption.ts';
/**
 * JSON POST/GET against the Happy API with the CLI client header.
 * @param serverUrl - API origin.
 * @param path - path beginning with `/`.
 * @param init - method, token, JSON body.
 * @returns parsed JSON, or throws with status text.
 */
export declare function happyFetch(serverUrl: string, path: string, init: {
    method?: string;
    token?: string;
    body?: unknown;
}): Promise<unknown>;
/**
 * Create or load a Happy session by tag.
 * @param serverUrl - API origin.
 * @param token - bearer token.
 * @param tag - stable tag such as `dsh:<sessionId>`.
 * @param crypto - content encryption for this session.
 * @param metadata - plaintext metadata.
 * @param agentState - plaintext agent state.
 * @param dataEncryptionKey - wrapped DEK bytes when using dataKey.
 * @returns Happy session id and versions.
 */
export declare function createOrLoadSession(input: {
    serverUrl: string;
    token: string;
    tag: string;
    crypto: CryptoContext;
    metadata: unknown;
    agentState: unknown;
    dataEncryptionKey?: Uint8Array;
}): Promise<{
    id: string;
    seq: number;
    metadataVersion: number;
    agentStateVersion: number;
}>;
/**
 * Register or update the machine entity so the App can spawn onto this Host.
 * @param input - machine id, encrypted metadata, optional daemon state.
 * @returns versions from the server.
 */
export declare function createOrLoadMachine(input: {
    serverUrl: string;
    token: string;
    machineId: string;
    crypto: CryptoContext;
    metadata: unknown;
    daemonState: unknown;
    dataEncryptionKey?: Uint8Array;
}): Promise<{
    metadataVersion: number;
    daemonStateVersion: number;
}>;
/**
 * Upload an already-encrypted attachment the way Happy CLI `uploadLocalImageAttachmentEnvelope` does:
 * POST `/v1/sessions/:id/attachments/request-upload` `{ filename, size }` → `{ ref, uploadUrl, method }`
 * then PUT octet-stream or POST multipart to `uploadUrl`.
 * Presigned URLs must not receive extra headers; server-local URLs need Bearer.
 * @param serverUrl - API origin.
 * @param token - bearer token.
 * @param sessionId - Happy session id that owns the blob.
 * @param filename - display name sent to request-upload.
 * @param encrypted - nonce+ciphertext from `encryptBlob`.
 * @returns Happy `ref` to put on a user `file` event.
 */
export declare function uploadEncryptedAttachment(serverUrl: string, token: string, sessionId: string, filename: string, encrypted: Uint8Array): Promise<string>;
/**
 * Download an encrypted attachment blob the way Happy CLI does:
 * POST `/v1/sessions/:id/attachments/request-download` → `{ downloadUrl }` → GET bytes.
 * S3 presigned URLs must not receive extra headers; server-local URLs need Bearer.
 * @param serverUrl - API origin.
 * @param token - bearer token.
 * @param sessionId - Happy session id that owns the blob.
 * @param ref - file event `ref`.
 * @returns encrypted nonce+ciphertext bytes.
 */
export declare function downloadEncryptedAttachment(serverUrl: string, token: string, sessionId: string, ref: string): Promise<Uint8Array>;
/**
 * Mark a Happy session inactive without deleting it. Accidental archive of a
 * real conversation can still receive a later phone send.
 * @param serverUrl - API origin.
 * @param token - bearer token.
 * @param sessionId - Happy session id.
 */
export declare function archiveHappySession(serverUrl: string, token: string, sessionId: string): Promise<void>;
/**
 * Remove a Happy cloud session so the App can drop it from the list.
 * Already-gone ids are ignored.
 * @param serverUrl - API origin.
 * @param token - bearer token.
 * @param sessionId - Happy session id.
 */
export declare function deleteHappySession(serverUrl: string, token: string, sessionId: string): Promise<void>;
/**
 * Happy cloud sessions this token can see. Used to drop blank ghosts the
 * App can only archive, not delete.
 * @param serverUrl - API origin.
 * @param token - bearer token.
 * @returns id and optional tag; empty when the list endpoint is unavailable.
 */
export declare function listHappySessions(serverUrl: string, token: string): Promise<{
    id: string;
    tag: string;
}[]>;
//# sourceMappingURL=http.d.ts.map