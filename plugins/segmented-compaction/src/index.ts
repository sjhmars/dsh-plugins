/** Restore only rejected basic-compaction calls through the public LLM waterfall. */
import type { Context, Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-settings'
import type { GenerateOptions, LlmRuntime, RequestMessage, Message, StreamChunk, ContentBlock } from '@deepseek-ai/dsh-llm'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-token-meter'
import type {} from '@deepseek-ai/dsh-session'
import type { CompactionEngine } from '@deepseek-ai/dsh-compaction'
import type {} from '@deepseek-ai/dsh-agent'
import { BasicCompactionEngine } from '@deepseek-ai/dsh-compaction-basic'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { defaults, validateConfig } from './config.ts'
import type { Config as Settings } from './config.ts'
import { collect, failure, overflow, recover } from './recovery.ts'
import { openJournal } from './journal.ts'
export type { Config as SegmentedCompactionConfig } from './config.ts'
export const name = 'segmented-compaction'
export const inject = ['llm', 'sessions', 'agents', 'tokenMeter']
/** Live recovery configuration supplied by the Loader. */
export type Config = { [K in keyof Settings]: Volatile<Settings[K]> }
export const Config = Schema.object({
  enabled: Schema.boolean().default(defaults.enabled).volatile(),
  contextRatio: Schema.number().min(0.01).max(1).default(defaults.contextRatio).volatile(),
  maxShrinkRetries: Schema.number().step(1).min(0).max(Number.MAX_SAFE_INTEGER).default(defaults.maxShrinkRetries).volatile(),
  maxCalls: Schema.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(defaults.maxCalls).volatile(),
})

/**
 * Capture one recovery configuration without retaining live references.
 * @param config - Loader-owned configuration references.
 * @returns Validated fields for one recovery operation.
 */
function snapshotConfig(config: Config): Settings {
  return validateConfig({
    enabled: config.enabled.get(), contextRatio: config.contextRatio.get(),
    maxShrinkRetries: config.maxShrinkRetries.get(), maxCalls: config.maxCalls.get(),
  })
}
/**
 * Identify requests from the owning BasicCompactionEngine.
 * @param options - LLM request including its purpose and owning Session.
 * @param engine - Agent-scoped compaction service.
 * @returns Whether this request belongs to basic compaction.
 */
export function isBasicCompaction(options: GenerateOptions, engine: CompactionEngine | undefined): boolean {
  return engine instanceof BasicCompactionEngine && options.purpose === 'compaction'
    && options.sessionId !== undefined && options.messages.at(-1)?.role === 'user'
}
/**
 * Estimate the auxiliary request with the Harness meter and route image prices.
 * @param ctx - Context providing the token meter.
 * @param runtime - Runtime that owns the original request.
 * @param options - Complete request including system, tools, and messages.
 * @returns Estimated input tokens.
 */
export function estimateRequest(ctx: Context, runtime: LlmRuntime, options: GenerateOptions): number {
  const textMessage = (text: string): Message => createUserMessage({
    content: [{ type: 'text', text }], source: { kind: 'user' },
  })
  const priceMessage = (message: RequestMessage): number => ctx.tokenMeter.estimateMessage(
    message.source === undefined ? createUserMessage({ content: message.content, source: { kind: 'user' } }) : message,
  )
  let price = options.messages.reduce((sum, message) => sum + priceMessage(message), 0)
  if (options.system !== undefined) price += ctx.tokenMeter.estimateMessage(textMessage(options.system))
  if (options.tools?.length) price += ctx.tokenMeter.estimateMessage(textMessage(JSON.stringify(options.tools)))
  const images: Extract<ContentBlock, { type: 'image' }>[] = []
  const visit = (blocks: readonly ContentBlock[]): void => {
    for (const block of blocks) {
      if (block.type === 'image') images.push(block)
    }
  }
  options.messages.forEach(message => visit(message.content))
  const pricing = runtime.imageRequestPricing(options.provider, options.model)
  if (pricing !== undefined && images.length > 0) {
    const prices = pricing.priceImages(images)
    images.forEach((image, index) => {
      const item = prices[index]!
      const synthetic = createUserMessage({ content: [image], source: { kind: 'user' } })
      price += item.visualTokens + Math.ceil(item.text.length / 4)
        - (ctx.tokenMeter.estimateMessage(synthetic) - 4)
    })
  }
  return Math.max(0, price)
}
/**
 * Recover rejected basic-compaction summaries within their owning transactions.
 * @param ctx - Host services and scoped event registrations.
 * @param config - Loader-owned live configuration references.
 */
export function apply(ctx: Context, config: Config): void {
  snapshotConfig(config)
  const source = (): Settings => snapshotConfig(config)
  let active = true
  const internal = new WeakSet<GenerateOptions>()
  const work = new Map<Promise<StreamChunk[]>, AbortController>()
  ctx.inject(['settings'], child => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)) })
  const compactions = new Map<string, string>()
  ctx.on('session/event', (session, event) => {
    if (event.type === 'compaction/start') compactions.set(session.id, event.data.compactionId)
    else if (event.type === 'compaction/end') compactions.delete(session.id)
  }, { global: true })
  const dispose = ctx.on('llm/stream', function (this: LlmRuntime, options, next) {
    if (!active || internal.has(options) || !isBasicCompaction(options, options.sessionId === undefined ? undefined : ctx.agents.get(options.sessionId)?.ctx.get('compaction')) || !source().enabled) return next()
    const runtime = this
    return (async function* (): AsyncIterable<StreamChunk> {
      const first = await collect(next(), options.signal)
      if (!overflow(first) || !active || !source().enabled) { yield* first; return }
      const controller = new AbortController()
      const signal = options.signal === undefined ? controller.signal : AbortSignal.any([options.signal, controller.signal])
      const operation = (async (): Promise<StreamChunk[]> => {
        const resolved = source()
        const session = ctx.sessions.get(options.sessionId!)
        if (session === undefined) return failure('Cannot find the session owning the failed compaction')
        const compactionId = compactions.get(session.id)
        if (compactionId === undefined) return failure('No active compaction transaction owns this request')
        const journal = await openJournal(dshHomePath('segmented-compaction'), options.sessionId!, compactionId)
        try {
          await journal.record({ type: 'original-failure', config: resolved, request: { ...options, signal: undefined }, chunks: first })
          const info = await runtime.resolveModelInfo(options.provider, options.model, signal)
          if (info.context === undefined) return failure('Configure contextWindow for the summarization model')
          const maxTokens = options.maxTokens ?? info.defaultMaxTokens
          if (maxTokens === undefined) return failure('Configure an explicit summary output reservation')
          ctx.logger.info('segmented-compaction: recovering failed summary; journal=' + journal.path)
          return await recover({ ...options, maxTokens, signal }, first, resolved, {
            contextWindow: info.context.contextWindow,
            estimate: request => estimateRequest(ctx, runtime, request),
            record: record => journal.record(record),
            call: request => {
              internal.add(request)
              return (async function* () {
                try { yield* runtime.stream(request) }
                finally { internal.delete(request) }
              })()
            },
          })
        } catch (error) {
          await journal.record({ type: 'failure', message: error instanceof Error ? error.message : String(error), aborted: signal.aborted })
          if (signal.aborted) throw signal.reason
          return failure(error instanceof Error ? error.message : String(error))
        } finally { await journal.close() }
      })()
      work.set(operation, controller)
      try { yield* await operation }
      finally { work.delete(operation) }
    })()
  }, { global: true })
  ctx.effect(() => async () => {
    active = false
    dispose()
    for (const controller of work.values()) controller.abort(new Error('Segmented compaction plugin unloaded'))
    await Promise.allSettled(work.keys())
  }, 'segmented-compaction: stop and settle recovery requests')
}
