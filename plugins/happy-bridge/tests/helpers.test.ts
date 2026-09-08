import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sniffImageMime, splitPendingFiles } from '../src/attachments.ts'
import { inboxReadPrompt, saveInboxFiles, sanitizeInboxName, uniqueInboxName } from '../src/inbox.ts'
import { decryptJson, encryptJson, encryptBlob, decryptBlob, deriveBlobKey, type CryptoContext } from '../src/encryption.ts'
import { downloadEncryptedAttachment, uploadEncryptedAttachment } from '../src/http.ts'
import {
  CUSTOM_ANSWER_LABEL, classifyInboundText, parseSlashLine, answersFromHappy, answersFromCommunication,
  communicationAnswersFromWeb, customAnswersFromText, mergeCustomAnswers, planReviewDeclineLabel,
  parsePermissionRpc, parseCommunicationRpc, parseHappyInbound,
} from '../src/inbound.ts'
import { agentStateSnapshot, COMPLETED_CAP, rememberCompleted } from '../src/agent-state.ts'
import type { HappyRequestEntry } from '../src/types.ts'
import { catalogModelPick, classifyPermissionMode, grantAtLeast, isPublishedModelEcho, messageEffort, messageModelCode, sameCatalogPick, sameHappyRuntime, sameModelOverride, splitModelCode } from '../src/grant.ts'
import { historyItems, isBlankSession, pinWakeEffort, resolveSessionPreset, sessionLabel, toolTitle, thinkLabel, happyTool, THINK_TOOL_NAME, unarchivedSessionIds, visibleUserImages, wakeModelSelection, mirrorTargets } from '../src/history.ts'
import { HAPPY_CLIENT, HAPPY_CLI_VERSION } from '../src/happy-version.ts'
import { listVirtualDirectory, matchVirtualWorkspace, resolveSpawnDirectory, VIRTUAL_HOME, virtualWorkspaces } from '../src/paths.ts'
import { resolvePublishedSelection, type HappyModelRow } from '../src/catalogs.ts'

test('legacy 加解密能还原 JSON', () => {
  const ctx: CryptoContext = { variant: 'legacy', key: new Uint8Array(32).fill(7) }
  const plain = { hello: '世界', n: 1 }
  const back = decryptJson(ctx, encryptJson(ctx, plain))
  assert.deepEqual(back, plain)
})

test('dataKey 加解密能还原 JSON', () => {
  const ctx: CryptoContext = { variant: 'dataKey', key: new Uint8Array(32).fill(9) }
  const plain = { role: 'session', ok: true }
  const back = decryptJson(ctx, encryptJson(ctx, plain))
  assert.deepEqual(back, plain)
})

test('已注册斜杠走命令，未知 /name 走聊天（skill）', () => {
  const names = new Set(['permission', 'plan', 'remote'])
  assert.equal(classifyInboundText('/permission workspace-write', names), 'command')
  assert.equal(classifyInboundText('/my-skill', names), 'chat')
  assert.equal(classifyInboundText('hello', names), 'chat')
  assert.deepEqual(parseSlashLine('/plan 做完再停'), { name: 'plan', rawInput: ' 做完再停' })
})

test('远程档 watch 不能聊，approve 能批，full 才能改危险预设', () => {
  assert.equal(grantAtLeast('watch', 'chat'), false)
  assert.equal(grantAtLeast('approve', 'approve'), true)
  assert.equal(grantAtLeast('approve', 'full'), false)
  assert.equal(grantAtLeast('full', 'full'), true)
})

test('Claude permissionMode 忽略，dsh 预设才应用', () => {
  const presets = ['workspace-write', 'danger-full-access']
  assert.deepEqual(classifyPermissionMode('acceptEdits', presets), { kind: 'ignore' })
  assert.deepEqual(classifyPermissionMode('workspace-write', presets), { kind: 'apply', preset: 'workspace-write' })
  assert.deepEqual(classifyPermissionMode('mystery', presets), { kind: 'unknown' })
})

test('模型 code 按第一个斜杠或冒号拆', () => {
  assert.deepEqual(splitModelCode('deepseek-official/deepseek-v4-flash'), {
    provider: 'deepseek-official',
    model: 'deepseek-v4-flash',
  })
  assert.deepEqual(splitModelCode('deepseek-official:deepseek-v4-flash'), {
    provider: 'deepseek-official',
    model: 'deepseek-v4-flash',
  })
  assert.deepEqual(splitModelCode('bare'), { provider: '', model: 'bare' })
})

test('改远程档不重启继电器，改地址才重启', () => {
  const base = {
    enabled: true,
    serverUrl: 'https://api.example',
    appUrl: 'https://app.example',
    credentialDir: '',
    pairOnStart: true,
    remoteGrant: 'approve' as const,
  }
  assert.equal(sameHappyRuntime(base, { ...base, remoteGrant: 'full', pairOnStart: false }), true)
  assert.equal(sameHappyRuntime(base, { ...base, serverUrl: 'https://other' }), false)
  assert.equal(sameHappyRuntime(base, { ...base, enabled: false }), false)
})

test('同一模型覆盖不再次同步', () => {
  const pick = { provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: 'high' }
  assert.equal(sameModelOverride(pick, pick), true)
  assert.equal(sameModelOverride(undefined, pick), false)
  assert.equal(sameModelOverride(pick, { ...pick, model: 'other' }), false)
})

test('自己发出去的模型选择回声不当成手机点了一次', () => {
  const published = { model: 'deepseek-official:flash', effort: 'high' }
  assert.equal(sameCatalogPick(published, { model: 'deepseek-official/flash', effort: 'high' }), true)
  assert.equal(sameCatalogPick(published, { model: 'deepseek-official:other', effort: 'high' }), false)
  assert.equal(sameCatalogPick(undefined, published), false)
})

test('发消息只带回模型 id 时仍认成自己发布的回声', () => {
  const published = { model: 'deepseek-official:deepseek-v4-flash', effort: 'high' }
  assert.equal(isPublishedModelEcho(published, 'deepseek-official:deepseek-v4-flash'), true)
  assert.equal(isPublishedModelEcho(published, 'deepseek-official/deepseek-v4-flash'), true)
  assert.equal(isPublishedModelEcho(published, 'deepseek-v4-flash'), true)
  assert.equal(isPublishedModelEcho(published, 'deepseek-v4-pro'), false)
  assert.equal(isPublishedModelEcho(undefined, 'deepseek-v4-flash'), false)
})

test('目录里没有当前模型时不回退成第一项 DeepSeek V4', () => {
  const official: HappyModelRow = {
    code: 'deepseek-official/deepseek-v4-flash',
    value: 'DeepSeek-V4-Flash',
    id: 'deepseek-v4-flash',
    name: 'DeepSeek-V4-Flash',
    providerId: 'deepseek-official',
    providerKind: 'custom',
    providerName: 'DeepSeek',
    thinkingLevels: [],
    effortOptions: [],
  }
  const missing = resolvePublishedSelection([official], { provider: 'pi-ai', model: 'my-short' })
  assert.equal(missing?.row.providerId, 'pi-ai')
  assert.equal(missing?.row.id, 'my-short')
  const listed = resolvePublishedSelection([official], {
    provider: 'deepseek-official',
    model: 'deepseek-v4-flash',
    reasoningEffort: 'high',
  })
  assert.equal(listed?.row.id, 'deepseek-v4-flash')
  assert.equal(listed?.effort, 'high')
  const fallback = resolvePublishedSelection([official], undefined)
  assert.equal(fallback?.row.id, 'deepseek-v4-flash')
})

test('Happy 元数据里的当前模型和思考强度', () => {
  assert.deepEqual(catalogModelPick({ currentModelCode: 'deepseek-official/a' }), {
    model: 'deepseek-official/a',
  })
  assert.deepEqual(catalogModelPick({
    currentModelCode: 'flash',
    currentModelProviderId: 'deepseek-official',
    effortLevel: 'high',
  }), {
    model: 'deepseek-official/flash',
    effort: 'high',
  })
  assert.deepEqual(catalogModelPick({
    modelMode: 'deepseek-official:flash',
    effortLevel: 'max',
  }), {
    model: 'deepseek-official:flash',
    effort: 'max',
  })
  assert.deepEqual(catalogModelPick({ currentModelCode: 'p/m', currentThoughtLevelCode: 'high' }), {
    model: 'p/m',
    effort: 'high',
  })
  assert.deepEqual(catalogModelPick({ currentModelCode: 'p/m', currentThoughtLevelCode: null }), {
    model: 'p/m',
    effort: null,
  })
  assert.deepEqual(catalogModelPick({ effortLevel: 'low' }), { effort: 'low' })
  assert.equal(catalogModelPick({}), undefined)
})

test('发消息 meta 带上提供方 id 时拼成完整模型', () => {
  assert.equal(messageModelCode({ model: 'flash', modelProviderId: 'deepseek-official' }), 'deepseek-official/flash')
  assert.equal(messageModelCode({ model: 'deepseek-official/flash' }), 'deepseek-official/flash')
  assert.equal(messageModelCode({ model: '' }), undefined)
  assert.equal(messageModelCode({}), undefined)
})

test('发消息 meta 同时认 effort 和旧字段 effortLevel', () => {
  assert.equal(messageEffort({ effort: 'high' }), 'high')
  assert.equal(messageEffort({ effortLevel: 'max' }), 'max')
  assert.equal(messageEffort({ effort: 'low', effortLevel: 'max' }), 'low')
  assert.equal(messageEffort({ effort: null }), null)
  assert.equal(messageEffort({}), undefined)
})

test('spawn 只接受已登记工作区（虚拟路径或真实路径），不 mkdir', () => {
  const mapped = virtualWorkspaces([
    { id: 'w1', path: 'H:\\proj\\alpha', title: 'alpha' },
    { id: 'w2', path: 'H:\\proj\\beta', title: 'beta' },
  ])
  assert.equal(resolveSpawnDirectory(`${VIRTUAL_HOME}/alpha`, mapped), 'H:\\proj\\alpha')
  assert.equal(resolveSpawnDirectory('H:\\proj\\beta', mapped), 'H:\\proj\\beta')
  assert.equal(resolveSpawnDirectory('H:\\not-registered', mapped), undefined)
  const listed = listVirtualDirectory(VIRTUAL_HOME, mapped)
  assert.equal(listed.success, true)
  if (listed.success) assert.deepEqual(listed.entries.map(entry => entry.name).sort(), ['alpha', 'beta'])
  const denied = listVirtualDirectory('H:\\proj\\alpha\\src', mapped)
  assert.equal(denied.success, false)
  assert.equal(matchVirtualWorkspace('H:\\proj\\alpha\\src', mapped)?.virtualPath, `${VIRTUAL_HOME}/alpha`)
  assert.equal(matchVirtualWorkspace('H:\\proj\\beta', mapped)?.title, 'beta')
  assert.equal(matchVirtualWorkspace('H:\\not-registered', mapped), undefined)
})

test('AskUserQuestion answers 按问题原文拆回 selected', () => {
  const mapped = answersFromHappy(
    { '选颜色': '红, 蓝' },
    [{ id: 'q1', question: '选颜色' }, { id: 'q2', question: '选尺寸' }],
  )
  assert.deepEqual(mapped, [
    { id: 'q1', selected: ['红', '蓝'] },
    { id: 'q2', selected: [] },
  ])
})

test('提问等待时输入框填到每一道还没选的题', () => {
  assert.deepEqual(customAnswersFromText([{ id: 'q1' }, { id: 'q2' }], '都要'), [
    { id: 'q1', selected: [], custom: '都要' },
    { id: 'q2', selected: [], custom: '都要' },
  ])
})

test('计划审阅拒绝项用非批准选项名', () => {
  assert.equal(planReviewDeclineLabel({
    intent: { kind: 'plan-review', approve: 'Approve' },
    options: [{ label: 'Approve' }, { label: 'Keep planning' }],
  }), 'Keep planning')
  assert.equal(planReviewDeclineLabel({ intent: { kind: 'plan-review', approve: '同意' } }), 'Keep planning')
})

test('Happy permission RPC 读出始终允许', () => {
  const rpc = parsePermissionRpc({
    id: 'call-1',
    approved: true,
    decision: 'approved_for_session',
    updatedInput: { answers: { '选颜色': '红' } },
  })
  assert.equal(rpc.id, 'call-1')
  assert.equal(rpc.approved, true)
  assert.equal(rpc.decision, 'approved_for_session')
  assert.deepEqual(rpc.updatedInput?.answers, { '选颜色': '红' })
})

test('Happy communication RPC 解析出每题选项与自定义答案', () => {
  const rpc = parseCommunicationRpc({
    id: 'ask-1',
    kind: 'form',
    status: 'answered',
    answers: {
      q1: { options: ['方案 A'] },
      q2: { options: [], custom: '都要' },
      q3: { options: ['红', 42, null], custom: '' },
      bad: 'x',
    },
  })
  assert.equal(rpc.id, 'ask-1')
  assert.equal(rpc.kind, 'form')
  assert.equal(rpc.status, 'answered')
  assert.deepEqual(rpc.answers?.q1, { options: ['方案 A'] })
  assert.deepEqual(rpc.answers?.q2, { options: [], custom: '都要' })
  assert.deepEqual(rpc.answers?.q3, { options: ['红'] })
  assert.equal(rpc.answers?.bad, undefined)

  const cancel = parseCommunicationRpc({ id: 'ask-2', kind: 'form', status: 'cancelled' })
  assert.equal(cancel.status, 'cancelled')
  assert.equal(cancel.answers, undefined)
  assert.equal(parseCommunicationRpc({ id: 'ask-3', status: 'weird' }).status, 'cancelled')
})

test('communication 答案按题目 id 映回 selected 和 custom', () => {
  assert.deepEqual(answersFromCommunication(
    { q1: { options: ['A', 'B'] }, q2: { options: [], custom: '自己写' } },
    [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }],
  ), [
    { id: 'q1', selected: ['A', 'B'] },
    { id: 'q2', selected: [], custom: '自己写' },
    { id: 'q3', selected: [] },
  ])
  assert.deepEqual(answersFromCommunication(undefined, [{ id: 'q1' }]), [{ id: 'q1', selected: [] }])
})

test('网页作答映回手机表单的 options 和 custom', () => {
  assert.deepEqual(communicationAnswersFromWeb([
    { id: 'q1', selected: ['A'] },
    { id: 'q2', selected: [], custom: '自己写' },
    { id: 'q3', selected: ['B'], custom: '' },
  ]), {
    q1: { options: ['A'] },
    q2: { options: [], custom: '自己写' },
    q3: { options: ['B'] },
  })
})

test('点「自定义」后用输入框文本合并，其他题保留选择', () => {
  assert.equal(CUSTOM_ANSWER_LABEL, '✏️ 自定义…')
  const questions = [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }]
  assert.deepEqual(mergeCustomAnswers(questions, '就要这样', {
    q1: [CUSTOM_ANSWER_LABEL],
    q2: ['方案 B'],
  }), [
    { id: 'q1', selected: [], custom: '就要这样' },
    { id: 'q2', selected: ['方案 B'] },
    { id: 'q3', selected: [], custom: '就要这样' },
  ])
  assert.deepEqual(mergeCustomAnswers(questions, '都要', {
    q1: [CUSTOM_ANSWER_LABEL, '顺手也选 A'],
  }), [
    { id: 'q1', selected: ['顺手也选 A'], custom: '都要' },
    { id: 'q2', selected: [], custom: '都要' },
    { id: 'q3', selected: [], custom: '都要' },
  ])
  assert.deepEqual(mergeCustomAnswers([{ id: 'q1' }], '都要', undefined), [
    { id: 'q1', selected: [], custom: '都要' },
  ])
})

test('completedRequests 条目带全 tool/arguments，App schema 才不会整份丢弃', () => {
  const request: HappyRequestEntry = { tool: 'exit_plan_mode', arguments: { plan: '先把绑定改了' }, createdAt: 1 }
  const snapshot = agentStateSnapshot({
    controlledByUser: true,
    pendingId: 'plan-x',
    pendingRequest: request,
    completedRequests: new Map([
      ['plan-old', { ...request, completedAt: 2, status: 'denied' }],
    ]),
  })
  assert.deepEqual(snapshot.requests['plan-x'], request)
  assert.deepEqual(snapshot.communications, {})
  const completed = snapshot.completedRequests['plan-old']
  assert.equal(completed.tool, 'exit_plan_mode')
  assert.deepEqual(completed.arguments, { plan: '先把绑定改了' })
  assert.equal(completed.status, 'denied')
  assert.ok('completedAt' in completed)
  assert.ok('createdAt' in completed)
})

test('挂起的提问走 communications 通道并开放自由输入', () => {
  const snapshot = agentStateSnapshot({
    controlledByUser: true,
    pendingId: 'ask-1',
    pendingCommunication: {
      kind: 'form',
      createdAt: 5,
      toolUseId: 'ask-1',
      title: '需要你回答',
      form: {
        questions: [{
          id: 'q1',
          header: '选择',
          question: '选哪个',
          options: [{ label: 'A' }],
          multiSelect: false,
          allowCustom: true,
          required: true,
        }],
      },
    },
  })
  assert.deepEqual(snapshot.requests, {})
  const communication = snapshot.communications['ask-1']
  assert.equal(communication.kind, 'form')
  assert.equal(communication.toolUseId, 'ask-1')
  assert.equal(communication.form.questions[0]?.allowCustom, true)
  const completed = agentStateSnapshot({
    controlledByUser: true,
    completedCommunications: new Map([
      ['ask-1', {
        kind: 'form', createdAt: 5, toolUseId: 'ask-1', title: '需要你回答',
        form: { questions: [] }, completedAt: 6, status: 'answered',
        answers: { q1: { options: [], custom: '都要' } },
      }],
    ]),
  })
  assert.equal(completed.completedCommunications['ask-1']?.answers?.q1?.custom, '都要')
})

test('完成态按 FIFO 上限累积，重新作答移到最新', () => {
  const map = new Map<string, string>()
  for (let i = 0; i < COMPLETED_CAP + 5; i++) rememberCompleted(map, `id-${i}`, `v-${i}`)
  assert.equal(map.size, COMPLETED_CAP)
  assert.equal(map.has('id-0'), false)
  assert.equal(map.get(`id-${COMPLETED_CAP + 4}`), `v-${COMPLETED_CAP + 4}`)
  rememberCompleted(map, 'id-3', 'v-3-new')
  assert.equal(map.get('id-3'), 'v-3-new')
  assert.equal(map.has('id-5'), false)
})

test('会话标签优先用 logged title，否则第一条真人提问，空会话跟网页一样叫新会话', () => {
  assert.equal(sessionLabel([
    { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: '帮我改按钮' }] } },
    { type: 'session/title', data: { title: '改侧栏按钮' } },
  ]), '改侧栏按钮')
  assert.equal(sessionLabel([
    { type: 'user/message', data: { source: { kind: 'plugin' }, content: [{ type: 'text', text: '注入' }] } },
    { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: '第一行\n第二行' }] } },
  ]), '第一行')
  assert.equal(sessionLabel([]), '新会话')
})

test('没开始过回合的是网页会藏起来的空白占位', () => {
  assert.equal(isBlankSession([]), true)
  assert.equal(isBlankSession([
    { type: 'session/title', data: { title: '新会话' } },
    { type: 'agent-preset/selected', data: { agentPreset: 'standard' } },
  ]), true)
  assert.equal(isBlankSession([{ type: 'turn/start', data: {} }]), false)
})

test('历史回放保留真人问答和工具对，跳过插件注入和助手分片', () => {
  const items = historyItems([
    { type: 'turn/start', time: 1, data: {} },
    { type: 'user/message', time: 2, data: { source: { kind: 'plugin' }, content: [{ type: 'text', text: '注入' }] } },
    { type: 'user/message', time: 3, data: { source: { kind: 'user' }, content: [{ type: 'text', text: '你好' }] } },
    { type: 'assistant/chunk', time: 4, data: { chunk: { type: 'text-delta', text: 'hi' } } },
    {
      type: 'assistant/message',
      time: 5,
      data: {
        message: {
          content: [
            { type: 'reasoning', text: '先读文件' },
            { type: 'text', text: '你好呀' },
            { type: 'tool-call', id: 'c1', name: 'read', arguments: '{"path":"a.ts"}' },
          ],
        },
      },
    },
    { type: 'tool/call', time: 6, data: { callId: 'c1', name: 'read', arguments: '{"path":"a.ts"}' } },
    { type: 'tool/result', time: 7, data: { message: { source: { callId: 'c1' } } } },
    { type: 'turn/end', time: 8, data: { reason: { kind: 'completed' } } },
  ])
  assert.deepEqual(items, [
    { kind: 'turn-start', time: 1 },
    { kind: 'user', time: 3, text: '你好', images: [] },
    {
      kind: 'tool-start',
      time: 5,
      call: 'think-5-2',
      name: THINK_TOOL_NAME,
      title: 'Think',
      description: 'Think · 先读文件',
      args: { text: '先读文件' },
    },
    { kind: 'tool-end', time: 5, call: 'think-5-2' },
    { kind: 'assistant', time: 5, text: '你好呀' },
    {
      kind: 'tool-start',
      time: 5,
      call: 'c1',
      name: 'Read',
      title: 'Read',
      description: 'Read · a.ts',
      args: { path: 'a.ts', file_path: 'a.ts' },
    },
    { kind: 'tool-end', time: 7, call: 'c1' },
    { kind: 'turn-end', time: 8, status: 'completed' },
  ])
})

test('思考卡片不用 Happy 会藏掉的 think / mcp 名字', () => {
  assert.equal(THINK_TOOL_NAME, 'Note')
  assert.equal(THINK_TOOL_NAME.startsWith('mcp__'), false)
})

test('Think 是一行摘要，工具描述跟网页一样', () => {
  assert.equal(thinkLabel('绑定可以改成 0.0.0.0'), 'Think · 绑定可以改成 0.0.0.0')
  assert.equal(thinkLabel('第一行\n第二行'), 'Think · 第一行')
  assert.equal(toolTitle('grep', { pattern: 'localhost|host:' }), 'Grep · localhost|host:')
  assert.deepEqual(happyTool('grep', { pattern: 'localhost|host:' }), {
    name: 'Grep',
    title: 'Grep',
    description: 'Grep · localhost|host:',
    args: { pattern: 'localhost|host:' },
  })
  assert.deepEqual(happyTool('bash', { command: 'ls -la', description: '列出文件' }), {
    name: 'Bash',
    title: 'Bash',
    description: 'Bash · 列出文件',
    args: { command: 'ls -la', description: '列出文件' },
  })
  assert.deepEqual(happyTool('read', { path: 'src/a.ts' }), {
    name: 'Read',
    title: 'Read',
    description: 'Read · src/a.ts',
    args: { path: 'src/a.ts', file_path: 'src/a.ts' },
  })
})

test('思考只在分片里时，回放仍补 Think 卡片', () => {
  const items = historyItems([
    { type: 'assistant/chunk', time: 1, data: { chunk: { type: 'reasoning-delta', text: '先看配置' } } },
    { type: 'assistant/chunk', time: 2, data: { chunk: { type: 'block-end', block: { type: 'reasoning', text: '先看配置' } } } },
    { type: 'assistant/message', time: 3, data: { message: { content: [{ type: 'text', text: '可以改绑定' }] } } },
  ])
  assert.deepEqual(items, [
    {
      kind: 'tool-start',
      time: 3,
      call: 'think-3-0',
      name: THINK_TOOL_NAME,
      title: 'Think',
      description: 'Think · 先看配置',
      args: { text: '先看配置' },
    },
    { kind: 'tool-end', time: 3, call: 'think-3-0' },
    { kind: 'assistant', time: 3, text: '可以改绑定' },
  ])
})

test('未归档的侧栏会话都要心跳，归档的排除', () => {
  assert.deepEqual(unarchivedSessionIds([
    { sessionIds: ['a', 'b', 'c'] },
    { sessionIds: ['c', 'd'] },
  ], ['b', 'x']), ['a', 'c', 'd'])
})

test('手机删掉或归档的会话不再镜像', () => {
  assert.deepEqual(mirrorTargets(['a', 'b', 'c'], new Set(['b', 'x'])), ['a', 'c'])
})

test('会话预设以后来的 selected 为准，否则用创建头', () => {
  assert.equal(resolveSessionPreset([
    { type: 'agent-preset/selected', data: { agentPreset: 'minimal' } },
    { type: 'user/message', data: {} },
    { type: 'agent-preset/selected', data: { agentPreset: 'coding' } },
  ], 'standard'), 'coding')
  assert.equal(resolveSessionPreset([], 'standard'), 'standard')
  assert.equal(resolveSessionPreset([], undefined), undefined)
})

test('手机唤醒用会话上次的模型，没有记录才用网页默认', () => {
  assert.deepEqual(
    wakeModelSelection(
      { provider: 'deepseek-official', model: 'deepseek-chat', reasoningEffort: 'high' },
      { provider: 'other', model: 'other' },
    ),
    { provider: 'deepseek-official', model: 'deepseek-chat', reasoningEffort: 'high' },
  )
  assert.deepEqual(
    wakeModelSelection({ provider: '', model: '' }, { provider: 'deepseek-official', model: 'deepseek-chat' }),
    { provider: 'deepseek-official', model: 'deepseek-chat' },
  )
  assert.equal(wakeModelSelection(undefined, undefined), undefined)
})

test('手机唤醒时日志没写思考强度、网页默认又是同一模型，就沿用网页思考强度', () => {
  assert.deepEqual(
    wakeModelSelection(
      { provider: 'deepseek-official', model: 'deepseek-chat' },
      { provider: 'deepseek-official', model: 'deepseek-chat', reasoningEffort: 'high' },
    ),
    { provider: 'deepseek-official', model: 'deepseek-chat', reasoningEffort: 'high' },
  )
  assert.deepEqual(
    wakeModelSelection(
      { provider: 'acme', model: 'other' },
      { provider: 'deepseek-official', model: 'deepseek-chat', reasoningEffort: 'high' },
    ),
    { provider: 'acme', model: 'other' },
  )
  assert.deepEqual(
    wakeModelSelection(
      { provider: 'deepseek-official', model: 'deepseek-chat' },
      { provider: 'acme', model: 'other', reasoningEffort: 'max' },
      { provider: 'deepseek-official', model: 'deepseek-chat', reasoningEffort: 'high' },
    ),
    { provider: 'deepseek-official', model: 'deepseek-chat', reasoningEffort: 'high' },
  )
  assert.deepEqual(
    wakeModelSelection(
      { provider: 'deepseek-official', model: 'deepseek-chat' },
      { provider: 'deepseek-official', model: 'deepseek-chat', reasoningEffort: 'low' },
      { provider: 'deepseek-official', model: 'deepseek-chat', reasoningEffort: 'high' },
    ),
    { provider: 'deepseek-official', model: 'deepseek-chat', reasoningEffort: 'low' },
  )
})

test('网页首条或手机新建/唤醒时把思考强度写成模型认的明确档', () => {
  const deepseek = ['off', 'low', 'high', 'max']
  assert.equal(pinWakeEffort(undefined, 'high', 'off', deepseek), 'high')
  assert.equal(pinWakeEffort(undefined, 'medium', 'high', deepseek), 'high')
  assert.equal(pinWakeEffort(undefined, undefined, 'off', deepseek), 'off')
  assert.equal(pinWakeEffort('low', 'high', 'max', deepseek), 'low')
  assert.equal(pinWakeEffort(undefined, undefined, undefined, deepseek), 'low')
  assert.equal(pinWakeEffort(undefined, undefined, undefined, undefined), undefined)
})

test('上报给 Happy App 的是官网 CLI semver，不是插件包名', () => {
  assert.match(HAPPY_CLI_VERSION, /^\d+\.\d+\.\d+$/u)
  assert.equal(HAPPY_CLIENT, `cli-coding-session/${HAPPY_CLI_VERSION}`)
})

test('附件 blob 加解密能还原字节，密钥按 Happy Blobs 树派生', async () => {
  const ctx: CryptoContext = { variant: 'legacy', key: new Uint8Array(32).fill(3) }
  const key = await deriveBlobKey(ctx)
  assert.equal(key.length, 32)
  const png = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3)
  const back = decryptBlob(encryptBlob(png, key), key)
  assert.ok(back !== null)
  assert.deepEqual(back, png)
  const other = await deriveBlobKey({ variant: 'dataKey', key: ctx.key })
  assert.notDeepEqual(other, key)
})

test('按文件头识别 png/jpeg，其它文件留给磁盘收件箱', () => {
  const png = {
    name: 'shot.heic',
    mimeType: 'image/heic',
    bytes: Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
  }
  const pdf = {
    name: 'notes.pdf',
    mimeType: 'application/pdf',
    bytes: Uint8Array.of(0x25, 0x50, 0x44, 0x46),
  }
  assert.equal(sniffImageMime(png), 'image/png')
  assert.equal(sniffImageMime(pdf), undefined)
  const split = splitPendingFiles([png, pdf])
  assert.equal(split.encoded.length, 1)
  assert.equal(split.encoded[0]?.mediaType, 'image/png')
  assert.equal(split.extras.length, 1)
  assert.equal(split.extras[0]?.name, 'notes.pdf')
})

test('收件箱文件名去掉路径，重名加后缀，正文让模型走 read', () => {
  assert.equal(sanitizeInboxName('..\\..\\secret.java'), 'secret.java')
  assert.equal(sanitizeInboxName(''), 'file')
  assert.equal(uniqueInboxName(new Set(), 'Main.java'), 'Main.java')
  assert.equal(uniqueInboxName(new Set(['Main.java']), 'Main.java'), 'Main-1.java')
  assert.equal(
    inboxReadPrompt('看看这个', ['happy-inbox/Main.java']),
    '看看这个\n\n请用 read 工具阅读这些工作区文件（不要用 cat）：\n- happy-inbox/Main.java',
  )
})

test('非图片附件写入 happy-inbox，相对路径给 read，不覆盖已有文件', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'happy-inbox-'))
  try {
    const first = await saveInboxFiles(cwd, [{
      name: 'Main.java',
      mimeType: 'text/plain',
      bytes: new TextEncoder().encode('class A {}'),
    }])
    const second = await saveInboxFiles(cwd, [{
      name: 'Main.java',
      mimeType: 'text/plain',
      bytes: new TextEncoder().encode('class B {}'),
    }])
    assert.deepEqual(first, ['happy-inbox/Main.java'])
    assert.deepEqual(second, ['happy-inbox/Main-1.java'])
    assert.equal(await readFile(join(cwd, 'happy-inbox', 'Main.java'), 'utf8'), 'class A {}')
    assert.equal(await readFile(join(cwd, 'happy-inbox', 'Main-1.java'), 'utf8'), 'class B {}')
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

test('附件下载走 request-download 再 GET 密文，S3 地址不加 Bearer', async () => {
  const calls: { url: string; auth?: string }[] = []
  const original = globalThis.fetch
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const auth = new Headers(init?.headers).get('Authorization') ?? undefined
    calls.push({ url, ...(auth === undefined ? {} : { auth }) })
    if (url.endsWith('/request-download')) {
      return new Response(JSON.stringify({ downloadUrl: 'https://files.example/blob' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response(Uint8Array.of(9, 8, 7), { status: 200 })
  }) as typeof fetch
  try {
    const bytes = await downloadEncryptedAttachment(
      'https://api.example',
      'tok',
      'sid-1',
      'happy/sid-1/ref',
    )
    assert.deepEqual([...bytes], [9, 8, 7])
    assert.equal(calls[0]?.url, 'https://api.example/v1/sessions/sid-1/attachments/request-download')
    assert.equal(calls[0]?.auth, 'Bearer tok')
    assert.equal(calls[1]?.url, 'https://files.example/blob')
    assert.equal(calls[1]?.auth, undefined)
  } finally {
    globalThis.fetch = original
  }
})

test('手机附件走 App 的 session/data/ev 包，不是 happy-wire 那一层', () => {
  const fromApp = parseHappyInbound({
    role: 'session',
    content: {
      type: 'session',
      data: {
        id: 'm1',
        time: 1,
        role: 'user',
        ev: { t: 'file', ref: 'happy/s/a.enc', name: 'shot.jpg', size: 12 },
      },
    },
  })
  assert.deepEqual(fromApp, { kind: 'file', ref: 'happy/s/a.enc', name: 'shot.jpg', meta: {} })

  const fromWire = parseHappyInbound({
    role: 'session',
    content: { role: 'user', ev: { t: 'file', ref: 'r2', name: 'a.png', mimeType: 'image/png' } },
    meta: { sentFrom: 'ios' },
  })
  assert.deepEqual(fromWire, {
    kind: 'file',
    ref: 'r2',
    name: 'a.png',
    mimeType: 'image/png',
    meta: { sentFrom: 'ios' },
  })

  const chat = parseHappyInbound({
    role: 'user',
    content: { type: 'text', text: '' },
    meta: { sentFrom: 'ios' },
  })
  assert.deepEqual(chat, { kind: 'text', text: '', meta: { sentFrom: 'ios' } })

  assert.equal(parseHappyInbound({
    role: 'session',
    content: { role: 'agent', ev: { t: 'text', text: '助手' } },
  }), undefined)
})

test('真人 user/message 里的图会进历史，插件注入不会', () => {
  const image = {
    attachmentId: 'att-1',
    mediaType: 'image/png',
    bytes: 12,
    width: 8,
    height: 8,
    name: 'shot.png',
  }
  assert.deepEqual(visibleUserImages({
    type: 'user/message',
    data: { source: { kind: 'user' }, content: [{ type: 'image', attachment: image }, { type: 'text', text: '看这张' }] },
  }), [image])
  assert.deepEqual(visibleUserImages({
    type: 'user/message',
    data: { source: { kind: 'plugin' }, content: [{ type: 'image', attachment: image }] },
  }), [])
  const items = historyItems([{
    type: 'user/message',
    time: 9,
    data: { source: { kind: 'user' }, content: [{ type: 'image', attachment: image }] },
  }])
  assert.deepEqual(items, [{ kind: 'user', time: 9, text: '', images: [image] }])
})

test('电脑附件走 request-upload 再 PUT 密文，S3 地址不加 Bearer', async () => {
  const calls: { url: string; method?: string; auth?: string; body?: string }[] = []
  const original = globalThis.fetch
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const auth = new Headers(init?.headers).get('Authorization') ?? undefined
    calls.push({
      url,
      method: init?.method,
      ...(auth === undefined ? {} : { auth }),
      ...(typeof init?.body === 'string' ? { body: init.body } : {}),
    })
    if (url.endsWith('/request-upload')) {
      return new Response(JSON.stringify({
        ref: 'happy/sid-1/a.enc',
        uploadUrl: 'https://files.example/put',
        method: 'PUT',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response('', { status: 200 })
  }) as typeof fetch
  try {
    const ref = await uploadEncryptedAttachment(
      'https://api.example',
      'tok',
      'sid-1',
      'shot.png',
      Uint8Array.of(1, 2, 3),
    )
    assert.equal(ref, 'happy/sid-1/a.enc')
    assert.equal(calls[0]?.url, 'https://api.example/v1/sessions/sid-1/attachments/request-upload')
    assert.equal(calls[0]?.auth, 'Bearer tok')
    assert.equal(calls[0]?.body, JSON.stringify({ filename: 'shot.png', size: 3 }))
    assert.equal(calls[1]?.url, 'https://files.example/put')
    assert.equal(calls[1]?.method, 'PUT')
    assert.equal(calls[1]?.auth, undefined)
  } finally {
    globalThis.fetch = original
  }
})
