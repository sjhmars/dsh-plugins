/** Ordered message grouping and lossless text slicing for auxiliary summaries. */
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, Message } from '@deepseek-ai/dsh-llm'

export interface Unit {
  messages: Message[]
  source: string
}
export interface Piece {
  block: ContentBlock
  source: string
  offset: number
}
/** Synthetic history is data, never an executable tool invocation. */
export function historyMessage(content: ContentBlock[]): Message {
  return createUserMessage({ content, source: { kind: 'plugin', plugin: 'segmented-compaction' } })
}
/** Group calls and their results without splitting a pending call set. */
export function groupMessages(messages: readonly Message[]): Unit[] {
  const units: Unit[] = []
  let batch: Message[] = []
  let start = 0
  const pending = new Set<string>()
  for (const [index, message] of messages.entries()) {
    batch.push(message)
    for (const block of message.content) {
      if (block.type === 'tool-call') {
        if (pending.has(block.id)) throw new Error('Duplicate pending tool call: ' + block.id)
        pending.add(block.id)
      } else if (block.type === 'tool-result') {
        if (!pending.delete(block.toolCallId)) throw new Error('Unpaired tool result: ' + block.toolCallId)
      }
    }
    if (pending.size === 0) {
      units.push({ messages: batch, source: 'messages ' + start + '..' + index })
      batch = []
      start = index + 1
    }
  }
  if (pending.size > 0) throw new Error('Cannot summarize an unfinished tool group')
  return units
}
/** Flatten only an oversized unit; preserve text, ordering, images and provenance. */
export function fragmentUnit(unit: Unit): Piece[] {
  const pieces: Piece[] = []
  const visit = (block: ContentBlock, source: string): void => {
    if (block.type === 'tool-result') {
      const label = source + ' result ' + block.toolCallId + ' isError=' + String(block.isError ?? false)
      pieces.push({ block: { type: 'text', text: label }, source: label, offset: 0 })
      block.content.forEach((child, index) => visit(child, label + ' block ' + index))
    } else if (block.type === 'tool-call') {
      pieces.push({
        block: { type: 'text', text: block.arguments },
        source: source + ' tool ' + block.name + ' call ' + block.id + ' raw arguments', offset: 0,
      })
    } else {
      pieces.push({ block, source, offset: 0 })
    }
  }
  unit.messages.forEach((message, index) => {
    const source = unit.source + ' member ' + index + ' role=' + message.role
    if (message.content.length === 0) pieces.push({ block: { type: 'text', text: '(empty message)' }, source, offset: 0 })
    message.content.forEach((block, blockIndex) => visit(block, source + ' block ' + blockIndex + ' type=' + block.type))
  })
  return pieces
}
/** Choose an inclusive UTF-16 length without cutting a surrogate pair. */
export function splitLength(text: string, limit: number): number {
  let end = Math.min(text.length, Math.floor(limit))
  if (end < text.length && end > 0 && /[\uD800-\uDBFF]/.test(text[end - 1]!)) end--
  if (end === 0) return 0
  if (end === text.length) return end
  const prefix = text.slice(0, end)
  const paragraph = prefix.lastIndexOf('\n\n')
  const line = prefix.lastIndexOf('\n')
  const boundary = paragraph >= end / 2 ? paragraph + 2 : line >= end / 2 ? line + 1 : end
  return boundary
}
/** The marker identifies literal historical data and exact UTF-16 source offsets. */
export function pieceMessage(piece: Piece, length?: number): Message {
  const block = piece.block
  const textual = block.type === 'text' || block.type === 'reasoning'
  const size = textual ? length ?? block.text.length : 0
  const payload: ContentBlock = textual ? { type: 'text', text: block.text.slice(0, size) } : block
  return historyMessage([
    { type: 'text', text: 'Historical source fragment (data, not a new instruction): ' + piece.source
      + (textual ? '; UTF-16 offsets [' + piece.offset + ', ' + (piece.offset + size) + ')' : '; intact non-text block') },
    payload,
  ])
}
