/** Notification lifecycle uses current events and detached histories without opening native UI. */
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'

const entry = new URL('../plugins/task-notify/lib/types/index.js', import.meta.url).href
const notifier = 'data:text/javascript,' + encodeURIComponent(
  'export class HostDesktopNotifier { async notify(request) { globalThis.__compatNotify.requests.push(request); return { ok: true, channel: "windows-toast", action: globalThis.__compatNotify.action }; } } export async function isDesktopWindowFocused() { return false }')
const channel = 'data:text/javascript,' + encodeURIComponent(
  'export async function ensureWindowsToastChannel() {} export function disposeWindowsToastChannel() {}')
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.startsWith(entry)) {
    if (specifier === './notifier.js') return { url: notifier, shortCircuit: true }
    if (specifier === './toast-channel.js') return { url: channel, shortCircuit: true }
  }
  return next(specifier, context)
} })
const Task = await import(entry + '?compat')
const history = [
  { type: 'session/title', data: { title: 'first' } },
  { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'older' }] } } },
  { type: 'session/title', data: { title: '当前任务' } },
  { type: 'assistant/message', data: { message: { content: [{ type: 'reasoning', text: 'hidden' }, { type: 'text', text: '最终答复' }] } } },
  { type: 'turn/end', data: { reason: { kind: 'completed' } } },
]
const settle = () => new Promise(resolve => setImmediate(resolve))

test('task-notify current Harness lifecycle', async t => {
  t.after(() => { hooks.deregister(); delete globalThis.__compatNotify })
  async function fixture(t, { read = async () => ({ events: history }), config = {}, running = false, origin } = {}) {
    const ctx = new Context()
    t.after(() => ctx.fiber.dispose())
    const agent = { id: 'compat-session', ctx, status: running ? 'running' : 'idle', session: { header: { origin } } }
    const state = { requests: [], action: 'deferred', reads: [] }
    globalThis.__compatNotify = state
    ctx.provide('agents', { list: () => [agent] })
    ctx.provide('sessionQuery', { readSession: id => { state.reads.push(id); return read(id) } })
    await ctx.plugin(Task, config)
    return { ctx, agent, state }
  }
  await t.test('idle notification keeps committed title, outcome and assistant text', async t => {
    const { ctx, agent, state } = await fixture(t)
    ctx.emit('agent/status', { agent, status: 'idle' })
    assert.equal(state.reads.length, 0)
    ctx.emit('agent/status', { agent, status: 'running' })
    ctx.emit('agent/status', { agent, status: 'idle' })
    ctx.emit('agent/status', { agent, status: 'idle' })
    await settle()
    assert.deepEqual(state.reads, [agent.id])
    assert.equal(state.requests.length, 1)
    assert.equal(state.requests[0].title, 'DeepSeek Harness · 当前任务')
    assert.equal(state.requests[0].body, '任务已完成：最终答复')
    assert.equal(state.requests[0].sessionId, agent.id)
  })
  await t.test('a task running before plugin load is still notified at idle', async t => {
    const { ctx, agent, state } = await fixture(t, { running: true })
    ctx.emit('agent/status', { agent, status: 'idle' })
    await settle()
    assert.equal(state.requests.length, 1)
  })
  await t.test('disabled and subagent notifications never read history or deliver', async t => {
    for (const options of [{ config: { enabled: false } }, { origin: 'subagent' }]) {
      const { ctx, agent, state } = await fixture(t, options)
      ctx.emit('agent/status', { agent, status: 'running' })
      ctx.emit('agent/status', { agent, status: 'idle' })
      await settle()
      assert.equal(state.reads.length, 0)
      assert.equal(state.requests.length, 0)
      await ctx.fiber.dispose()
    }
  })
  await t.test('unloading while history is pending cancels its notification', async t => {
    let release
    const pending = new Promise(resolve => { release = resolve })
    const { ctx, agent, state } = await fixture(t, { read: () => pending })
    ctx.emit('agent/status', { agent, status: 'running' })
    ctx.emit('agent/status', { agent, status: 'idle' })
    await ctx.fiber.dispose()
    release({ events: history })
    await settle()
    assert.equal(state.requests.length, 0)
  })
  await t.test('question notification delegates immediately while history is pending', async t => {
    let release
    const pending = new Promise(resolve => { release = resolve })
    const { ctx, agent, state } = await fixture(t, { read: () => pending })
    const answer = { answers: [] }
    const returned = await ctx.waterfall('user-questions/request', { agent, questions: [{ question: '下一步？', options: [] }] }, async () => answer)
    assert.equal(returned, answer)
    assert.equal(state.requests.length, 0)
    release({ events: history })
    await settle()
    assert.equal(state.requests[0].title, 'DeepSeek Harness · 当前任务')
    assert.equal(state.requests[0].body, '需要你回答：下一步？')
  })
  await t.test('standalone questions use the configured title without reading a Session', async t => {
    const { ctx, state } = await fixture(t, { config: { title: '提示' } })
    await ctx.waterfall('user-questions/request', { questions: [{ question: '看看计划', options: [], intent: { kind: 'plan-review' } }] }, async () => ({ answers: [] }))
    await settle()
    assert.equal(state.reads.length, 0)
    assert.equal(state.requests[0].title, '提示')
    assert.equal(state.requests[0].body, '需要你审阅计划：看看计划')
  })
  await t.test('approval buttons decide once; closing delegates to the existing answerer', async t => {
    const { ctx, agent, state } = await fixture(t)
    let delegated = 0
    const next = async () => { delegated++; return 'allowed-once' }
    const req = { agent, toolName: 'write', reason: '文件修改' }
    for (const action of ['allowed-once', 'rejected']) {
      state.action = action
      assert.equal(await ctx.waterfall('approval/request', req, next), action)
      assert.equal(delegated, 0)
    }
    state.action = 'deferred'
    assert.equal(await ctx.waterfall('approval/request', req, next), 'allowed-once')
    assert.equal(delegated, 1)
    assert.equal(state.requests.length, 3)
  })
})
