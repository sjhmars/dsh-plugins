import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SessionId } from '@deepseek-ai/dsh-session'
import { archiveSetDiff, hideOnHarness, phoneParkAction, revealOnHarness } from '../src/archive-sync.ts'
import type { WorkspaceDomainState } from '@deepseek-ai/dsh-workspace'

test('网页还在侧栏时，手机关掉心跳的行要重新上线', () => {
  assert.equal(phoneParkAction(true, true), 'unpark')
  assert.equal(phoneParkAction(false, true), 'keep')
  assert.equal(phoneParkAction(false, false), 'park')
  assert.equal(phoneParkAction(true, false), 'keep')
})

test('归档集合 diff 分出藏起来的和重新显示的', () => {
  assert.deepEqual(
    archiveSetDiff(new Set(['a']), new Set(['a', 'b'])),
    { hidden: ['b'], shown: [] },
  )
  assert.deepEqual(
    archiveSetDiff(new Set(['a', 'b']), new Set(['b'])),
    { hidden: [], shown: ['a'] },
  )
})

test('hide 对未归档的 id 调用 archiveSession，已归档则跳过', async () => {
  const archived: string[] = []
  const calls: string[] = []
  const registry = {
    get archivedSessionIds() { return archived.map(SessionId) },
    async archiveSession(sessionId: ReturnType<typeof SessionId>) {
      calls.push(sessionId)
      archived.push(sessionId)
    },
  }
  await hideOnHarness(registry, 's1')
  await hideOnHarness(registry, 's1')
  assert.deepEqual(calls, ['s1'])
})

test('hide 在已经写入归档集合后忽略后续抛错', async () => {
  const archived = [SessionId('s1')]
  const registry = {
    get archivedSessionIds() { return archived },
    async archiveSession() { throw new Error('already written') },
  }
  await hideOnHarness(registry, 's1')
})

test('reveal 从归档集合拿掉 id，已经可见则不写', async () => {
  const state: WorkspaceDomainState = {
    initialized: true,
    workspaceIds: [],
    archivedSessionIds: [SessionId('a'), SessionId('b')],
  }
  const writes: WorkspaceDomainState[] = []
  const registry = {
    get archivedSessionIds() { return state.archivedSessionIds },
    async archiveSession() {},
    enqueueOperation: async (operation: () => Promise<void>) => { await operation() },
    requireState: () => state,
    setState: async (next: WorkspaceDomainState) => {
      writes.push(next)
      state.archivedSessionIds = next.archivedSessionIds
    },
  }
  await revealOnHarness(registry as never, 'a')
  await revealOnHarness(registry as never, 'a')
  assert.equal(writes.length, 1)
  assert.deepEqual(writes[0]?.archivedSessionIds, ['b'])
})
