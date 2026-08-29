/** Fold a session label and replayable chat items from the harness log. */

import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment/types'

/** Minimal log event the history fold reads. */
export interface HistoryEvent {
  type: string
  time?: number
  data: unknown
}

/** One Happy envelope to emit when filling an empty mirrored session. */
export type HistoryItem =
  | { kind: 'turn-start'; time: number }
  | { kind: 'turn-end'; time: number; status: 'completed' | 'failed' | 'cancelled' }
  | { kind: 'user'; time: number; text: string; images: ImageAttachmentRef[] }
  | { kind: 'assistant'; time: number; text: string }
  | { kind: 'tool-start'; time: number; call: string; name: string; title: string; description: string; args: Record<string, unknown> }
  | { kind: 'tool-end'; time: number; call: string }

/**
 * Happy session-list title: logged title, else first human prompt, else the
 * same "新会话" the web sidebar uses. Never the folder name — that belongs
 * on Happy's project-group header via `metadata.path`.
 * @param events - session log.
 * @returns non-empty label.
 */
export function sessionLabel(events: readonly HistoryEvent[]): string {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event === undefined || event.type !== 'session/title') continue
    const title = asRecord(event.data).title
    if (typeof title === 'string' && title.trim() !== '') return title.trim()
  }
  for (const event of events) {
    if (event.type !== 'user/message') continue
    const text = visibleUserText(event)
    if (text === '') continue
    const line = text.split(/\r?\n/, 1)[0]?.trim() ?? ''
    if (line === '') continue
    return line.length <= 40 ? line : `${line.slice(0, 39)}…`
  }
  return '新会话'
}

/**
 * Same blank rule as the web sidebar: no `turn/start` yet means a
 * provisional New Session placeholder, not a conversation.
 * @param events - session log.
 * @returns true when the sidebar would hide this row unless it is selected.
 */
export function isBlankSession(events: readonly HistoryEvent[]): boolean {
  return !events.some(event => event.type === 'turn/start')
}

/**
 * Visible user/assistant/tool turns to copy onto an empty Happy session.
 * Plugin-injected user rows stay off the phone. Assistant chunks are skipped
 * in favor of the committed assistant/message. Reasoning blocks become a
 * collapsible Think card; tool-call blocks become Happy-known tool cards.
 * @param events - session log in seq order.
 * @returns replay items in log order.
 */
export function historyItems(events: readonly HistoryEvent[]): HistoryItem[] {
  const items: HistoryItem[] = []
  const started = new Set<string>()
  let reasoning = ''
  for (const event of events) {
    const time = typeof event.time === 'number' ? event.time : 0
    if (event.type === 'turn/start') {
      items.push({ kind: 'turn-start', time })
      continue
    }
    if (event.type === 'assistant/chunk') {
      reasoning = foldReasoning(reasoning, asRecord(asRecord(event.data).chunk))
      continue
    }
    if (event.type === 'turn/end') {
      if (reasoning.trim() !== '') {
        pushThink(items, time, reasoning.trim())
        reasoning = ''
      }
      const kind = asRecord(asRecord(event.data).reason).kind
      const status = kind === 'error' ? 'failed' : kind === 'aborted' || kind === 'interrupted' ? 'cancelled' : 'completed'
      items.push({ kind: 'turn-end', time, status })
      continue
    }
    if (event.type === 'user/message') {
      const text = visibleUserText(event)
      const images = visibleUserImages(event)
      if (text === '' && images.length === 0) continue
      items.push({ kind: 'user', time, text, images })
      continue
    }
    if (event.type === 'assistant/message') {
      const parts = assistantParts(asRecord(asRecord(event.data).message).content)
      const hasThink = parts.some(part => part.kind === 'thinking')
      if (!hasThink && reasoning.trim() !== '') pushThink(items, time, reasoning.trim())
      reasoning = ''
      for (const part of parts) {
        if (part.kind === 'thinking') {
          pushThink(items, time, part.text)
          continue
        }
        if (part.kind === 'text') {
          items.push({ kind: 'assistant', time, text: part.text })
          continue
        }
        if (started.has(part.call)) continue
        started.add(part.call)
        items.push({ kind: 'tool-start', time, call: part.call, ...happyTool(part.name, part.args) })
      }
      continue
    }
    if (event.type === 'tool/call') {
      const data = asRecord(event.data)
      const call = typeof data.callId === 'string' ? data.callId : ''
      const name = typeof data.name === 'string' ? data.name : 'tool'
      if (call === '' || started.has(call)) continue
      started.add(call)
      const args = toolArgs(data.arguments)
      items.push({ kind: 'tool-start', time, call, ...happyTool(name, args) })
      continue
    }
    if (event.type === 'tool/result') {
      const call = asRecord(asRecord(asRecord(event.data).message).source).callId
      if (typeof call === 'string' && call !== '') items.push({ kind: 'tool-end', time, call })
    }
  }
  return items
}

/**
 * Visible human prompt from a `user/message` log event.
 * Plugin injects and tool-result rows return empty.
 * @param event - one session log event.
 * @returns trimmed concatenated text blocks, or `''`.
 */
export function visibleUserText(event: HistoryEvent): string {
  if (event.type !== 'user/message') return ''
  const data = asRecord(event.data)
  const kind = asRecord(data.source).kind
  if (kind !== undefined && kind !== 'user') return ''
  return textBlocks(data.content)
}

/**
 * Image blocks from a human `user/message`. Plugin injects stay off the phone.
 * @param event - one session log event.
 * @returns attachment refs in content order.
 */
export function visibleUserImages(event: HistoryEvent): ImageAttachmentRef[] {
  if (event.type !== 'user/message') return []
  const data = asRecord(event.data)
  const kind = asRecord(data.source).kind
  if (kind !== undefined && kind !== 'user') return []
  if (!Array.isArray(data.content)) return []
  const images: ImageAttachmentRef[] = []
  for (const block of data.content) {
    const row = asRecord(block)
    if (row.type !== 'image') continue
    const attachment = asRecord(row.attachment)
    if (typeof attachment.attachmentId !== 'string' || attachment.attachmentId === '') continue
    if (typeof attachment.mediaType !== 'string' || typeof attachment.bytes !== 'number') continue
    if (typeof attachment.width !== 'number' || typeof attachment.height !== 'number') continue
    images.push(attachment as unknown as ImageAttachmentRef)
  }
  return images
}

/** One committed assistant content block, already folded for Happy. */
export type AssistantPart =
  | { kind: 'thinking'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'tool'; call: string; name: string; args: Record<string, unknown> }

/**
 * Walk committed assistant content in log order: reasoning, visible text, tool calls.
 * @param content - `assistant/message` content array.
 * @returns Happy-ready parts, skipping empty text.
 */
export function assistantParts(content: unknown): AssistantPart[] {
  if (!Array.isArray(content)) return []
  const parts: AssistantPart[] = []
  for (const block of content) {
    const row = asRecord(block)
    if (row.type === 'reasoning' && typeof row.text === 'string' && row.text.trim() !== '') {
      parts.push({ kind: 'thinking', text: row.text.trim() })
      continue
    }
    if (row.type === 'text' && typeof row.text === 'string' && row.text.trim() !== '') {
      parts.push({ kind: 'text', text: row.text.trim() })
      continue
    }
    if (row.type !== 'tool-call') continue
    const call = typeof row.id === 'string' ? row.id : typeof row.callId === 'string' ? row.callId : ''
    if (call === '') continue
    const name = typeof row.name === 'string' && row.name !== '' ? row.name : 'tool'
    parts.push({ kind: 'tool', call, name, args: toolArgs(row.arguments) })
  }
  return parts
}

/**
 * Happy App hides `thinking: true` text and tools named `think` /
 * `CodexReasoning` / `GeminiReasoning`. Names starting `mcp__` become a
 * one-line MCP row with no body. `Note` is unknown to that table, so it
 * stays a tappable card; full text rides in `args.text`.
 */
export const THINK_TOOL_NAME = 'Note'

/** One Happy tool-call-start payload. */
export interface HappyToolCard {
  name: string
  title: string
  description: string
  args: Record<string, unknown>
}

/**
 * Collapsed Think row label. Happy compact rows show `description`.
 * @param text - accumulated or committed reasoning.
 * @returns `Think` or `Think ·` plus the first line.
 */
export function thinkLabel(text: string): string {
  const first = clipLine(text.trim().split(/\r?\n/, 1)[0] ?? '')
  return first === '' ? 'Think' : `Think · ${first}`
}

/**
 * Think card for a finished reasoning block. Full text rides in `args`
 * so a tap opens the detail page; the row itself stays one line.
 * @param text - committed reasoning.
 */
export function thinkCard(text: string): HappyToolCard {
  const trimmed = text.trim()
  return {
    name: THINK_TOOL_NAME,
    title: 'Think',
    description: thinkLabel(trimmed),
    args: { text: trimmed },
  }
}

/** dsh wire names Happy's knownTools table actually styles. */
const HAPPY_TOOL_NAMES: Record<string, string> = {
  grep: 'Grep',
  glob: 'Glob',
  read: 'Read',
  write: 'Write',
  edit: 'Edit',
  bash: 'Bash',
  pwsh: 'Bash',
  web_search: 'WebSearch',
  web_fetch: 'WebFetch',
  todo_write: 'TodoWrite',
}

const FILE_PATH_TOOLS = new Set(['read', 'write', 'edit'])

const TOOL_HEADINGS: Record<string, string> = {
  grep: 'Grep',
  glob: 'Glob',
  read: 'Read',
  write: 'Write',
  edit: 'Edit',
  bash: 'Bash',
  pwsh: 'Pwsh',
  web_search: 'Search',
  web_fetch: 'Fetch',
  run_code: 'Code',
}

const TOOL_SUMMARY_KEYS: Record<string, readonly string[]> = {
  grep: ['pattern'],
  glob: ['pattern'],
  read: ['path', 'file_path', 'url'],
  write: ['path', 'file_path'],
  edit: ['path', 'file_path'],
  bash: ['description', 'command'],
  pwsh: ['description', 'command'],
  web_search: ['query'],
  web_fetch: ['url'],
}

/**
 * Map a dsh tool onto a Happy card. Compact rows only paint `description`,
 * so that field is `Grep · pattern` (tool name plus the web summary).
 * `name` stays PascalCase so Happy can still pick icons.
 * @param name - registered dsh tool name.
 * @param args - parsed tool arguments.
 */
export function happyTool(name: string, args: Record<string, unknown>): HappyToolCard {
  const heading = TOOL_HEADINGS[name] ?? headingFromName(name)
  return {
    name: HAPPY_TOOL_NAMES[name] ?? name,
    title: heading,
    description: toolTitle(name, args),
    args: happyToolArgs(name, args),
  }
}

/**
 * Web-style one-line label used in tests: `Grep · pattern`.
 * @param name - registered tool name.
 * @param args - parsed tool arguments.
 */
export function toolTitle(name: string, args: Record<string, unknown>): string {
  const heading = TOOL_HEADINGS[name] ?? headingFromName(name)
  const summary = toolSummary(name, args)
  const label = summary === '' || summary === heading ? heading : `${heading} · ${summary}`
  return label.length <= 80 ? label : `${label.slice(0, 79)}…`
}

function pushThink(items: HistoryItem[], time: number, text: string): void {
  const call = `think-${time}-${items.length}`
  items.push({ kind: 'tool-start', time, call, ...thinkCard(text) })
  items.push({ kind: 'tool-end', time, call })
}

function happyToolArgs(name: string, args: Record<string, unknown>): Record<string, unknown> {
  const mapped: Record<string, unknown> = { ...args }
  if (FILE_PATH_TOOLS.has(name) && typeof mapped.path === 'string' && mapped.file_path === undefined) {
    mapped.file_path = mapped.path
  }
  if (name === 'web_search' && typeof mapped.query !== 'string' && Array.isArray(mapped.queries)) {
    const query = mapped.queries.find((item): item is string => typeof item === 'string' && item.trim() !== '')
    if (query !== undefined) mapped.query = query
  }
  return mapped
}

function headingFromName(name: string): string {
  const spaced = name.replaceAll('_', ' ').trim()
  if (spaced === '') return 'Tool'
  return spaced.replaceAll(/\b[a-z]/gu, char => char.toUpperCase())
}

function toolSummary(name: string, args: Record<string, unknown>): string {
  if (name === 'web_search' && Array.isArray(args.queries)) {
    const queries = args.queries.filter((query): query is string => typeof query === 'string' && query.trim() !== '')
    if (queries.length > 0) return clipLine(queries.join(', '))
  }
  const keys = TOOL_SUMMARY_KEYS[name] ?? ['path', 'command', 'cmd', 'query', 'url', 'pattern', 'file', 'target']
  const picked = firstString(args, keys)
  return picked === undefined ? '' : clipLine(picked)
}

function clipLine(text: string): string {
  const line = text.split(/\r?\n/, 1)[0]?.trim() ?? ''
  return line.length <= 80 ? line : `${line.slice(0, 79)}…`
}

function foldReasoning(current: string, chunk: Record<string, unknown>): string {
  if (chunk.type === 'reasoning-delta' && typeof chunk.text === 'string') return current + chunk.text
  if (chunk.type === 'block-end') {
    const block = asRecord(chunk.block)
    if (block.type === 'reasoning' && typeof block.text === 'string') return block.text
  }
  return current
}

function firstString(args: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = args[key]
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return undefined
}

function toolArgs(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as Record<string, unknown>
    } catch {
      return { raw: value }
    }
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function textBlocks(content: unknown): string {
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    const row = asRecord(block)
    if (row.type === 'text' && typeof row.text === 'string') parts.push(row.text)
  }
  return parts.join('').trim()
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

/**
 * Preset the session actually runs: last `agent-preset/selected`, else the
 * creation-header value. Phone wake must mount this same composition, not the
 * header alone — a blank session may have switched before its first turn.
 * @param events - session log, oldest first.
 * @param headerAgentPreset - `header.agentPreset` from inspect.
 */
export function resolveSessionPreset(
  events: readonly HistoryEvent[],
  headerAgentPreset?: string,
): string | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event === undefined || event.type !== 'agent-preset/selected') continue
    const id = asRecord(event.data).agentPreset
    if (typeof id === 'string' && id !== '') return id
  }
  return headerAgentPreset
}

/** Provider, model, and optional effort used to start a phone-woken turn. */
export interface WakeModelSelection {
  provider: string
  model: string
  reasoningEffort?: string
}

/**
 * Same precedence Host `selectionFor` uses: first usable provider/model
 * wins; a later candidate may only fill a missing thinking level when it is
 * that same model. Empty provider/model pairs are skipped.
 * @param primary - process pick, else `session.requestHeader()?.config`.
 * @param fallbacks - remaining sources, usually the log then `agentDefaultModel`.
 */
export function wakeModelSelection(
  primary: WakeModelSelection | undefined,
  ...fallbacks: Array<WakeModelSelection | undefined>
): WakeModelSelection | undefined {
  const candidates = [primary, ...fallbacks].filter(
    (row): row is WakeModelSelection => row !== undefined && row.provider !== '' && row.model !== '',
  )
  const first = candidates[0]
  if (first === undefined) return undefined
  const reasoningEffort = first.reasoningEffort ?? candidates.find(
    row => row.provider === first.provider
      && row.model === first.model
      && row.reasoningEffort !== undefined,
  )?.reasoningEffort
  return {
    provider: first.provider,
    model: first.model,
    ...reasoningEffort === undefined ? {} : { reasoningEffort },
  }
}

/**
 * Effort the first phone-spawn / phone-wake request should send.
 * Current pick wins; otherwise a preferred (web) value or the model's
 * advertised default, but only when the model lists that id.
 * @param currentEffort - already chosen effort, if any.
 * @param preferred - web picker effort to reuse when the model accepts it.
 * @param modelDefault - `resolveModelInfo().reasoning.defaultEffort`.
 * @param supported - advertised effort ids; empty/absent means any string is accepted.
 */
export function pinWakeEffort(
  currentEffort: string | undefined,
  preferred: string | undefined,
  modelDefault: string | undefined,
  supported: readonly string[] | undefined,
): string | undefined {
  const allowed = supported === undefined || supported.length === 0
    ? undefined
    : new Set(supported)
  const pick = (value: string | undefined): string | undefined => {
    if (value === undefined || value === '') return undefined
    if (allowed !== undefined && !allowed.has(value)) return undefined
    return value
  }
  return pick(currentEffort)
    ?? pick(preferred)
    ?? pick(modelDefault)
    ?? supported?.find(id => id !== 'off')
}

/**
 * Sidebar sessions that should stay linked on the phone: every workspace
 * membership except the registry-global archive set.
 * @param workspaces - `workspaceRegistry.list()` projections.
 * @param archived - `workspaceRegistry.archivedSessionIds`.
 */
export function unarchivedSessionIds(
  workspaces: readonly { sessionIds: readonly string[] }[],
  archived: readonly string[],
): string[] {
  const hidden = new Set(archived)
  const out: string[] = []
  const seen = new Set<string>()
  for (const workspace of workspaces) {
    for (const id of workspace.sessionIds) {
      if (hidden.has(id) || seen.has(id)) continue
      seen.add(id)
      out.push(id)
    }
  }
  return out
}

/**
 * Sidebar ids still eligible for a Happy socket: not archived on the web,
 * and not dismissed from the phone.
 * @param wanted - {@link unarchivedSessionIds} result.
 * @param dismissed - phone stop-session / archive ids.
 * @returns ids that should have a live Happy socket.
 */
export function mirrorTargets(wanted: readonly string[], dismissed: ReadonlySet<string>): string[] {
  return wanted.filter(id => !dismissed.has(id))
}
