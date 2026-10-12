import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { test } from 'node:test'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import * as PiAi from '@deepseek-ai/dsh-llm-pi-ai'
import * as Thinking from '../src/index.ts'
import { profileFixture, waitForSettings } from '../../../tests/profile.mjs'

test('startup and live provider saves persist thinking controls through the Loader', async t => {
  const initial = { providers: { responses: {
    api: 'openai-responses', baseURL: 'https://gateway.example/v1',
    models: [{ id: 'model-a', name: 'Model A', contextWindow: 32768, maxTokens: 4096 }],
  } } }
  const { ctx, profile } = await profileFixture(t, { llm: LlmRuntime, pi: PiAi, thinking: Thinking }, [
    { id: 'llm', name: 'cordis:llm' },
    { id: 'llm-pi-ai', name: 'cordis:pi' },
    { id: 'pi-ai-thinking', name: 'cordis:thinking' },
  ], [{ id: 'llm-pi-ai', config: initial }])
  const section = () => ctx.settings.describe().find(row => row.ns === 'llm-pi-ai')
  await waitForSettings(ctx, () => section()?.user.providers.responses.models[0].reasoningEfforts !== undefined)
  assert.deepEqual(section().value.providers.responses.models[0].reasoningEfforts,
    { off: 'none', low: 'low', high: 'high', max: 'max' })
  assert.equal(section().user.providers.responses.reasoning, 'off')
  await ctx.settings.mutate('llm-pi-ai', [{ op: 'set', path: ['providers', 'messages'], value: {
    api: 'anthropic-messages', baseURL: 'https://gateway.example',
    models: [{ id: 'model-b', contextWindow: 32768, maxTokens: 4096 }],
  } }])
  await waitForSettings(ctx, () => section()?.user.providers.messages?.thinkingBudgets !== undefined)
  assert.equal(section().user.providers.messages.reasoning, 'off')
  assert.deepEqual(section().value.providers.messages.thinkingBudgets, { low: 2048, high: 16384 })
  assert.deepEqual(section().value.providers.messages.models[0].reasoningEfforts,
    { off: null, low: 'low', high: 'high', max: 'max' })
  assert.match(await fs.readFile(profile.patchPath, 'utf8'), /reasoningEfforts/)
  assert.ok(ctx.llm.listProviders().some(provider => provider.id === 'messages'))
})
