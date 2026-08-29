/** Happy content encryption: legacy NaCl secretbox or AES-256-GCM dataKey. */
import { decodeBase64, encodeBase64 } from './bytes.ts';
import type { Credentials, EncryptionVariant } from './types.ts';
/** Content key used for one session or machine. */
export interface CryptoContext {
    /** AES-GCM or secretbox key. */
    key: Uint8Array;
    /** Algorithm selected from the account credentials. */
    variant: EncryptionVariant;
}
/**
 * Encrypt a JSON value the way Happy CLI `encrypt()` does.
 * @param ctx - session or machine crypto.
 * @param data - JSON-serializable plaintext.
 * @returns nonce+ciphertext bytes.
 */
export declare function encryptJson(ctx: CryptoContext, data: unknown): Uint8Array;
/**
 * Decrypt a Happy ciphertext into JSON.
 * @param ctx - matching crypto.
 * @param data - nonce+ciphertext bytes.
 * @returns plaintext or `null` when the box does not open.
 */
export declare function decryptJson(ctx: CryptoContext, data: Uint8Array): unknown;
/**
 * Encrypt JSON and return the on-wire base64 string.
 * @param ctx - session or machine crypto.
 * @param data - JSON-serializable plaintext.
 * @returns base64 ciphertext.
 */
export declare function encryptB64(ctx: CryptoContext, data: unknown): string;
/**
 * Decode base64 then decrypt JSON.
 * @param ctx - matching crypto.
 * @param value - base64 ciphertext.
 * @returns plaintext or `null`.
 */
export declare function decryptB64(ctx: CryptoContext, value: string): unknown;
/**
 * Open the pairing `response` blob (ephemeral-box bundle).
 * @param encryptedBundle - ephPublicKey + nonce + ciphertext.
 * @param recipientSecretKey - our box secret key.
 * @returns 32-byte shared secret, or versioned dataKey payload, or `null`.
 */
export declare function decryptWithEphemeralKey(encryptedBundle: Uint8Array, recipientSecretKey: Uint8Array): Uint8Array | null;
/**
 * Wrap a data-encryption key for the account public key.
 * @param dataKey - 32-byte DEK.
 * @param recipientPublicKey - account box public key.
 * @returns versioned bundle Happy stores as `dataEncryptionKey`.
 */
export declare function wrapDataEncryptionKey(dataKey: Uint8Array, recipientPublicKey: Uint8Array): Uint8Array;
/**
 * Content crypto for a newly created Happy session.
 * @param credentials - account credentials.
 * @returns session key plus optional wrapped DEK for POST /v1/sessions.
 */
export declare function sessionCrypto(credentials: Credentials): {
    ctx: CryptoContext;
    dataEncryptionKey: Uint8Array | undefined;
};
/**
 * Content crypto for the machine entity (uses `machineKey` on dataKey accounts).
 * @param credentials - account credentials.
 * @returns machine key plus optional wrapped DEK.
 */
export declare function machineCrypto(credentials: Credentials): {
    ctx: CryptoContext;
    dataEncryptionKey: Uint8Array | undefined;
};
/**
 * Encrypt a binary blob with NaCl crypto_secretbox (XSalsa20-Poly1305).
 * Wire format: nonce (24 bytes) then ciphertext plus 16-byte auth tag.
 * Matches Happy App/CLI `encryptBlob`.
 * @param data - plaintext bytes.
 * @param key - 32-byte blob key from {@link deriveBlobKey}.
 * @returns nonce + ciphertext.
 */
export declare function encryptBlob(data: Uint8Array, key: Uint8Array): Uint8Array;
/**
 * Decrypt a binary blob encrypted with NaCl crypto_secretbox.
 * @param bundle - nonce + ciphertext from {@link encryptBlob}.
 * @param key - matching 32-byte blob key.
 * @returns plaintext bytes, or `null` when the box does not open.
 */
export declare function decryptBlob(bundle: Uint8Array, key: Uint8Array): Uint8Array | null;
/**
 * Session blob key for Happy file attachments.
 * Legacy accounts: `deriveKey(secret, 'Happy Blobs', ['master'])`.
 * DataKey accounts: `deriveKey(dataKey, 'Happy Blobs', ['session'])`.
 * @param ctx - the same session crypto used for JSON envelopes.
 * @returns 32-byte secretbox key.
 */
export declare function deriveBlobKey(ctx: CryptoContext): Promise<Uint8Array>;
/**
 * HMAC-SHA512 hierarchical key tree used by Happy CLI `deriveKey`.
 * @param master - root secret.
 * @param usage - domain string such as `Happy Blobs`.
 * @param path - child indexes such as `['session']` or `['master']`.
 * @returns 32-byte derived key.
 */
export declare function deriveKey(master: Uint8Array, usage: string, path: readonly string[]): Promise<Uint8Array>;
export { encodeBase64, decodeBase64 };
//# sourceMappingURL=encryption.d.ts.map