/** Save phone non-image files into the session workspace so Harness `read` can open them. */

import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type { PendingFile } from './types.ts'

/** Directory under the session cwd that holds phone files for `read`. */
export const HAPPY_INBOX_DIR = 'happy-inbox'

const UNSAFE_NAME = /[<>:"/\\|?*\u0000-\u001f]/g

/**
 * Strip path separators and reserved characters so the file stays inside `happy-inbox/`.
 * @param name - Happy's original filename.
 * @returns a single path segment, or `file` when nothing usable remains.
 */
export function sanitizeInboxName(name: string): string {
  const base = basename(name.replaceAll('\\', '/')).replace(UNSAFE_NAME, '_').replace(/^\.+$/u, '_')
  return base.length > 0 ? base : 'file'
}

/**
 * Pick a basename that is not already taken in this inbox (on disk or in this batch).
 * @param taken - basenames already used.
 * @param name - Happy's original filename.
 * @returns a unique basename under `happy-inbox/`.
 */
export function uniqueInboxName(taken: ReadonlySet<string>, name: string): string {
  const safe = sanitizeInboxName(name)
  if (!taken.has(safe)) return safe
  const ext = extname(safe)
  const stem = ext.length > 0 ? safe.slice(0, -ext.length) : safe
  for (let i = 1; i < 10_000; i++) {
    const candidate = `${stem}-${i}${ext}`
    if (!taken.has(candidate)) return candidate
  }
  return `${stem}-${Date.now()}${ext}`
}

/**
 * Workspace-relative path the `read` tool resolves against session cwd. Always `/`.
 * @param filename - a sanitized inbox basename.
 * @returns `happy-inbox/<filename>`.
 */
export function inboxReadPath(filename: string): string {
  return `${HAPPY_INBOX_DIR}/${filename}`
}

/**
 * Append a `read`-tool instruction after the user's typed text.
 * Harness web does not admit non-image composer uploads; ordinary files are workspace paths for `read`.
 * @param text - what the phone typed, possibly empty.
 * @param relativePaths - `happy-inbox/...` paths already written.
 * @returns the followup text, or `text` when there are no files.
 */
export function inboxReadPrompt(text: string, relativePaths: readonly string[]): string {
  if (relativePaths.length === 0) return text
  const list = relativePaths.map(path => `- ${path}`).join('\n')
  const instruction = `请用 read 工具阅读这些工作区文件（不要用 cat）：\n${list}`
  return text.trim() === '' ? instruction : `${text.trim()}\n\n${instruction}`
}

/**
 * Write extras into `<cwd>/happy-inbox/` and return relative paths for `read`.
 * @param cwd - session workspace root.
 * @param files - decrypted non-image attachments.
 * @returns posix-relative paths the model should pass to `read`.
 */
export async function saveInboxFiles(cwd: string, files: readonly PendingFile[]): Promise<string[]> {
  if (files.length === 0) return []
  const inbox = join(cwd, HAPPY_INBOX_DIR)
  await mkdir(inbox, { recursive: true })
  const taken = new Set(await readdir(inbox))
  const relative: string[] = []
  for (const file of files) {
    const name = uniqueInboxName(taken, file.name)
    taken.add(name)
    await writeFile(join(inbox, name), file.bytes)
    relative.push(inboxReadPath(name))
  }
  return relative
}
