/** Base64 helpers matching Happy CLI `encodeBase64` / `decodeBase64`. */

/**
 * Encode bytes as standard or URL-safe base64.
 * @param buffer - bytes to encode.
 * @param variant - `base64` (default) or `base64url` without padding.
 * @returns encoded string.
 */
export function encodeBase64(buffer: Uint8Array, variant: 'base64' | 'base64url' = 'base64'): string {
  const standard = Buffer.from(buffer).toString('base64')
  if (variant === 'base64') return standard
  return standard.replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

/**
 * Decode a standard or URL-safe base64 string.
 * @param value - encoded string.
 * @param variant - encoding used by `value`.
 * @returns decoded bytes.
 */
export function decodeBase64(value: string, variant: 'base64' | 'base64url' = 'base64'): Uint8Array {
  if (variant === 'base64url') {
    const padded = value.replaceAll('-', '+').replaceAll('/', '_') + '='.repeat((4 - value.length % 4) % 4)
    return new Uint8Array(Buffer.from(padded, 'base64'))
  }
  return new Uint8Array(Buffer.from(value, 'base64'))
}
