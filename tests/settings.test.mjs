import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import TokenMeter from '@deepseek-ai/dsh-token-meter'
import * as Happy from '../plugins/happy-bridge/lib/index.js'
import * as Segmented from '../plugins/segmented-compaction/lib/index.js'
import { profileFixture } from './profile.mjs'

const support = { async apply(ctx) {
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(TokenMeter)
  ctx.provide('sessionQuery', {})
} }

for (const [id, plugin, initial, accepted, refused] of [
  ['happy-bridge', Happy, { enabled: false }, { remoteGrant: 'full', questionChannel: 'permission' },
    [{ remoteGrant: 'invalid' }, { questionChannel: 'invalid' }, { enabled: 'yes' }]],
  ['segmented-compaction', Segmented, {}, { enabled: false, maxCalls: 17, contextRatio: 0.5 },
    [{ maxCalls: 1.5 }, { maxCalls: 0 }, { maxShrinkRetries: -1 }, { contextRatio: 0 }]],
]) {
  test(id + ' saves validated live fields to the profile and refuses invalid or stale writes', async t => {
    const { ctx, profile } = await profileFixture(t, { support, subject: plugin }, [
      { id: 'support', name: 'cordis:support' }, { id, name: 'cordis:subject', config: initial },
    ])
    const descriptor = () => ctx.settings.describe().find(row => row.ns === id)
    const entry = [...ctx.loader.entries()].find(row => row.options.id === id)
    const fiber = entry.fiber
    assert.equal(descriptor().autoGenerate, false)
    const revision = descriptor().revision
    await ctx.settings.mutate(id, Object.entries(accepted).map(([key, value]) => ({ op: 'set', path: [key], value })), revision)
    assert.equal(entry.fiber, fiber)
    for (const [key, value] of Object.entries(accepted)) {
      assert.equal(descriptor().value[key], value)
      assert.equal(fiber.config[key].get(), value)
    }
    if (id === 'happy-bridge') {
      await ctx.settings.mutate(id, [
        { op: 'set', path: ['credentialDir'], value: path.join(profile.dir, 'credentials') },
        { op: 'set', path: ['pairOnStart'], value: false },
        { op: 'set', path: ['enabled'], value: true },
      ])
      const service = ctx.get('happyBridge')
      const bridge = service.live
      assert.ok(bridge)
      await ctx.settings.mutate(id, [{ op: 'set', path: ['remoteGrant'], value: 'watch' }])
      assert.equal(service.live, bridge)
      assert.equal(bridge.config.remoteGrant, 'watch')
      await ctx.settings.mutate(id, [{ op: 'set', path: ['enabled'], value: false }])
      assert.equal(service.live, undefined)
    }
    const saved = await fs.readFile(profile.patchPath, 'utf8')
    for (const invalid of refused) await assert.rejects(ctx.settings.mutate(id,
      Object.entries(invalid).map(([key, value]) => ({ op: 'set', path: [key], value }))))
    await assert.rejects(ctx.settings.mutate(id, [{ op: 'set', path: ['enabled'], value: true }], revision), /changed since/)
    assert.equal(await fs.readFile(profile.patchPath, 'utf8'), saved)
  })
}
