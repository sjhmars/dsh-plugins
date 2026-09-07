/** Restore only rejected basic-compaction calls through the public LLM waterfall. */
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { GenerateOptions, LlmRuntime, Message, StreamChunk, ContentBlock } from '@deepseek-ai/dsh-llm'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-token-meter'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-compaction'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { defaults, validateConfig } from './config.ts'
import type { Config as Settings } from './config.ts'
import { collect, failure, overflow, recover } from './recovery.ts'
import { openJournal } from './journal.ts'
export type { Config as SegmentedCompactionConfig } from './config.ts'
export const name = 'segmented-compaction'
export const inject = ['llm', 'sessions', 'tokenMeter']
export const Config: Schema<Settings> = Schema.object({
  enabled: Schema.boolean().default(defaults.enabled),
  contextRatio: Schema.number().min(0.01).max(1).default(defaults.contextRatio),
  maxShrinkRetries: Schema.number().step(1).min(0).default(defaults.maxShrinkRetries),
  maxCalls: Schema.number().step(1).min(1).default(defaults.maxCalls),
})
/** The basic engine supplies its own final directive; never match arbitrary prose. */
export function isBasicCompaction(options: GenerateOptions): boolean {
  const last = options.messages.at(-1)
  return options.purpose === 'compaction' && options.sessionId !== undefined
    && last?.role === 'user' && last.source.kind === 'plugin'
    && last.source.plugin === 'dsh-compaction-basic'
}
/** Estimate the exact auxiliary envelope using the Harness meter and route image prices. */
export function estimateRequest(ctx: Context, runtime: LlmRuntime, options: GenerateOptions): number {
  const textMessage = (text: string): Message => createUserMessage({
    content: [{ type: 'text', text }], source: { kind: 'plugin', plugin: name },
  })
  let price = options.messages.reduce((sum, message) => sum + ctx.tokenMeter.estimateMessage(message), 0)
  if (options.system !== undefined) price += ctx.tokenMeter.estimateMessage(textMessage(options.system))
  if (options.tools?.length) price += ctx.tokenMeter.estimateMessage(textMessage(JSON.stringify(options.tools)))
  const images: Extract<ContentBlock, { type: 'image' }>[] = []
  const visit = (blocks: readonly ContentBlock[]): void => {
    for (const block of blocks) {
      if (block.type === 'image') images.push(block)
      else if (block.type === 'tool-result') visit(block.content)
    }
  }
  options.messages.forEach(message => visit(message.content))
  const pricing = runtime.imageRequestPricing(options.provider, options.model)
  if (pricing !== undefined && images.length > 0) {
    const prices = pricing.priceImages(images.map(image => image.attachment))
    images.forEach((image, index) => {
      const item = prices[index]!
      const synthetic = createUserMessage({ content: [image], source: { kind: 'plugin', plugin: name } })
      price += item.visualTokens + Math.ceil(item.text.length / 4)
        - (ctx.tokenMeter.estimateMessage(synthetic) - 4)
    })
  }
  return Math.max(0, price)
}
/** Register settings and the reversible, session-isolated recovery middleware. */
export function apply(ctx: Context, config: Settings): void {
  let source = (): Settings => validateConfig(config)
  let active = true
  const internal = new WeakSet<GenerateOptions>()
  const work = new Map<Promise<StreamChunk[]>, AbortController>()
  installSettingsSection(ctx, settingsNamespace(name), Config, config, {
    setSource: current => { source = current },
    onChange: () => {},
  })
  const dispose = ctx.on('llm/stream', function (this: LlmRuntime, options, next) {
    if (!active || internal.has(options) || !isBasicCompaction(options) || !source().enabled) return next()
    const runtime = this
    return (async function* (): AsyncIterable<StreamChunk> {
      const first = await collect(next(), options.signal)
      if (!overflow(first) || !active || !source().enabled) { yield* first; return }
      const controller = new AbortController()
      const signal = options.signal === undefined ? controller.signal : AbortSignal.any([options.signal, controller.signal])
      const operation = (async (): Promise<StreamChunk[]> => {
        const resolved = validateConfig(source())
        const session = ctx.sessions.get(options.sessionId!)
        if (session === undefined) return failure('Cannot find the session owning the failed compaction')
        let compactionId: string | undefined
        for (let index = session.events.length - 1; index >= 0; index--) {
          const event = session.events[index]!
          if (event.type === 'compaction/end') break
          if (event.type === 'compaction/start') { compactionId = event.data.compactionId; break }
        }
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
