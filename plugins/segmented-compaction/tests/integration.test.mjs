import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { BasicCompactionEngine } from '@deepseek-ai/dsh-compaction-basic'
import TokenMeter from '@deepseek-ai/dsh-token-meter'
import { LlmAdapter, createUserMessage } from '@deepseek-ai/dsh-llm'
import * as Plugin from '../src/index.ts'
import { defaults } from '../src/config.ts'

const failed = code => ({ type: 'finish', reason: { kind: 'error', failure: { code, message: code } } })
class Adapter extends LlmAdapter {
  requests = []
  activated = false
  capacity = 16000
  failureCode = 'CONTEXT_WINDOW_EXCEEDED'
  async resolveModel(provider, model) { return { provider, id: model, name: model,
    context: { contextWindow: this.activated ? this.capacity : 1000000 } } }
  async *stream(options) {
    this.requests.push(options)
    const length = JSON.stringify(options.messages).length
    if (this.activated && length > 12500) { yield failed(this.failureCode); return }
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: options.purpose === 'compaction' ? 'Recovered checkpoint.' : 'continued' } }
    yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 2 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}
async function setup(auto) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'segmented-test-'))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = directory
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(TokenMeter)
  const adapter = new Adapter()
  ctx.llm.registerAdapter(['mock'], adapter)
  const compact = new BasicCompactionEngine(ctx, { auto, retainTokens: 0, maxTokens: 100 })
  const fiber = ctx.plugin(Plugin, defaults)
  await fiber
  const agent = ctx.agentLoop.create('segmented-test', { provider: 'mock', model: 'm' })
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'long historical facts 中文 '.repeat(6000) }], source: { kind: 'user' } }))
  await agent.whenIdle()
  adapter.requests.length = 0
  return { ctx, adapter, compact, agent, directory, fiber, async close() {
    await ctx.fiber.dispose()
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    // Keep test journals under the OS temporary directory for failure diagnosis.
  } }
}
test('real manual compact reuses one parent transaction, survives reload and allows conversation', async () => {
  const h = await setup(false)
  try {
    h.adapter.activated = true
    const result = await h.compact.compactNow(h.agent, new AbortController().signal)
    assert.ok(result)
    const requests = h.adapter.requests
    assert.ok(requests.length > 2)
    assert.ok(JSON.stringify(requests[0].messages).length > 12500)
    for (const request of requests.slice(1)) {
      assert.equal(request.messages.at(-1).content[0].text, requests[0].messages.at(-1).content[0].text)
      assert.equal(request.maxTokens, 100)
    }
    const summaries = h.agent.session.events.filter(e => e.type === 'compaction/summary')
    assert.equal(summaries.length, 1)
    assert.equal(h.agent.session.events.filter(e => e.type === 'compaction/start').length, 1)
    const reloaded = h.ctx.sessions.create('reloaded', { seed: [...h.agent.session.events] })
    assert.deepEqual(reloaded.deriveMessages(), h.agent.session.deriveMessages())
    h.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'continue' }], source: { kind: 'user' } }))
    await h.agent.whenIdle()
    assert.equal(h.agent.session.events.at(-1).data.reason.kind, 'completed')
    const journalNames = await fs.readdir(path.join(h.directory, 'segmented-compaction'), { recursive: true })
    const journalPath = journalNames.find(p => p.endsWith('.jsonl'))
    const journal = (await fs.readFile(path.join(h.directory, 'segmented-compaction', journalPath), 'utf8')).trim().split('\n').map(JSON.parse)
    assert.equal(journal[0].type, 'start')
    assert.ok(journal.some(r => r.type === 'complete'))
    assert.equal(journal.filter(r => r.type === 'request').length, requests.filter(r => r.purpose === 'compaction').length - 1)
  } finally { await h.close() }
})
for (const mode of ['pressure', 'overflow']) {
  test('real automatic recovery: ' + mode, async () => {
    const h = await setup(true)
    try {
      h.adapter.activated = true
      if (mode === 'overflow') h.adapter.capacity = 1000000
      h.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'continue' }], source: { kind: 'user' } }))
      await h.agent.whenIdle()
      assert.equal(h.agent.session.events.at(-1).data.reason.kind, 'completed')
      assert.ok(h.agent.session.events.some(e => e.type === 'compaction/summary'))
      assert.ok(h.adapter.requests.filter(r => r.purpose === 'compaction').length > 1)
    } finally { await h.close() }
  })
}
test('original success and unrelated errors never start segmented recovery', async () => {
  const h = await setup(false)
  try {
    await h.compact.compactNow(h.agent, new AbortController().signal)
    assert.equal(h.adapter.requests.length, 1)
    assert.equal(h.adapter.requests[0].purpose, 'compaction')
    assert.equal(await fs.stat(path.join(h.directory, 'segmented-compaction')).then(() => true, () => false), false)
  } finally { await h.close() }
  const bad = await setup(false)
  try {
    bad.adapter.activated = true
    bad.adapter.failureCode = 'INVALID_REQUEST'
    const before = [...bad.agent.session.surface.nodes]
    await assert.rejects(bad.compact.compactNow(bad.agent, new AbortController().signal))
    assert.equal(bad.adapter.requests.length, 1)
    assert.deepEqual(bad.agent.session.surface.nodes, before)
  } finally { await bad.close() }
})

test('cancellation and plugin unload settle recovery without a parent replacement', async () => {
  for (const mode of ['cancel', 'unload']) {
    const h = await setup(false)
    try {
      h.adapter.activated = true
      let entered
      const waiting = new Promise(resolve => { entered = resolve })
      const original = h.adapter.stream.bind(h.adapter)
      h.adapter.stream = async function* (options) {
        if (options.purpose === 'compaction' && JSON.stringify(options.messages).length < 12500) {
          entered()
          await new Promise((resolve, reject) => {
            if (options.signal.aborted) reject(options.signal.reason)
            else options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })
          })
        }
        yield* original(options)
      }
      const controller = new AbortController()
      const before = [...h.agent.session.surface.nodes]
      const operation = h.compact.compactNow(h.agent, controller.signal)
      const rejected = assert.rejects(operation)
      await waiting
      if (mode === 'cancel') controller.abort(new Error('test cancelled'))
      else await h.fiber.dispose()
      await rejected
      assert.deepEqual(h.agent.session.surface.nodes, before)
      assert.equal(h.agent.session.events.filter(e => e.type === 'compaction/summary').length, 0)
    } finally { await h.close() }
  }
})
test('two agents recover concurrently without sharing summaries or recursion markers', async () => {
  const h = await setup(false)
  try {
    const other = h.ctx.agentLoop.create('other-session', { provider: 'mock', model: 'm' })
    other.followup(createUserMessage({ content: [{ type: 'text', text: 'independent historical facts '.repeat(4000) }], source: { kind: 'user' } }))
    await other.whenIdle()
    h.adapter.activated = true
    await Promise.all([h.compact.compactNow(h.agent, new AbortController().signal), h.compact.compactNow(other, new AbortController().signal)])
    assert.equal(h.agent.session.events.filter(e => e.type === 'compaction/summary').length, 1)
    assert.equal(other.session.events.filter(e => e.type === 'compaction/summary').length, 1)
    const dirs = await fs.readdir(path.join(h.directory, 'segmented-compaction'))
    assert.equal(dirs.length, 2)
  } finally { await h.close() }
})
