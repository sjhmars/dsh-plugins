import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createUserMessage, createAssistantMessage, createToolResultMessage } from '@deepseek-ai/dsh-llm'
import { defaults, validateConfig } from '../src/config.ts'
import { recover, overflow, sumUsage } from '../src/recovery.ts'
import { groupMessages, fragmentUnit, splitLength } from '../src/segments.ts'
import { isBasicCompaction } from '../src/index.ts'
const user = text => createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })
const directive = createUserMessage({ content: [{ type: 'text', text: 'Original eight-section directive' }], source: { kind: 'plugin', plugin: 'dsh-compaction-basic' } })
const options = messages => ({ provider: 'mock', model: 'm', sessionId: 'test', purpose: 'compaction',
  messages: [...messages, directive], system: 'original system', tools: [{ name: 'tool', description: 'original', parameters: {} }], maxTokens: 100 })
const rejected = [{ type: 'finish', reason: { kind: 'error', failure: { code: 'CONTEXT_WINDOW_EXCEEDED', message: 'too long' } } }]
const success = text => [
  { type: 'block-start', index: 0, blockType: 'text' },
  { type: 'block-end', index: 0, block: { type: 'text', text } },
  { type: 'usage', usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 } },
  { type: 'finish', reason: { kind: 'stop' } },
]
const estimate = request => JSON.stringify([request.system, request.tools, request.messages.map(m => m.content)]).length
function harness(overrides = {}) {
  const requests = [], records = []
  const deps = {
    contextWindow: 100000, estimate,
    record: async record => { records.push(record) },
    call: async function* (request) { requests.push(request); yield* success('checkpoint') },
    ...overrides,
  }
  return { requests, records, deps }
}
test('recognizes only the basic compaction producer and classified overflow', () => {
  const request = options([user('history')])
  assert.equal(isBasicCompaction(request), true)
  assert.equal(isBasicCompaction({ ...request, purpose: undefined }), false)
  assert.equal(isBasicCompaction({ ...request, messages: [user('same words')] }), false)
  assert.equal(overflow(rejected), true)
  assert.equal(overflow([{ type: 'finish', reason: { kind: 'error', failure: { code: 'INVALID_REQUEST', message: '400' } } }]), false)
})
test('rolls complete history units in order, retaining original directive and envelope', async () => {
  const h = harness()
  const input = options([user('A'.repeat(1000)), user('B'.repeat(1000)), user('C'.repeat(1000))])
  const output = await recover(input, rejected, defaults, { ...h.deps, contextWindow: 2500 })
  assert.equal(output.at(-1).reason.kind, 'stop')
  assert.equal(h.requests.length, 3)
  h.requests.forEach(request => {
    assert.equal(request.messages.at(-1), directive)
    assert.equal(request.system, input.system)
    assert.equal(request.tools, input.tools)
    assert.ok(estimate(request) <= 1900)
  })
  assert.ok(JSON.stringify(h.requests[1].messages).includes('<compacted-summary>'))
  assert.equal(output.filter(c => c.type === 'finish').length, 1)
  assert.equal(output.find(c => c.type === 'usage').usage.inputTokens, 30)
})
test('oversized Unicode text is covered exactly once across fragments', async () => {
  const h = harness()
  const original = '甲😀乙\n'.repeat(900)
  const result = await recover(options([user(original)]), rejected, defaults, { ...h.deps, contextWindow: 2125 })
  assert.equal(result.at(-1).reason.kind, 'stop')
  const fragments = h.requests.flatMap(r => r.messages.filter(m => m.content[0]?.text?.startsWith('Historical source fragment')))
  const joined = fragments.map(m => m.content[1].text).join('')
  assert.equal(joined, original)
  for (const fragment of fragments) assert.ok(!/[\uD800-\uDBFF]$/.test(fragment.content[1].text))
})
test('oversized tool groups become inert history with exact arguments and results', async () => {
  const call = createAssistantMessage({ source: { provider: 'mock', model: 'm' },
    content: [{ type: 'tool-call', id: 'call-1', name: 'read_file', arguments: 'argument'.repeat(800) }] })
  const result = createToolResultMessage({ callId: 'call-1', isError: false, content: [{ type: 'text', text: 'result'.repeat(800) }] })
  const units = groupMessages([call, result])
  assert.equal(units.length, 1)
  const pieces = fragmentUnit(units[0])
  assert.ok(pieces.some(p => p.source.includes('read_file')))
  const h = harness()
  const out = await recover(options([call, result]), rejected, defaults, { ...h.deps, contextWindow: 2375 })
  assert.equal(out.at(-1).reason.kind, 'stop')
  assert.ok(h.requests.every(r => r.messages.every(m => m.content.every(b => b.type !== 'tool-call' && b.type !== 'tool-result'))))
  const texts = h.requests.flatMap(r => r.messages.filter(m => m.content[0]?.text?.startsWith('Historical source fragment')).map(m => m.content[1].text))
  assert.ok(texts.join('').includes('argument'.repeat(800)))
  assert.ok(texts.join('').includes('result'.repeat(800)))
})
test('shrinks failed segments without advancing the cursor', async () => {
  const sent = []
  const h = harness({ call: async function* (r) { sent.push(r); yield* (sent.length === 1 ? rejected : success('checkpoint')) } })
  const out = await recover(options([user('abcdef'.repeat(900))]), rejected, defaults, { ...h.deps, contextWindow: 2875 })
  assert.equal(out.at(-1).reason.kind, 'stop')
  assert.ok(estimate(sent[1]) < estimate(sent[0]))
  assert.ok(sent[0].messages.some(m => m.content[1]?.text?.startsWith('abcdef')))
  assert.ok(sent[1].messages.some(m => m.content[1]?.text?.startsWith('abcdef')))
})
test('limits calls and shrink retries; other provider errors stop immediately', async () => {
  const h = harness({ call: async function* () { yield* rejected } })
  let out = await recover(options([user('x'.repeat(10000))]), rejected, { ...defaults, maxCalls: 1 }, h.deps)
  assert.match(out.at(-1).reason.failure.message, /maxCalls/)
  out = await recover(options([user('x'.repeat(10000))]), rejected, { ...defaults, maxShrinkRetries: 0 }, h.deps)
  assert.match(out.at(-1).reason.failure.message, /maxShrinkRetries/)
  const quota = [{ type: 'finish', reason: { kind: 'error', failure: { code: 'QUOTA', message: 'balance' } } }]
  out = await recover(options([user('x'.repeat(1000))]), rejected, defaults, harness({ call: async function* () { yield* quota } }).deps)
  assert.deepEqual(out, quota)
})
test('rejects truncated, empty and tool summaries and full fixed envelope', async () => {
  for (const chunks of [
    [{ type: 'finish', reason: { kind: 'max-tokens' } }],
    success(''),
    [{ type: 'finish', reason: { kind: 'tool-calls' } }],
  ]) {
    const out = await recover(options([user('x'.repeat(5000))]), rejected, defaults, harness({ call: async function* () { yield* chunks } }).deps)
    assert.equal(out.at(-1).reason.failure.code, 'SEGMENTED_COMPACTION_FAILED')
  }
  const out = await recover(options([user('history')]), rejected, defaults, { ...harness().deps, contextWindow: 127 })
  assert.match(out.at(-1).reason.failure.message, /fill the input budget/)
})
test('journal failure prevents any network call; cancellation preserves its reason', async () => {
  const h = harness({ record: async () => { throw Error('disk full') } })
  await assert.rejects(recover(options([user('x'.repeat(1000))]), rejected, defaults, h.deps), /disk full/)
  assert.equal(h.requests.length, 0)
  const c = new AbortController(); c.abort(new Error('cancelled'))
  await assert.rejects(recover({ ...options([user('x')]), signal: c.signal }, rejected, defaults, harness().deps), /cancelled/)
})
test('does not split an image or unknown block into text', async () => {
  const image = { type: 'image', attachment: { id: 'intact', payload: 'x'.repeat(10000) } }
  const h = harness()
  const out = await recover(options([createUserMessage({ content: [image], source: { kind: 'user' } })]), rejected,
    defaults, { ...h.deps, contextWindow: 1375 })
  assert.match(out.at(-1).reason.failure.message, /intact block/)
  assert.equal(h.requests.length, 0)
})
test('validates settings and optional usage totals', () => {
  assert.throws(() => validateConfig({ ...defaults, maxCalls: 1.5 }))
  assert.throws(() => validateConfig({ ...defaults, contextRatio: 0 }))
  assert.equal(splitLength('😀a', 1), 0)
  assert.deepEqual(sumUsage([{ type: 'usage', usage: { inputTokens: 2, outputTokens: 1, cacheReadTokens: 4 } },
    { type: 'usage', usage: { inputTokens: 3, outputTokens: 1, totalTokens: 4 } }]), { inputTokens: 5, outputTokens: 2, cacheReadTokens: 4 })
})

test('failed segment content is withheld from the parent stream', async () => {
  const terminal = { type: 'finish', reason: { kind: 'error', failure: { code: 'AUTH', message: 'denied' } } }
  const h = harness({ call: async function* () { yield* success('partial secret summary').slice(0, -1); yield terminal } })
  const output = await recover(options([user('history '.repeat(200))]), rejected, defaults, h.deps)
  assert.deepEqual(output.at(-1), terminal)
  assert.equal(output.some(chunk => chunk.type === 'block-start' || chunk.type === 'block-end'), false)
})

test('stops when a rejected small segment cannot fit fragment metadata', async () => {
  let calls = 0
  const h = harness({ call: async function* () { calls++; yield* rejected } })
  const result = await recover(options([user('small history')]), rejected, defaults, h.deps)
  assert.equal(calls, 1)
  assert.match(result.at(-1).reason.failure.message, /exceeds the segment budget/)
})

test('model capacity determines segment size without a fixed input ceiling', async () => {
  const input = options([user('A'.repeat(70000)), user('B'.repeat(70000))])
  for (const contextWindow of [100000, 200000]) {
    const h = harness({ contextWindow })
    const result = await recover(input, rejected, defaults, h.deps)
    assert.equal(result.at(-1).reason.kind, 'stop')
    assert.equal(h.requests.length, contextWindow === 100000 ? 2 : 1)
    assert.ok(estimate(h.requests[0]) > 65536)
    for (const request of h.requests) {
      assert.ok(estimate(request) + request.maxTokens <= Math.floor(contextWindow * defaults.contextRatio))
    }
  }
})
