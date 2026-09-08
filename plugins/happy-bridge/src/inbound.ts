/** Classify inbound Happy user text as a registered slash command or ordinary chat. */

import type { CommunicationRpc, PermissionRpc } from './types.ts'

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

/**
 * Synthetic last option the bridge appends to every question: the App's inline
 * form has no free-text input, so "custom answer" is a two-tap flow — pick
 * this option, then type the real answer in the composer.
 */
export const CUSTOM_ANSWER_LABEL = '✏️ 自定义…'

/**
 * Merge composer text with a deferred (marker-picked) submission.
 * - No deferred selections: the text becomes `custom` for every question
 *   (the original "type while waiting" behavior).
 * - With deferred selections: real options are kept per question; questions
 *   that picked the marker — and questions never answered — take the text
 *   as `custom`.
 * @param questions - harness questions in order.
 * @param text - the composer line.
 * @param deferred - per-question submitted options, keyed by question id.
 * @returns one answer row per question.
 */
export function mergeCustomAnswers(
  questions: readonly { id: string }[],
  text: string,
  deferred?: Record<string, string[]>,
): { id: string; selected: string[]; custom?: string }[] {
  return questions.map((question) => {
    const selected = deferred?.[question.id]
    if (selected === undefined) return { id: question.id, selected: [], custom: text }
    const real = selected.filter(option => option !== CUSTOM_ANSWER_LABEL)
    const marked = real.length !== selected.length
    return {
      id: question.id,
      selected: real,
      ...(!marked && real.length > 0 ? {} : { custom: text }),
    }
  })
}

/**
 * Translate a web-side harness answer batch into Happy communications answers
 * so the phone card shows the same choice instead of a cancelled form.
 * @param answers - harness answer rows from the web composer.
 * @returns answers keyed by question id.
 */
export function communicationAnswersFromWeb(
  answers: readonly { id: string; selected: string[]; custom?: string }[],
): Record<string, { options: string[]; custom?: string }> {
  return Object.fromEntries(answers.map(row => [row.id, {
    options: row.selected,
    ...(row.custom === undefined || row.custom === '' ? {} : { custom: row.custom }),
  }]))
}

/**
 * Translate Happy communications answers (`{ [question id]: { options, custom } }`)
 * into harness answer rows. Options become `selected`; free text becomes `custom`.
 * @param answers - communication RPC answers keyed by question id.
 * @param questions - original harness questions in order.
 * @returns one answer row per question.
 */
export function answersFromCommunication(
  answers: Record<string, { options: string[]; custom?: string }> | undefined,
  questions: readonly { id: string }[],
): { id: string; selected: string[]; custom?: string }[] {
  return questions.map((question) => {
    const answer = answers?.[question.id]
    if (answer === undefined) return { id: question.id, selected: [] }
    return {
      id: question.id,
      selected: answer.options,
      ...(answer.custom === undefined ? {} : { custom: answer.custom }),
    }
  })
}

/**
 * Decode a Happy `communication` RPC body (form answers or cancellation).
 * Unknown statuses degrade to `cancelled`, which re-asks instead of silently
 * submitting empty answers.
 * @param params - decrypted RPC params.
 * @returns id, form kind, answered/cancelled status, and per-question answers.
 */
export function parseCommunicationRpc(params: unknown): CommunicationRpc {
  const record = asUnknownRecord(params)
  const result: CommunicationRpc = {
    id: typeof record.id === 'string' ? record.id : '',
    kind: typeof record.kind === 'string' && record.kind !== '' ? record.kind : 'form',
    status: record.status === 'answered' ? 'answered' : 'cancelled',
  }
  if (!isUnknownRecord(record.answers)) return result
  const answers: Record<string, { options: string[]; custom?: string }> = {}
  for (const [key, value] of Object.entries(record.answers)) {
    if (!isUnknownRecord(value)) continue
    const options = Array.isArray(value.options)
      ? value.options.filter((option): option is string => typeof option === 'string')
      : []
    answers[key] = {
      options,
      ...(typeof value.custom === 'string' && value.custom !== '' ? { custom: value.custom } : {}),
    }
  }
  result.answers = answers
  return result
}

function asUnknownRecord(value: unknown): Record<string, unknown> {
  return isUnknownRecord(value) ? value : {}
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
