/** End-to-end wiring tests for the phone question flow (no sockets, fake link). */

import assert from 'node:assert/strict'
import { test } from 'node:test'
// bridge.ts 的构造器参数属性不被 node strip-only 模式支持，改用 tsc 的逐文件产物。
import { HappyBridge } from '../lib/types/bridge.js'
import { parseCommunicationRpc } from '../src/inbound.ts'
import type { Config } from '../src/types.ts'

interface FakeLink {
  socket: Record<string, unknown>
  replaying: boolean
  pendingDownloads: unknown[]
  lastPhoneText: string
  lastPhoneAt: number
  pendingHuman: { kind: string; id: string } | undefined
  completedRequests: Map<string, unknown>
  completedCommunications: Map<string, unknown>
}

function makeBridge(questionChannel: Config['questionChannel']): { bridge: HappyBridge; link: FakeLink; pushes: unknown[] } {
  const pushes: unknown[] = []
  const link: FakeLink = {
    socket: {
      sendToolStart: () => {},
      sendToolEnd: () => {},
      sendText: () => {},
      updateState: (state: unknown) => { pushes.push(state) },
      keepAlive: () => {},
      keepAliveNow: () => {},
      ensureKeepAlive: () => {},
    },
    replaying: false,
    pendingDownloads: [],
    lastPhoneText: '',
    lastPhoneAt: 0,
    pendingHuman: undefined,
    completedRequests: new Map(),
    completedCommunications: new Map(),
  }
  const config: Config = {
    enabled: true,
    serverUrl: 'https://api.example',
    appUrl: 'https://app.example',
    credentialDir: '',
    pairOnStart: false,
    remoteGrant: 'approve',
    questionChannel,
  }
  const bridge = new HappyBridge({} as never, config, () => {})
  ;(bridge as unknown as { links: Map<string, FakeLink> }).links.set('agent-1', link)
  return { bridge, link, pushes }
}

function ask(bridge: HappyBridge, multiSelect = false): Promise<unknown> {
  const webNever = new Promise<never>(() => {})
  const service = { ask: () => webNever } as unknown as Record<string, unknown>
  return (bridge as unknown as {
    onAsk: (service: unknown, original: () => Promise<never>, request: unknown) => Promise<unknown>
  }).onAsk(service, () => webNever, {
    agent: { id: 'agent-1' },
    signal: undefined,
    questions: [{
      id: 'q1',
      question: '选一个',
      header: '测试',
      options: [{ label: '选项 A' }, { label: '选项 B' }],
      ...(multiSelect ? { multiSelect: true } : {}),
    }],
  })
}

function answerCommunication(bridge: HappyBridge, id: string, raw: unknown): void {
  ;(bridge as unknown as { onCommunication: (dshId: string, rpc: unknown) => void })
    .onCommunication('agent-1', parseCommunicationRpc(raw))
}

test('手机选项提交立即解决 harness 提问并写入完成态（communications）', async () => {
  const { bridge, link, pushes } = makeBridge('communications')
  const askPromise = ask(bridge, true)
  const pending = link.pendingHuman
  assert.ok(pending !== undefined && pending.kind === 'ask', 'onAsk 应挂起 pendingHuman')

  // 发布的表单必须带 multiSelect: true，App 才会渲染多选勾选
  const pushed = pushes.at(-1) as { communications?: Record<string, { form?: { questions?: { multiSelect?: boolean }[] } }> }
  assert.equal(pushed.communications?.[pending.id]?.form?.questions?.[0]?.multiSelect, true)

  answerCommunication(bridge, pending.id, {
    id: pending.id,
    kind: 'form',
    status: 'answered',
    answers: { q1: { options: ['选项 A', '选项 B'] } },
  })

  const answer = await askPromise as { answers: { id: string; selected: string[] }[] }
  assert.deepEqual(answer.answers, [{ id: 'q1', selected: ['选项 A', '选项 B'] }])
  assert.equal(link.pendingHuman, undefined, '应答后 pendingHuman 必须清掉')
  assert.equal(link.completedCommunications.size, 1, '完成态应写入')
  const last = pushes.at(-1) as { communications?: unknown; completedCommunications?: Record<string, { status: string; answers?: unknown }> }
  assert.deepEqual(last.communications, {}, '挂起表单应清空')
  assert.equal(last.completedCommunications?.[pending.id]?.status, 'answered')
  assert.deepEqual(last.completedCommunications?.[pending.id]?.answers, { q1: { options: ['选项 A', '选项 B'] } })
})

test('App 取消（发消息顺带 dismiss）不清 pendingHuman，输入框文本随后作答', async () => {
  const { bridge, link } = makeBridge('communications')
  const askPromise = ask(bridge)
  const pending = link.pendingHuman
  assert.ok(pending !== undefined)

  answerCommunication(bridge, pending.id, { id: pending.id, kind: 'form', status: 'cancelled' })
  assert.notEqual(link.pendingHuman, undefined, '取消不应结束提问')
  let settled = false
  askPromise.then(() => { settled = true }, () => { settled = true })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(settled, false, '取消后提问仍在等待')

  // 输入框文本到达：走 onInbound 的 pending-ask 分支
  const typed = bridge as unknown as { onInbound: (this: unknown, dshId: string, message: unknown) => Promise<void> }
  await typed.onInbound.call(bridge, 'agent-1', { kind: 'text', text: '我自己的想法', meta: {} })
  const answer = await askPromise as { answers: { id: string; selected: string[]; custom?: string }[] }
  assert.deepEqual(answer.answers, [{ id: 'q1', selected: [], custom: '我自己的想法' }])
  assert.equal(link.pendingHuman, undefined)
})

test('过期卡片的 RPC（id 不匹配）被忽略，不影响挂起中的提问', async () => {
  const { bridge, link } = makeBridge('communications')
  const askPromise = ask(bridge)
  const pending = link.pendingHuman
  assert.ok(pending !== undefined)

  answerCommunication(bridge, 'ask-stale-from-old-card', {
    id: 'ask-stale-from-old-card',
    kind: 'form',
    status: 'answered',
    answers: { q1: { options: ['选项 A'] } },
  })
  let settled = false
  askPromise.then(() => { settled = true }, () => { settled = true })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(settled, false, '过期 id 不应解决提问')
  assert.notEqual(link.pendingHuman, undefined)

  // 真正的卡片 id 到达后仍可正常作答
  answerCommunication(bridge, pending.id, {
    id: pending.id,
    kind: 'form',
    status: 'answered',
    answers: { q1: { options: ['选项 B'] } },
  })
  const answer = await askPromise as { answers: { id: string; selected: string[] }[] }
  assert.deepEqual(answer.answers, [{ id: 'q1', selected: ['选项 B'] }])
})

test('网页自定义回答把同一份答案写回手机表单，不标成 cancelled', async () => {
  const { bridge, link, pushes } = makeBridge('communications')
  const webAnswer = { answers: [{ id: 'q1', selected: [] as string[], custom: '我自己的想法' }] }
  const service = { ask: () => Promise.resolve(webAnswer) } as unknown as Record<string, unknown>
  const askPromise = (bridge as unknown as {
    onAsk: (service: unknown, original: () => Promise<typeof webAnswer>, request: unknown) => Promise<unknown>
  }).onAsk(service, () => Promise.resolve(webAnswer), {
    agent: { id: 'agent-1' },
    signal: undefined,
    questions: [{
      id: 'q1',
      question: '选一个',
      header: '测试',
      options: [{ label: '选项 A' }, { label: '选项 B' }],
    }],
  })
  const pending = link.pendingHuman
  assert.ok(pending !== undefined && pending.kind === 'ask')
  const answer = await askPromise as { answers: { id: string; selected: string[]; custom?: string }[] }
  assert.deepEqual(answer.answers, [{ id: 'q1', selected: [], custom: '我自己的想法' }])
  assert.equal(link.pendingHuman, undefined)
  const last = pushes.at(-1) as {
    communications?: unknown
    completedCommunications?: Record<string, { status: string; answers?: unknown }>
  }
  assert.deepEqual(last.communications, {})
  assert.equal(last.completedCommunications?.[pending.id]?.status, 'answered')
  assert.deepEqual(last.completedCommunications?.[pending.id]?.answers, {
    q1: { options: [], custom: '我自己的想法' },
  })
})
