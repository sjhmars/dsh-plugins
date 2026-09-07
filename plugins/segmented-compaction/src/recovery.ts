/** Bounded sequential recovery of a rejected compaction request. */
import { BlockAssembler, CONTEXT_WINDOW_EXCEEDED_CODE } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, Message, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm'
import type { Config } from './config.ts'
import { fragmentUnit, groupMessages, historyMessage, pieceMessage, splitLength } from './segments.ts'
import type { Piece } from './segments.ts'

export interface RecoveryDependencies {
  contextWindow: number
  estimate(options: GenerateOptions): number
  call(options: GenerateOptions): AsyncIterable<StreamChunk>
  record(record: Record<string, unknown>): Promise<void>
}
/** Buffer one call so a failed attempt never contaminates the returned stream. */
export async function collect(source: AsyncIterable<StreamChunk>, signal?: AbortSignal): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of source) {
    signal?.throwIfAborted()
    chunks.push(chunk)
  }
  signal?.throwIfAborted()
  return chunks
}
/** Only a classified terminal context failure permits recovery. */
export function overflow(chunks: readonly StreamChunk[]): boolean {
  const last = chunks.at(-1)
  return last?.type === 'finish' && last.reason.kind === 'error'
    && last.reason.failure.code === CONTEXT_WINDOW_EXCEEDED_CODE
}
/** Do not sum derived totals when some providers omitted them. */
export function sumUsage(chunks: readonly StreamChunk[]): TokenUsage | undefined {
  const usages = chunks.filter(chunk => chunk.type === 'usage').map(chunk => chunk.usage)
  if (usages.length === 0) return undefined
  const result: TokenUsage = { inputTokens: 0, outputTokens: 0 }
  for (const usage of usages) {
    result.inputTokens += usage.inputTokens
    result.outputTokens += usage.outputTokens
    for (const key of ['cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens'] as const) {
      if (usage[key] !== undefined) result[key] = (result[key] ?? 0) + usage[key]
    }
  }
  if (usages.every(usage => usage.totalTokens !== undefined)) {
    result.totalTokens = usages.reduce((total, usage) => total + usage.totalTokens!, 0)
  }
  return result
}
/** Return only complete, non-empty text summaries; reasoning may accompany them. */
function summary(chunks: readonly StreamChunk[]): string {
  const assembler = new BlockAssembler()
  for (const chunk of chunks) assembler.push(chunk)
  if (assembler.finish.kind !== 'stop') throw new Error('Segment summary did not finish normally: ' + assembler.finish.kind)
  const blocks = assembler.blocks()
  if (blocks.some(block => block.type !== 'text' && block.type !== 'reasoning')) {
    throw new Error('Segment summary returned tool calls or non-text content')
  }
  const text = blocks.filter(block => block.type === 'text').map(block => block.text).join('\n')
  if (text.trim().length === 0) throw new Error('Segment summary is empty')
  return text
}
/** Preserve original failures; generated diagnostics use a plugin-specific code. */
export function failure(message: string): StreamChunk[] {
  return [{ type: 'finish', reason: { kind: 'error', failure: { code: 'SEGMENTED_COMPACTION_FAILED', message } } }]
}
/** Generate a single final stream while leaving the parent transaction untouched. */
export async function recover(
  original: GenerateOptions, first: StreamChunk[], config: Config, deps: RecoveryDependencies,
): Promise<StreamChunk[]> {
  const directive = original.messages.at(-1)!
  const units = groupMessages(original.messages.slice(0, -1))
  if (units.length === 0) return failure('No historical messages available to segment')
  const cap = Math.floor(deps.contextWindow * config.contextRatio) - (original.maxTokens ?? 0)
  if (cap <= 0) return failure('Output reservation leaves no segment input budget')
  const allUsage: StreamChunk[] = first.filter(chunk => chunk.type === 'usage')
  let carry = ''
  let index = 0
  let fragments: Piece[] | undefined
  let calls = 1
  let final: StreamChunk[] = []
  const request = (messages: Message[]): GenerateOptions => ({
    ...original,
    messages: [
      ...(carry.length === 0 ? [] : [historyMessage([{ type: 'text', text: '<compacted-summary>\n' + carry + '\n</compacted-summary>' }])]),
      ...messages, directive,
    ],
  })
  while (index < units.length) {
    original.signal?.throwIfAborted()
    let available = cap - deps.estimate(request([]))
    if (available <= 0) return failure('System, tools, directive and rolling summary fill the input budget')
    let retries = 0
    let rejectedMessages: string | undefined
    while (true) {
      original.signal?.throwIfAborted()
      const baseline = deps.estimate(request([]))
      const fits = (messages: Message[]): boolean => deps.estimate(request(messages)) <= baseline + available
      let messages: Message[] = []
      let takeUnits = 0
      let takeChars: number | undefined
      let consumedPieces = 0
      let remainderPiece: Piece | undefined
      if (fragments === undefined) {
        while (index + takeUnits < units.length) {
          const next = [...messages, ...units[index + takeUnits]!.messages]
          if (!fits(next)) break
          messages = next
          takeUnits++
        }
        if (takeUnits === 0) fragments = fragmentUnit(units[index]!)
      }
      if (fragments !== undefined) {
        for (const piece of fragments) {
          const whole = pieceMessage(piece)
          if (fits([...messages, whole])) {
            messages.push(whole)
            consumedPieces++
            continue
          }
          if (piece.block.type === 'text' || piece.block.type === 'reasoning') {
            let low = 0
            let high = piece.block.text.length
            while (low < high) {
              const middle = Math.ceil((low + high) / 2)
              if (fits([...messages, pieceMessage(piece, middle)])) low = middle
              else high = middle - 1
            }
            takeChars = splitLength(piece.block.text, low)
            if (takeChars > 0) {
              messages.push(pieceMessage(piece, takeChars))
              remainderPiece = { ...piece, block: { ...piece.block, text: piece.block.text.slice(takeChars) },
                offset: piece.offset + takeChars }
            }
          }
          if (messages.length === 0) return failure('An intact block or its source metadata exceeds the segment budget: ' + piece.source)
          break
        }
        if (messages.length === 0) return failure('Oversized unit has no fragmentable content')
      }
      if (calls >= config.maxCalls) return failure('Segmented compaction reached maxCalls=' + config.maxCalls)
      const options = request(messages)
      const serializedMessages = JSON.stringify(options.messages)
      if (serializedMessages === rejectedMessages) return failure('Shrinking made no progress on the rejected segment')
      calls++
      await deps.record({ type: 'request', call: calls, source: units[index]!.source, units: takeUnits,
        fragment: fragments?.[0]?.source, offset: fragments?.[0]?.offset, length: takeChars,
        request: { ...options, signal: undefined } })
      const chunks = await collect(deps.call(options), original.signal)
      await deps.record({ type: 'response', call: calls, chunks })
      allUsage.push(...chunks.filter(chunk => chunk.type === 'usage'))
      if (overflow(chunks)) {
        rejectedMessages = serializedMessages
        if (retries >= config.maxShrinkRetries) return failure('Segment exceeded maxShrinkRetries=' + config.maxShrinkRetries)
        available = Math.floor(Math.min(available, deps.estimate(options) - baseline) / 2)
        retries++
        if (available <= 0) return failure('No input budget remains after shrinking')
        continue
      }
      const terminal = chunks.at(-1)
      if (terminal?.type === 'finish' && (terminal.reason.kind === 'error' || terminal.reason.kind === 'aborted')) return chunks.filter(chunk => chunk.type === 'usage' || chunk.type === 'finish')
      let nextSummary: string
      try { nextSummary = summary(chunks) }
      catch (error) { return failure(error instanceof Error ? error.message : String(error)) }
      // Compare the accumulated history with its replacement, excluding fixed request overhead.
      const nextPrice = deps.estimate({ ...original, system: '', tools: [], messages: [historyMessage([{ type: 'text', text: nextSummary }])] })
      const inputPrice = deps.estimate({ ...options, system: '', tools: [], messages: options.messages.slice(0, -1) })
      if (nextPrice >= inputPrice) return failure('Segment summary is not smaller than the accumulated historical input')
      carry = nextSummary
      final = chunks
      if (fragments !== undefined) {
        fragments.splice(0, consumedPieces)
        if (remainderPiece !== undefined) fragments[0] = remainderPiece
        if (fragments.length === 0) { fragments = undefined; index++ }
      } else index += takeUnits
      break
    }
  }
  const usage = sumUsage(allUsage)
  const output: StreamChunk[] = final.filter(chunk => chunk.type !== 'usage' && chunk.type !== 'finish')
  if (usage !== undefined) output.push({ type: 'usage', usage })
  output.push({ type: 'finish', reason: { kind: 'stop' } })
  await deps.record({ type: 'complete', calls, summary: carry, usage })
  return output
}
