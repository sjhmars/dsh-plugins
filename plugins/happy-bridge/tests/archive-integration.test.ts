import test from 'node:test'
import assert from 'node:assert/strict'
import { HappySessionSocket } from '../src/session-socket.ts'
import { HappyBridge } from '../src/bridge.ts'
import { encryptB64, decryptB64 } from '../src/encryption.ts'
import { sockets, setMetadataHandler } from './peer-stubs/socket.mjs'

const crypto = { variant: 'legacy', key: new Uint8Array(32).fill(7) }
const baseline = { modelMode: 'p:a', effortLevel: null, lifecycleState: 'archived' }
const tick = () => new Promise(resolve => setImmediate(resolve))

async function socketFixture(t) {
  setMetadataHandler(undefined)
  const picks = [], inbound = []
  const socket = new HappySessionSocket('happy-s1', 'test', 'http://happy.invalid', crypto, {
    onInbound: m => inbound.push(m), onPermission() {}, onCommunication() {}, onAbort() {},
    onArchived() {}, onCatalog: m => picks.push(m), log() {},
  })
  await socket.connect(1, 0, baseline)
  const wire = sockets.at(-1)
  t.after(() => { socket.dispose(); setMetadataHandler(undefined) })
  return { socket, wire, picks, inbound }
}

test('archived socket connects and reconnects without presence, but receives new messages', async t => {
  const { socket, wire, inbound } = await socketFixture(t)
  wire.receive('connect')
  socket.keepAlive(true); socket.keepAliveNow(true); socket.ensureKeepAlive()
  assert.equal(wire.sent.filter(x => x.name === 'session-alive').length, 0)
  const message = { seq: 2, content: { t: 'encrypted', c: encryptB64(crypto, { role: 'user', content: { type: 'text', text: 'hello' } }) } }
  wire.receive('update', { body: { t: 'new-message', message } })
  wire.receive('update', { body: { t: 'new-message', message } })
  assert.equal(inbound.length, 1)
  socket.startKeepAlive()
  assert.equal(wire.sent.filter(x => x.name === 'session-alive').length, 1)
  socket.stopKeepAlive(); wire.receive('connect'); socket.keepAliveNow(true)
  assert.equal(wire.sent.filter(x => x.name === 'session-alive').length, 1)
  socket.dispose(); socket.startKeepAlive()
  assert.equal(wire.sent.filter(x => x.name === 'session-alive').length, 1)
})

test('metadata echoes before and after acknowledgement never become phone selections', async t => {
  const { socket, wire, picks } = await socketFixture(t)
  await socket.updateMetadata({ ...baseline, modelMode: 'p:b' })
  const sent = wire.sent.find(x => x.name === 'update-metadata').data
  wire.receive('update', { body: { t: 'update-session', metadata: { version: 2, value: sent.metadata } } })
  wire.receive('update', { body: { t: 'update-session', metadata: { version: 1, value: encryptB64(crypto, baseline) } } })
  wire.receive('update', { body: { t: 'update-session', metadata: { version: 3, value: encryptB64(crypto, { ...baseline, modelMode: 'p:b', lifecycleState: 'running', name: 'title' }) } } })
  assert.deepEqual(picks, [])
  wire.receive('update', { body: { t: 'update-session', metadata: { version: 4, value: encryptB64(crypto, { ...baseline, modelMode: 'p:c' }) } } })
  assert.equal(picks.length, 1)
  assert.equal(picks[0].modelMode, 'p:c')
})

test('version conflict preserves the newer phone selection instead of retrying stale model fields', async t => {
  const { socket, wire, picks } = await socketFixture(t)
  setMetadataHandler((_wire, _data, callback) => callback(null, {
    result: 'version-mismatch', version: 2, metadata: encryptB64(crypto, { ...baseline, modelMode: 'p:c', futureField: true }),
  }))
  await socket.updateMetadata({ ...baseline, modelMode: 'p:b' })
  assert.equal(picks[0].modelMode, 'p:c')
  assert.equal(wire.sent.filter(x => x.name === 'update-metadata').length, 1)
  setMetadataHandler(undefined)
  await socket.updateMetadata({ ...baseline, modelMode: 'p:c' })
  const last = wire.sent.filter(x => x.name === 'update-metadata').at(-1)
  assert.equal(decryptB64(crypto, last.data.metadata).futureField, true)
})

async function fixture(t, archived = true, seq = 5) {
  setMetadataHandler(undefined)
  const writes = [], requests = [], messages = [], logs = [], listeners = new Map(), agents = new Map()
  let state = { initialized: true, workspaceIds: ['w'], archivedSessionIds: archived ? ['s1'] : [] }
  const records = [{ type: 'turn/start', seq: 0, data: {} }, { type: 'user/message', seq: 1, data: { content: [{ type: 'text', text: 'history' }] } }]
  const registry = {
    get archivedSessionIds() { return state.archivedSessionIds },
    list: () => [{ id: 'w', title: 'work', path: 'H:/workspace', sessionIds: ['s1'] }],
    async archiveSession(id) { if (!state.archivedSessionIds.includes(id)) await registry.setState({ ...state, archivedSessionIds: [...state.archivedSessionIds, id] }) },
    enqueueOperation: fn => fn(), requireState: () => state,
    async setState(next) {
      writes.push([...next.archivedSessionIds])
      for (const callback of listeners.get('domain/changed') ?? []) callback({ domain: 'workspace', table: '', value: next })
      state = next
    },
  }
  const services = {
    workspaceRegistry: registry,
    sessionQuery: { async readSession(id) { return { session: { id, cwd: 'H:/workspace' }, events: records } } },
    sessionController: { async selectModel(value) { if (services.beforeSelect) await services.beforeSelect(value); if (services.failSelection) throw Error('Host write failed'); writes.push({ ...value }) } },
    llm: {
      listProviders: () => [{ id: 'p', name: 'Provider' }],
      listModels: async () => [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
      resolveModelInfo: async (_provider, model) => { if (!['a', 'b'].includes(model)) throw Error('unknown model'); return { reasoning: { efforts: [{ id: 'high', name: 'High' }] } } },
    },
    agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'a' }) },
  }
  const ctx = {
    get: name => services[name],
    sessionQuery: services.sessionQuery,
    on(name, callback) { const list = listeners.get(name) ?? []; list.push(callback); listeners.set(name, list); return () => true },
    inject() {},
    agents: {
      get: id => agents.get(id),
      async resume({ resumeSessionId }) {
        const agent = { id: resumeSessionId, status: 'idle', ctx: { on: () => () => true },
          session: { header: { id: resumeSessionId, cwd: 'H:/workspace' }, seq: records.length, requestHeader: () => undefined },
          followup: message => messages.push({ message, selection: bridge.models.get(resumeSessionId) }), steer: message => messages.push({ message }),
        }
        agents.set(resumeSessionId, agent)
        for (const cb of listeners.get('agent/created') ?? []) await cb({ agent })
        return { agent }
      },
    },
  }
  const bridge = new HappyBridge(ctx, { enabled: true, remoteGrant: 'full', serverUrl: 'http://happy.invalid', credentialDir: '', pairOnStart: false }, m => logs.push(m))
  bridge.running = true
  bridge.credentials = { machineId: 'machine', token: 'test', encryption: { type: 'legacy', secret: crypto.key } }
  bridge.loadStored = async () => ({ cwd: 'H:/workspace', happyPath: '/dsh-workspaces/work', events: records })
  bridge.sweepHappyGhosts = async () => {}
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, options) => {
    requests.push(String(url))
    if (services.beforeFetch) await services.beforeFetch(url, options)
    if (services.failArchive && String(url).endsWith('/archive')) throw Error('relay unavailable')
    if (String(url).endsWith('/v1/sessions')) {
      const body = JSON.parse(options.body)
      return new Response(JSON.stringify({ session: { id: 'happy-' + body.tag.slice(4), seq, metadataVersion: 1, agentStateVersion: 0, metadata: encryptB64(crypto, baseline) } }))
    }
    return new Response('{}')
  }
  bridge.installHooks(); bridge.seedArchiveSet()
  await bridge.syncMirrors()
  const link = bridge.links.get('s1')
  assert.ok(link, logs.join('\n'))
  const wire = sockets.at(-1)
  const flush = async () => { for (let i = 0; i < 8; i++) { await tick(); await bridge.inboundTail.get('s1') } }
  t.after(() => { bridge.dispose(); globalThis.fetch = originalFetch; setMetadataHandler(undefined) })
  const emit = async (name, ...args) => { for (const callback of listeners.get(name) ?? []) await callback(...args) }
  return { bridge, registry, link, wire, services, writes, requests, messages, agents, flush, logs, emit }
}

test('archived startup and repeated scans retain history and never emit presence or load an Agent', async t => {
  const f = await fixture(t)
  await Promise.all([f.bridge.syncMirrors(), f.bridge.syncMirrors()])
  f.wire.receive('connect')
  assert.deepEqual(f.registry.archivedSessionIds, ['s1'])
  assert.equal(f.agents.size, 0)
  assert.equal(f.link.events.length, 2)
  assert.equal(f.wire.sent.filter(x => x.name === 'session-alive').length, 0)
})

test('phone model pick loads the original Agent and restores without a model request; next message uses that pick', async t => {
  const f = await fixture(t)
  f.bridge.queuePhoneCatalog('s1', { modelMode: 'p:b', effortLevel: 'high' })
  await f.flush()
  assert.deepEqual(f.registry.archivedSessionIds, [])
  assert.equal(f.messages.length, 0)
  assert.equal(f.bridge.models.get('s1').model, 'b')
  f.bridge.queueInbound('s1', { kind: 'text', text: 'continue', meta: {} })
  await f.flush()
  assert.equal(f.messages.length, 1)
  assert.equal(f.messages[0].selection.model, 'b')
  assert.equal(f.messages[0].selection.reasoningEffort, 'high')
})

test('self echo, empty input, denied permissions and failed selections do not restore', async t => {
  const f = await fixture(t)
  f.bridge.queueInbound('s1', { kind: 'text', text: 'history', meta: { sentFrom: 'dsh' } })
  f.bridge.queueInbound('s1', { kind: 'text', text: '  ', meta: {} })
  await f.flush()
  f.bridge.config.remoteGrant = 'watch'
  f.bridge.queuePhoneCatalog('s1', { modelMode: 'p:b' })
  f.bridge.queueInbound('s1', { kind: 'text', text: 'hello', meta: {} })
  await f.flush()
  f.bridge.config.remoteGrant = 'full'; f.services.failSelection = true
  f.bridge.queuePhoneCatalog('s1', { modelMode: 'p:b' })
  await f.flush()
  assert.deepEqual(f.registry.archivedSessionIds, ['s1'])
  assert.equal(f.messages.length, 0)
  f.services.failSelection = false
  f.bridge.queuePhoneCatalog('s1', { modelMode: 'p:b' })
  await f.flush()
  assert.deepEqual(f.registry.archivedSessionIds, [])
})

test('Host archive events read their committed payload, retry failed cloud archive, and Host restore only updates presence', async t => {
  const f = await fixture(t, false)
  f.services.failArchive = true
  await f.registry.archiveSession('s1'); await f.flush()
  assert.equal(f.link.parked, true)
  assert.notEqual(f.link.cloudState, 'archived')
  f.services.failArchive = false
  await f.bridge.syncMirrors(); await f.flush()
  assert.equal(f.link.cloudState, 'archived')
  await f.registry.setState({ initialized: true, workspaceIds: ['w'], archivedSessionIds: [] }); await f.flush()
  assert.equal(f.link.cloudState, 'running')
  assert.equal(f.agents.size, 0)
  assert.equal(f.messages.length, 0)
})

test('message arriving during mirror history setup is queued until the mirror is ready', async t => {
  const f = await fixture(t)
  let release
  f.bridge.mirroring.set('s1', new Promise(resolve => { release = resolve }))
  f.bridge.queueInbound('s1', { kind: 'text', text: 'during replay', meta: {} })
  await tick()
  assert.equal(f.messages.length, 0)
  f.bridge.mirroring.delete('s1'); release()
  await f.flush()
  assert.equal(f.messages.length, 1)
})

test('new cloud mirror replays user history while its own delayed echo leaves it archived', async t => {
  const f = await fixture(t, true, 0)
  const history = f.wire.sent.filter(x => x.name === 'message')
  const user = history.find(x => decryptB64(crypto, x.data.message)?.content?.role === 'user')
  assert.ok(user)
  f.wire.receive('update', { body: { t: 'new-message', message: { seq: 1, content: { t: 'encrypted', c: user.data.message } } } })
  await f.flush()
  assert.deepEqual(f.registry.archivedSessionIds, ['s1'])
  assert.equal(f.messages.length, 0)
})

test('phone archive finishes before an immediately following message restores the same Happy id', async t => {
  const f = await fixture(t, false)
  let release, entered
  const started = new Promise(resolve => { entered = resolve })
  const gate = new Promise(resolve => { release = resolve })
  f.services.beforeFetch = async url => { if (String(url).endsWith('/archive')) { entered(); await gate } }
  const archive = f.bridge.onPhoneArchive('happy-s1', 's1')
  await started
  f.bridge.queueInbound('s1', { kind: 'text', text: 'resume now', meta: {} })
  await tick()
  assert.equal(f.messages.length, 0)
  release(); await archive; await f.flush()
  assert.deepEqual(f.registry.archivedSessionIds, [])
  assert.equal(f.messages.length, 1)
  assert.equal(f.link.socket.happySessionId, 'happy-s1')
  assert.equal(f.link.cloudState, 'running')
  const archiveIndex = f.requests.findLastIndex(x => x.endsWith('/archive'))
  assert.ok(f.requests.slice(archiveIndex + 1).some(x => x.endsWith('/v1/sessions')))
})

test('image-only and image-plus-text input are admitted before restoring; failed image-only admission stays archived', async t => {
  const f = await fixture(t)
  f.bridge.downloadPhoneFile = async () => ({ name: 'photo.png', mimeType: 'image/png', bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]) })
  f.services.attachments = { admitEncodedImages: async images => images.map((image, i) => ({ attachmentId: 'img-' + i, mediaType: image.mediaType })) }
  const file = { kind: 'file', name: 'photo.png', ref: 'blob', meta: {} }
  f.bridge.queueInbound('s1', file)
  f.bridge.queueInbound('s1', { kind: 'text', text: '', meta: {} })
  await f.flush()
  assert.deepEqual(f.registry.archivedSessionIds, [])
  assert.equal(f.messages[0].message.content[0].type, 'image')
  await f.bridge.onPhoneArchive('happy-s1', 's1'); await f.flush()
  f.bridge.queueInbound('s1', file)
  f.bridge.queueInbound('s1', { kind: 'text', text: 'describe', meta: {} })
  await f.flush()
  assert.deepEqual(f.messages[1].message.content.map(x => x.type), ['image', 'text'])
  await f.bridge.onPhoneArchive('happy-s1', 's1'); await f.flush()
  f.services.attachments.admitEncodedImages = async () => { throw Error('bad image') }
  f.bridge.queueInbound('s1', file)
  f.bridge.queueInbound('s1', { kind: 'text', text: '', meta: {} })
  await f.flush()
  assert.deepEqual(f.registry.archivedSessionIds, ['s1'])
  assert.equal(f.messages.length, 2)
})

test('unknown model and unsupported effort do not unarchive; effort change and clearing restore without a turn', async t => {
  const f = await fixture(t)
  f.bridge.queuePhoneCatalog('s1', { modelMode: 'p:missing' })
  f.bridge.queuePhoneCatalog('s1', { modelMode: 'p:a', effortLevel: 'unsupported' })
  await f.flush()
  assert.deepEqual(f.registry.archivedSessionIds, ['s1'])
  f.bridge.queuePhoneCatalog('s1', { modelMode: 'p:a', effortLevel: 'high' })
  await f.flush()
  assert.deepEqual(f.registry.archivedSessionIds, [])
  assert.equal(f.bridge.models.get('s1').reasoningEffort, 'high')
  await f.bridge.onPhoneArchive('happy-s1', 's1'); await f.flush()
  f.bridge.queuePhoneCatalog('s1', { modelMode: 'p:a', effortLevel: null })
  await f.flush()
  assert.deepEqual(f.registry.archivedSessionIds, [])
  assert.equal(f.bridge.models.get('s1').reasoningEffort, undefined)
  const metadata = f.wire.sent.filter(x => x.name === 'update-metadata').at(-1)
  assert.equal(decryptB64(crypto, metadata.data.metadata).effortLevel, null)
  assert.equal(f.messages.length, 0)
})

test('live phone selections update Host immediately, and another session Host selection is not suppressed', async t => {
  const f = await fixture(t, false)
  await f.bridge.ensureMirror('s2')
  assert.equal(f.bridge.links.get('s2').cloudState, 'running')
  let release, entered
  const gate = new Promise(resolve => { release = resolve })
  const started = new Promise(resolve => { entered = resolve })
  f.services.beforeSelect = async request => { if (request.sessionId === 's1' && request.model === 'b') { entered(); await gate } }
  f.bridge.queuePhoneCatalog('s1', { modelMode: 'p:b' })
  await started
  f.bridge.onHostModelSelected('s2', { provider: 'p', model: 'b', reasoningEffort: 'high' })
  await f.bridge.inboundTail.get('s2')
  assert.equal(f.bridge.models.get('s2').model, 'b')
  release(); await f.flush()
  assert.equal(f.bridge.models.get('s1').model, 'b')
  assert.ok(f.writes.some(value => value.model === 'b' && value.sessionId === 's1'))
  assert.equal(f.messages.length, 0)
})

test('disposing during a pending restore cannot emit new heartbeats or submit a message', async t => {
  const f = await fixture(t)
  let release, entered
  const gate = new Promise(resolve => { release = resolve })
  const started = new Promise(resolve => { entered = resolve })
  f.services.beforeFetch = async url => { if (String(url).endsWith('/v1/sessions')) { entered(); await gate } }
  f.bridge.queueInbound('s1', { kind: 'text', text: 'continue', meta: {} })
  await started
  f.bridge.dispose(); release(); await f.flush()
  assert.equal(f.messages.length, 0)
  assert.equal(f.wire.sent.filter(x => x.name === 'session-alive').length, 0)
})

test('a delayed echo after an acknowledgement timeout is still recognized as the bridge publication', async t => {
  const { socket, wire, picks } = await socketFixture(t)
  let sent
  setMetadataHandler((_wire, data, callback) => { sent = data; callback(Error('ack timeout')) })
  await assert.rejects(socket.updateMetadata({ ...baseline, modelMode: 'p:b' }), /ack timeout/)
  wire.receive('update', { body: { t: 'update-session', metadata: { version: sent.expectedVersion + 1, value: sent.metadata } } })
  assert.deepEqual(picks, [])
})

test('a phone broadcast before the version-conflict acknowledgement cannot be overwritten by a stale retry', async t => {
  const { socket, wire, picks } = await socketFixture(t)
  setMetadataHandler((wire, _data, callback) => {
    const metadata = encryptB64(crypto, { ...baseline, modelMode: 'p:c' })
    wire.receive('update', { body: { t: 'update-session', metadata: { version: 2, value: metadata } } })
    callback(null, { result: 'version-mismatch', version: 2, metadata })
  })
  await socket.updateMetadata({ ...baseline, modelMode: 'p:b' })
  assert.equal(picks.length, 1)
  assert.equal(picks[0].modelMode, 'p:c')
  assert.equal(wire.sent.filter(x => x.name === 'update-metadata').length, 1)
})


test('public assistant stream supplies live reasoning and committed records settle it once', async t => {
  const f = await fixture(t, false)
  const { agent } = await f.bridge.ctx.agents.resume({ resumeSessionId: 's1' })
  await f.emit('agent/assistant-stream', { agent, frame: { type: 'chunk', attemptId: 'a1', revision: 0,
    index: 0, time: 2, chunk: { type: 'reasoning-delta', index: 0, text: 'live reasoning' } } })
  assert.equal(f.link.reasoning, 'live reasoning')
  assert.ok(f.link.thinkCall)
  await f.emit('session/event', agent.session, { type: 'assistant/message', seq: 2, time: 3, data: {
    message: { content: [{ type: 'reasoning', text: 'live reasoning' }, { type: 'text', text: 'done' }] },
    stream: [{ type: 'reasoning-chunks', time0: 2, index: 0, dt: [], texts: ['live reasoning'] }],
  } })
  assert.equal(f.link.reasoning, '')
  assert.equal(f.link.thinkCall, undefined)
  await f.emit('session/event', agent.session, { type: 'assistant/attempt', seq: 3, time: 4, data: {
    stream: [{ type: 'reasoning-chunks', time0: 4, index: 0, dt: [], texts: ['missed live frame'] }],
  } })
  assert.equal(f.link.reasoning, '')
  assert.equal(f.link.thinkCall, undefined)
})
