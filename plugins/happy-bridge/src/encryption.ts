/** Happy content encryption: legacy NaCl secretbox or AES-256-GCM dataKey. */

import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto'
import nacl from 'tweetnacl'
import { decodeBase64, encodeBase64 } from './bytes.ts'
import type { Credentials, EncryptionVariant } from './types.ts'

/** Content key used for one session or machine. */
export interface CryptoContext {
  /** AES-GCM or secretbox key. */
  key: Uint8Array
  /** Algorithm selected from the account credentials. */
  variant: EncryptionVariant
}

/**
 * Encrypt a JSON value the way Happy CLI `encrypt()` does.
 * @param ctx - session or machine crypto.
 * @param data - JSON-serializable plaintext.
 * @returns nonce+ciphertext bytes.
 */
export function encryptJson(ctx: CryptoContext, data: unknown): Uint8Array {
  if (ctx.variant === 'legacy') return encryptLegacy(data, ctx.key)
  return encryptWithDataKey(data, ctx.key)
}

/**
 * Decrypt a Happy ciphertext into JSON.
 * @param ctx - matching crypto.
 * @param data - nonce+ciphertext bytes.
 * @returns plaintext or `null` when the box does not open.
 */
export function decryptJson(ctx: CryptoContext, data: Uint8Array): unknown {
  if (ctx.variant === 'legacy') return decryptLegacy(data, ctx.key)
  return decryptWithDataKey(data, ctx.key)
}

/**
 * Encrypt JSON and return the on-wire base64 string.
 * @param ctx - session or machine crypto.
 * @param data - JSON-serializable plaintext.
 * @returns base64 ciphertext.
 */
export function encryptB64(ctx: CryptoContext, data: unknown): string {
  return encodeBase64(encryptJson(ctx, data))
}

/**
 * Decode base64 then decrypt JSON.
 * @param ctx - matching crypto.
 * @param value - base64 ciphertext.
 * @returns plaintext or `null`.
 */
export function decryptB64(ctx: CryptoContext, value: string): unknown {
  return decryptJson(ctx, decodeBase64(value))
}

/**
 * Open the pairing `response` blob (ephemeral-box bundle).
 * @param encryptedBundle - ephPublicKey + nonce + ciphertext.
 * @param recipientSecretKey - our box secret key.
 * @returns 32-byte shared secret, or versioned dataKey payload, or `null`.
 */
export function decryptWithEphemeralKey(
  encryptedBundle: Uint8Array,
  recipientSecretKey: Uint8Array,
): Uint8Array | null {
  const ephemeralPublicKey = encryptedBundle.slice(0, 32)
  const nonce = encryptedBundle.slice(32, 32 + nacl.box.nonceLength)
  const encrypted = encryptedBundle.slice(32 + nacl.box.nonceLength)
  const decrypted = nacl.box.open(encrypted, nonce, ephemeralPublicKey, recipientSecretKey)
  return decrypted ? decrypted : null
}

/**
 * Wrap a data-encryption key for the account public key.
 * @param dataKey - 32-byte DEK.
 * @param recipientPublicKey - account box public key.
 * @returns versioned bundle Happy stores as `dataEncryptionKey`.
 */
export function wrapDataEncryptionKey(dataKey: Uint8Array, recipientPublicKey: Uint8Array): Uint8Array {
  const boxed = encryptForPublicKey(dataKey, recipientPublicKey)
  const wrapped = new Uint8Array(boxed.length + 1)
  wrapped.set([0], 0)
  wrapped.set(boxed, 1)
  return wrapped
}

/**
 * Content crypto for a newly created Happy session.
 * @param credentials - account credentials.
 * @returns session key plus optional wrapped DEK for POST /v1/sessions.
 */
export function sessionCrypto(credentials: Credentials): {
  ctx: CryptoContext
  dataEncryptionKey: Uint8Array | undefined
} {
  if (credentials.encryption.type === 'legacy') {
    return {
      ctx: { key: credentials.encryption.secret, variant: 'legacy' },
      dataEncryptionKey: undefined,
    }
  }
  const key = new Uint8Array(randomBytes(32))
  return {
    ctx: { key, variant: 'dataKey' },
    dataEncryptionKey: wrapDataEncryptionKey(key, credentials.encryption.publicKey),
  }
}

/**
 * Content crypto for the machine entity (uses `machineKey` on dataKey accounts).
 * @param credentials - account credentials.
 * @returns machine key plus optional wrapped DEK.
 */
export function machineCrypto(credentials: Credentials): {
  ctx: CryptoContext
  dataEncryptionKey: Uint8Array | undefined
} {
  if (credentials.encryption.type === 'legacy') {
    return {
      ctx: { key: credentials.encryption.secret, variant: 'legacy' },
      dataEncryptionKey: undefined,
    }
  }
  return {
    ctx: { key: credentials.encryption.machineKey, variant: 'dataKey' },
    dataEncryptionKey: wrapDataEncryptionKey(
      credentials.encryption.machineKey,
      credentials.encryption.publicKey,
    ),
  }
}

function encryptLegacy(data: unknown, secret: Uint8Array): Uint8Array {
  const nonce = randomBytes(nacl.secretbox.nonceLength)
  const encrypted = nacl.secretbox(
    new TextEncoder().encode(JSON.stringify(data)),
    standalone(nonce),
    standalone(secret),
  )
  const result = new Uint8Array(nonce.length + encrypted.length)
  result.set(nonce)
  result.set(encrypted, nonce.length)
  return result
}

function decryptLegacy(data: Uint8Array, secret: Uint8Array): unknown {
  const nonce = data.slice(0, nacl.secretbox.nonceLength)
  const encrypted = data.slice(nacl.secretbox.nonceLength)
  const decrypted = nacl.secretbox.open(encrypted, nonce, standalone(secret))
  if (!decrypted) return null
  return JSON.parse(new TextDecoder().decode(decrypted)) as unknown
}

function encryptWithDataKey(data: unknown, dataKey: Uint8Array): Uint8Array {
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', dataKey, nonce)
  const plaintext = new TextEncoder().encode(JSON.stringify(data))
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag = cipher.getAuthTag()
  const bundle = new Uint8Array(1 + 12 + encrypted.length + 16)
  bundle.set([0], 0)
  bundle.set(nonce, 1)
  bundle.set(encrypted, 13)
  bundle.set(authTag, 13 + encrypted.length)
  return bundle
}

function decryptWithDataKey(bundle: Uint8Array, dataKey: Uint8Array): unknown {
  if (bundle.length < 1 + 12 + 16) return null
  if (bundle[0] !== 0) return null
  const nonce = bundle.slice(1, 13)
  const authTag = bundle.slice(bundle.length - 16)
  const ciphertext = bundle.slice(13, bundle.length - 16)
  try {
    const decipher = createDecipheriv('aes-256-gcm', dataKey, nonce)
    decipher.setAuthTag(authTag)
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    return JSON.parse(new TextDecoder().decode(decrypted)) as unknown
  } catch {
    // AES-GCM 校验失败：密钥不对或密文被截断。
    return null
  }
}

function encryptForPublicKey(data: Uint8Array, recipientPublicKey: Uint8Array): Uint8Array {
  const ephemeral = nacl.box.keyPair()
  const nonce = randomBytes(nacl.box.nonceLength)
  const encrypted = nacl.box(standalone(data), standalone(nonce), recipientPublicKey, ephemeral.secretKey)
  const result = new Uint8Array(ephemeral.publicKey.length + nonce.length + encrypted.length)
  result.set(ephemeral.publicKey, 0)
  result.set(nonce, ephemeral.publicKey.length)
  result.set(encrypted, ephemeral.publicKey.length + nonce.length)
  return result
}

/**
 * Encrypt a binary blob with NaCl crypto_secretbox (XSalsa20-Poly1305).
 * Wire format: nonce (24 bytes) then ciphertext plus 16-byte auth tag.
 * Matches Happy App/CLI `encryptBlob`.
 * @param data - plaintext bytes.
 * @param key - 32-byte blob key from {@link deriveBlobKey}.
 * @returns nonce + ciphertext.
 */
export function encryptBlob(data: Uint8Array, key: Uint8Array): Uint8Array {
  const nonce = randomBytes(nacl.secretbox.nonceLength)
  const encrypted = nacl.secretbox(standalone(data), standalone(nonce), standalone(key))
  const result = new Uint8Array(nonce.length + encrypted.length)
  result.set(nonce, 0)
  result.set(encrypted, nonce.length)
  return result
}

/**
 * Decrypt a binary blob encrypted with NaCl crypto_secretbox.
 * @param bundle - nonce + ciphertext from {@link encryptBlob}.
 * @param key - matching 32-byte blob key.
 * @returns plaintext bytes, or `null` when the box does not open.
 */
export function decryptBlob(bundle: Uint8Array, key: Uint8Array): Uint8Array | null {
  if (bundle.length < nacl.secretbox.nonceLength + 16) return null
  const nonce = bundle.slice(0, nacl.secretbox.nonceLength)
  const ciphertext = bundle.slice(nacl.secretbox.nonceLength)
  const decrypted = nacl.secretbox.open(ciphertext, standalone(nonce), standalone(key))
  return decrypted ? new Uint8Array(decrypted) : null
}

/**
 * Session blob key for Happy file attachments.
 * Legacy accounts: `deriveKey(secret, 'Happy Blobs', ['master'])`.
 * DataKey accounts: `deriveKey(dataKey, 'Happy Blobs', ['session'])`.
 * @param ctx - the same session crypto used for JSON envelopes.
 * @returns 32-byte secretbox key.
 */
export async function deriveBlobKey(ctx: CryptoContext): Promise<Uint8Array> {
  const path = ctx.variant === 'dataKey' ? ['session'] : ['master']
  return deriveKey(ctx.key, 'Happy Blobs', path)
}

/**
 * HMAC-SHA512 hierarchical key tree used by Happy CLI `deriveKey`.
 * @param master - root secret.
 * @param usage - domain string such as `Happy Blobs`.
 * @param path - child indexes such as `['session']` or `['master']`.
 * @returns 32-byte derived key.
 */
export async function deriveKey(master: Uint8Array, usage: string, path: readonly string[]): Promise<Uint8Array> {
  let state = hmacSha512(new TextEncoder().encode(`${usage} Master Seed`), master)
  for (const index of path) {
    const encoded = new TextEncoder().encode(index)
    const data = new Uint8Array(1 + encoded.length)
    data[0] = 0
    data.set(encoded, 1)
    state = hmacSha512(state.subarray(32), data)
  }
  return state.subarray(0, 32)
}

/** Copy a view onto its own ArrayBuffer so tweetnacl accepts it. */
function standalone(data: Uint8Array): Uint8Array {
  if (data.byteOffset === 0 && data.buffer.byteLength === data.length) return data
  return data.slice()
}

function hmacSha512(key: Uint8Array, data: Uint8Array): Uint8Array {
  return new Uint8Array(createHmac('sha512', key).update(data).digest())
}

export { encodeBase64, decodeBase64 }
