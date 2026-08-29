/** Happy HTTP helpers: auth, sessions, machines, attachments. */

import { encodeBase64 } from './bytes.ts'
import type { CryptoContext } from './encryption.ts'
import { encryptB64 } from './encryption.ts'
import { HAPPY_CLIENT } from './happy-version.ts'

/**
 * JSON POST/GET against the Happy API with the CLI client header.
 * @param serverUrl - API origin.
 * @param path - path beginning with `/`.
 * @param init - method, token, JSON body.
 * @returns parsed JSON, or throws with status text.
 */
export async function happyFetch(
  serverUrl: string,
  path: string,
  init: { method?: string; token?: string; body?: unknown },
): Promise<unknown> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Happy-Client': HAPPY_CLIENT,
  }
  if (init.token !== undefined) headers.Authorization = `Bearer ${init.token}`
  const response = await fetch(`${trimSlash(serverUrl)}${path}`, {
    method: init.method ?? 'GET',
    headers,
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  })
  const text = await response.text()
  let json: unknown = undefined
  if (text !== '') {
    try {
      json = JSON.parse(text) as unknown
    } catch {
      json = { raw: text }
    }
  }
  if (!response.ok) {
    throw new Error(`Happy HTTP ${response.status} ${path}: ${text.slice(0, 300)}`)
  }
  return json
}

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
export async function createOrLoadSession(input: {
  serverUrl: string
  token: string
  tag: string
  crypto: CryptoContext
  metadata: unknown
  agentState: unknown
  dataEncryptionKey?: Uint8Array
}): Promise<{ id: string; seq: number; metadataVersion: number; agentStateVersion: number }> {
  const json = await happyFetch(input.serverUrl, '/v1/sessions', {
    method: 'POST',
    token: input.token,
    body: {
      tag: input.tag,
      metadata: encryptB64(input.crypto, input.metadata),
      agentState: input.agentState === null || input.agentState === undefined
        ? null
        : encryptB64(input.crypto, input.agentState),
      dataEncryptionKey: input.dataEncryptionKey === undefined
        ? null
        : encodeBase64(input.dataEncryptionKey),
    },
  })
  const session = asRecord(asRecord(json).session)
  const id = session.id
  if (typeof id !== 'string' || id === '') throw new Error('Happy 创建会话没有返回 id')
  return {
    id,
    seq: numberOr(session.seq, 0),
    metadataVersion: numberOr(session.metadataVersion, 0),
    agentStateVersion: numberOr(session.agentStateVersion, 0),
  }
}

/**
 * Register or update the machine entity so the App can spawn onto this Host.
 * @param input - machine id, encrypted metadata, optional daemon state.
 * @returns versions from the server.
 */
export async function createOrLoadMachine(input: {
  serverUrl: string
  token: string
  machineId: string
  crypto: CryptoContext
  metadata: unknown
  daemonState: unknown
  dataEncryptionKey?: Uint8Array
}): Promise<{ metadataVersion: number; daemonStateVersion: number }> {
  const json = await happyFetch(input.serverUrl, '/v1/machines', {
    method: 'POST',
    token: input.token,
    body: {
      id: input.machineId,
      metadata: encryptB64(input.crypto, input.metadata),
      daemonState: encryptB64(input.crypto, input.daemonState),
      ...(input.dataEncryptionKey === undefined
        ? {}
        : { dataEncryptionKey: encodeBase64(input.dataEncryptionKey) }),
    },
  })
  const machine = asRecord(asRecord(json).machine)
  return {
    metadataVersion: numberOr(machine.metadataVersion, 0),
    daemonStateVersion: numberOr(machine.daemonStateVersion, 0),
  }
}

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
export async function uploadEncryptedAttachment(
  serverUrl: string,
  token: string,
  sessionId: string,
  filename: string,
  encrypted: Uint8Array,
): Promise<string> {
  const origin = trimSlash(serverUrl)
  const json = await happyFetch(origin, `/v1/sessions/${encodeURIComponent(sessionId)}/attachments/request-upload`, {
    method: 'POST',
    token,
    body: { filename, size: encrypted.length },
  })
  const upload = asRecord(json)
  const ref = upload.ref
  const uploadUrl = upload.uploadUrl
  if (typeof ref !== 'string' || ref === '' || typeof uploadUrl !== 'string' || uploadUrl === '') {
    throw new Error('Happy 附件上传没有返回 uploadUrl')
  }
  if (upload.method === 'POST') {
    const fields = stringRecord(upload.formFields)
    const { body, boundary } = buildMultipartUploadBody(fields, encrypted)
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: new Blob([copyBytes(body)]),
    })
    if (!response.ok) throw new Error(`Happy 附件上传失败 ${String(response.status)}`)
    return ref
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/octet-stream' }
  if (uploadUrl.startsWith(origin)) headers.Authorization = `Bearer ${token}`
  const response = await fetch(uploadUrl, { method: 'PUT', headers, body: new Blob([copyBytes(encrypted)]) })
  if (!response.ok) throw new Error(`Happy 附件上传失败 ${String(response.status)}`)
  return ref
}

function stringRecord(value: unknown): Record<string, string> {
  const record = asRecord(value)
  const out: Record<string, string> = {}
  for (const [key, field] of Object.entries(record)) {
    if (typeof field === 'string') out[key] = field
  }
  return out
}

function escapeMultipartValue(value: string): string {
  return value.replaceAll('\r', '').replaceAll('\n', '').replaceAll('"', '%22')
}

function buildMultipartUploadBody(
  fields: Record<string, string>,
  data: Uint8Array,
): { body: Uint8Array; boundary: string } {
  const boundary = `----happy-bridge-${crypto.randomUUID()}`
  const chunks: Uint8Array[] = []
  for (const [key, value] of Object.entries(fields)) {
    chunks.push(new TextEncoder().encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="${escapeMultipartValue(key)}"\r\n\r\n${value}\r\n`,
    ))
  }
  chunks.push(new TextEncoder().encode(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="blob"\r\nContent-Type: application/octet-stream\r\n\r\n`,
  ))
  chunks.push(data)
  chunks.push(new TextEncoder().encode(`\r\n--${boundary}--\r\n`))
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { body, boundary }
}

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
export async function downloadEncryptedAttachment(
  serverUrl: string,
  token: string,
  sessionId: string,
  ref: string,
): Promise<Uint8Array> {
  const origin = trimSlash(serverUrl)
  const json = await happyFetch(origin, `/v1/sessions/${encodeURIComponent(sessionId)}/attachments/request-download`, {
    method: 'POST',
    token,
    body: { ref },
  })
  const downloadUrl = asRecord(json).downloadUrl
  if (typeof downloadUrl !== 'string' || downloadUrl === '') {
    throw new Error('Happy 附件下载没有返回 downloadUrl')
  }
  const headers: Record<string, string> = {}
  if (downloadUrl.startsWith(origin)) headers.Authorization = `Bearer ${token}`
  const response = await fetch(downloadUrl, { headers })
  if (!response.ok) {
    throw new Error(`Happy 附件下载失败 ${String(response.status)}`)
  }
  return new Uint8Array(await response.arrayBuffer())
}

/**
 * Mark a Happy session inactive without deleting it. Accidental archive of a
 * real conversation can still receive a later phone send.
 * @param serverUrl - API origin.
 * @param token - bearer token.
 * @param sessionId - Happy session id.
 */
export async function archiveHappySession(serverUrl: string, token: string, sessionId: string): Promise<void> {
  try {
    await happyFetch(serverUrl, `/v1/sessions/${encodeURIComponent(sessionId)}/archive`, { method: 'POST', token })
  } catch {
    // Archive endpoint missing or session already inactive.
  }
}

/**
 * Remove a Happy cloud session so the App can drop it from the list.
 * Already-gone ids are ignored.
 * @param serverUrl - API origin.
 * @param token - bearer token.
 * @param sessionId - Happy session id.
 */
export async function deleteHappySession(serverUrl: string, token: string, sessionId: string): Promise<void> {
  await archiveHappySession(serverUrl, token, sessionId)
  try {
    await happyFetch(serverUrl, `/v1/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE', token })
  } catch {
    // Session already deleted on the Happy API, or DELETE is not offered.
  }
}

/**
 * Happy cloud sessions this token can see. Used to drop blank ghosts the
 * App can only archive, not delete.
 * @param serverUrl - API origin.
 * @param token - bearer token.
 * @returns id and optional tag; empty when the list endpoint is unavailable.
 */
export async function listHappySessions(
  serverUrl: string,
  token: string,
): Promise<{ id: string; tag: string }[]> {
  try {
    const json = await happyFetch(serverUrl, '/v1/sessions', { token })
    return sessionRows(json)
  } catch {
    return []
  }
}

function sessionRows(json: unknown): { id: string; tag: string }[] {
  const root = asRecord(json)
  const list = Array.isArray(json)
    ? json
    : Array.isArray(root.sessions)
      ? root.sessions
      : Array.isArray(root.items)
        ? root.items
        : []
  const out: { id: string; tag: string }[] = []
  for (const row of list) {
    const record = asRecord(row)
    const nested = asRecord(record.session)
    const id = typeof record.id === 'string' && record.id !== ''
      ? record.id
      : typeof nested.id === 'string' ? nested.id : ''
    if (id === '') continue
    const tag = typeof record.tag === 'string'
      ? record.tag
      : typeof nested.tag === 'string' ? nested.tag : ''
    out.push({ id, tag })
  }
  return out
}

function trimSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function copyBytes(data: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(data.byteLength)
  copy.set(data)
  return copy
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
