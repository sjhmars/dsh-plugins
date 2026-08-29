/** Base64 helpers matching Happy CLI `encodeBase64` / `decodeBase64`. */
/**
 * Encode bytes as standard or URL-safe base64.
 * @param buffer - bytes to encode.
 * @param variant - `base64` (default) or `base64url` without padding.
 * @returns encoded string.
 */
export declare function encodeBase64(buffer: Uint8Array, variant?: 'base64' | 'base64url'): string;
/**
 * Decode a standard or URL-safe base64 string.
 * @param value - encoded string.
 * @param variant - encoding used by `value`.
 * @returns decoded bytes.
 */
export declare function decodeBase64(value: string, variant?: 'base64' | 'base64url'): Uint8Array;
//# sourceMappingURL=bytes.d.ts.map