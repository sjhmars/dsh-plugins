/** Classify inbound Happy user text as a registered slash command or ordinary chat. */

import type { PermissionRpc } from './types.ts'

/** Normalized inbound payload from a decrypted Happy message. */
export type HappyInbound =
  | { kind: 'text'; text: string; meta: Record<string, unknown> }
  | { kind: 'file'; ref: string; name: string; mimeType?: string; meta: Record<string, unknown> }

/**
 * Read a user text or file event from a decrypted Happy payload.
 * The App wraps file events as `{ role: 'session', content: { type: 'session', data: { ev } } }`.
 * happy-wire envelopes put `ev` directly on `content`. Chat text from the phone
 * is still `{ role: 'user', content: { type: 'text' } }`.
 * @param plain - decrypted socket payload.
 * @returns inbound chat or file, or `undefined` when the payload is not user input.
 */
export function parseHappyInbound(plain: unknown): HappyInbound | undefined {
  const record = asUnknownRecord(plain)
  const meta = asUnknownRecord(record.meta)
  const ev = userSessionEvent(record)
  if (ev !== undefined) {
    if (ev.t === 'text' && typeof ev.text === 'string') {
      return { kind: 'text', text: ev.text, meta }
    }
    if (ev.t === 'file' && typeof ev.ref === 'string') {
      return {
        kind: 'file',
        ref: ev.ref,
        name: typeof ev.name === 'string' ? ev.name : 'file',
        meta,
        ...(typeof ev.mimeType === 'string' ? { mimeType: ev.mimeType } : {}),
      }
    }
    return undefined
  }
  if (record.role === 'user') {
    const content = asUnknownRecord(record.content)
    if (content.type === 'text' && typeof content.text === 'string') {
      return { kind: 'text', text: content.text, meta }
    }
  }
  return undefined
}

/**
 * Unwrap a user-role session event from either Happy App raw records or happy-wire envelopes.
 * @param record - decrypted root object.
 * @returns the `ev` object, or `undefined`.
 */
function userSessionEvent(record: Record<string, unknown>): Record<string, unknown> | undefined {
  if (record.role !== 'session') return undefined
  const content = asUnknownRecord(record.content)
  if (content.role === 'user') return asUnknownRecord(content.ev)
  const data = asUnknownRecord(content.data)
  if (content.type === 'session' && data.role === 'user') return asUnknownRecord(data.ev)
  return undefined
}

const COMMAND_LINE = /^\/([a-z][a-z0-9_-]*)(?=$|[\t\n\r ])/u

/**
 * Parse a candidate slash line the same way `dsh-commands` `parseCommand` does.
 * @param line - complete user text.
 * @returns name + rawInput, or `undefined` when the line is not a command.
 */
export function parseSlashLine(line: string): { name: string; rawInput: string } | undefined {
  const match = COMMAND_LINE.exec(line)
  if (match === null) return undefined
  const name = match[1]
  if (name === undefined) return undefined
  return { name, rawInput: line.slice(match[0].length) }
}

/**
 * Decide whether inbound phone text should run as a command or as followup.
 * Unknown `/name` stays chat so user-invocable skills still inject.
 * @param line - complete user text.
 * @param commandNames - registered command names without the leading slash.
 * @returns `command` when the whole line is a registered command, otherwise `chat`.
 */
export function classifyInboundText(line: string, commandNames: ReadonlySet<string>): 'command' | 'chat' {
  const parsed = parseSlashLine(line.trim())
  if (parsed === undefined) return 'chat'
  return commandNames.has(parsed.name) ? 'command' : 'chat'
}

/**
 * Translate Happy AskUserQuestion `answers` (`{ [question text]: "a, b" }`)
 * back into harness `{ id, selected }` rows.
 * @param answers - permission RPC `updatedInput.answers`.
 * @param questions - original harness questions in order.
 * @returns selected labels keyed by question id.
 */
export function answersFromHappy(
  answers: Record<string, string> | undefined,
  questions: readonly { id: string; question: string }[],
): { id: string; selected: string[] }[] {
  if (answers === undefined) {
    return questions.map(question => ({ id: question.id, selected: [] }))
  }
  return questions.map((question) => {
    const raw = answers[question.question] ?? answers[question.id] ?? ''
    const selected = raw.split(',').map(part => part.trim()).filter(part => part !== '')
    return { id: question.id, selected }
  })
}

/**
 * Fill every still-open question with the typed chat line as `custom`.
 * @param questions - harness questions in order.
 * @param text - the App composer line.
 * @returns one answer row per question.
 */
export function customAnswersFromText(
  questions: readonly { id: string }[],
  text: string,
): { id: string; selected: []; custom: string }[] {
  return questions.map(question => ({ id: question.id, selected: [], custom: text }))
}

/**
 * The option label that declines a plan-review question.
 * @param question - first question of a plan-review `ask`.
 * @returns the non-approve option label, or Keep planning.
 */
export function planReviewDeclineLabel(question: {
  intent?: { kind: string; approve: string }
  options?: readonly { label: string }[]
}): string {
  const approve = question.intent?.kind === 'plan-review' ? question.intent.approve : undefined
  return question.options?.find(option => option.label !== approve)?.label ?? 'Keep planning'
}

/**
 * Decode a Happy `permission` RPC body.
 * @param params - decrypted RPC params.
 * @returns id, approved flag, optional Always-allow decision, and answers.
 */
export function parsePermissionRpc(params: unknown): PermissionRpc {
  const record = asUnknownRecord(params)
  const result: PermissionRpc = {
    id: typeof record.id === 'string' ? record.id : '',
    approved: record.approved === true,
    ...(typeof record.decision === 'string' && record.decision !== '' ? { decision: record.decision } : {}),
  }
  if (!isUnknownRecord(record.updatedInput)) return result
  const answers = record.updatedInput['answers']
  if (!isUnknownRecord(answers)) {
    result.updatedInput = {}
    return result
  }
  const mapped: Record<string, string> = {}
  for (const [key, value] of Object.entries(answers)) {
    if (typeof value === 'string') mapped[key] = value
  }
  result.updatedInput = { answers: mapped }
  return result
}

function asUnknownRecord(value: unknown): Record<string, unknown> {
  return isUnknownRecord(value) ? value : {}
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
