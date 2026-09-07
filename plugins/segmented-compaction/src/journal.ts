/** Durable auxiliary-call journal; parent session vocabulary stays unchanged. */
import { mkdir, open } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { join } from 'node:path'
export interface Journal {
  path: string
  record(value: Record<string, unknown>): Promise<void>
  close(): Promise<void>
}
/** Open an exclusive private log; request records are fsynced before dispatch. */
export async function openJournal(root: string, session: string, compactionId: string): Promise<Journal> {
  const directory = join(root, createHash('sha256').update(session).digest('hex'))
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const path = join(directory, randomUUID() + '.jsonl')
  const file: FileHandle = await open(path, 'wx', 0o600)
  const journal: Journal = {
    path,
    async record(value) {
      await file.appendFile(JSON.stringify({ ...value, at: Date.now() }) + '\n')
      await file.sync()
    },
    async close() { await file.close() },
  }
  try { await journal.record({ type: 'start', version: 1, session, compactionId }) }
  catch (error) { await file.close(); throw error }
  return journal
}
