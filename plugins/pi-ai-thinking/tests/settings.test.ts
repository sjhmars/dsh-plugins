import assert from 'node:assert/strict'
import { test } from 'node:test'
import { apply, inject } from '../src/index.ts'

const harnessRoot = new URL('../../../../deepseek-harness/', import.meta.url)
const cordis = await import(new URL('vendor/cordis/lib/index.js', harnessRoot).href)
const settingsModule = await import(new URL('packages/settings/settings/lib/index.js', harnessRoot).href)
const piAi = await import(new URL('packages/llm/llm-pi-ai/lib/index.js', harnessRoot).href)

async function eventually(check: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (check()) return
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  assert.fail('等待插件补齐设置超时')
}

test('Host 插件启动和设置更新时补齐全部自定义模型', async () => {
  const initial = {
    'llm-pi-ai': {
      providers: {
        responses: {
          api: 'openai-responses',
          baseURL: 'https://gateway.example/v1',
          models: [{ id: 'model-a', name: 'Model A', contextWindow: 32768, maxTokens: 4096 }],
        },
      },
    },
  }
  class MemorySettings extends settingsModule.default {
    data = structuredClone(initial)

    get writable(): boolean {
      return true
    }

    async load(): Promise<Record<string, unknown>> {
      return structuredClone(this.data)
    }

    async persist(ns: string, section: Record<string, unknown>): Promise<void> {
      this.data = { ...this.data, [ns]: structuredClone(section) }
    }
  }

  const ctx = new cordis.Context()
  try {
    await ctx.plugin(MemorySettings).await()
    const namespace = settingsModule.settingsNamespace('llm-pi-ai')
    ctx.settings.register(namespace, piAi.Config)
    await ctx.plugin({ inject, apply }, { force: false }).await()

    await eventually(() => {
      const model = (ctx.settings.get(namespace) as {
        providers: { responses: { models: Array<{ reasoningEfforts?: unknown }> } }
      }).providers.responses.models[0]
      return model?.reasoningEfforts !== undefined
    })

    const responses = ctx.settings.get(namespace) as {
      providers: {
        responses: {
          models: Array<{ reasoningEfforts?: unknown }>
        }
      }
    }
    assert.deepEqual(responses.providers.responses.models[0]?.reasoningEfforts, {
      off: 'none',
      low: 'low',
      high: 'high',
      max: 'max',
    })
    const userAfterInitial = ctx.settings.describe().find(candidate => candidate.ns === namespace)?.user as {
      providers: { responses: { reasoning?: unknown } }
    }
    assert.equal(userAfterInitial.providers.responses.reasoning, 'off')

    await ctx.settings.mutate(namespace, [{
      op: 'set',
      path: ['providers', 'messages'],
      value: {
        api: 'anthropic-messages',
        baseURL: 'https://gateway.example',
        models: [{ id: 'model-b', contextWindow: 32768, maxTokens: 4096 }],
      },
    }])

    await eventually(() => {
      const user = ctx.settings.describe().find(candidate => candidate.ns === namespace)?.user as {
        providers?: { messages?: { thinkingBudgets?: unknown } }
      }
      return user.providers?.messages?.thinkingBudgets !== undefined
    })

    const userAfterUpdate = ctx.settings.describe().find(candidate => candidate.ns === namespace)?.user as {
      providers: {
        messages: {
          reasoning?: unknown
          thinkingBudgets?: unknown
          models: Array<{ reasoningEfforts?: unknown }>
        }
      }
    }
    assert.equal(userAfterUpdate.providers.messages.reasoning, 'off')
    assert.deepEqual(userAfterUpdate.providers.messages.thinkingBudgets, { low: 2048, high: 16384 })
    assert.deepEqual(userAfterUpdate.providers.messages.models[0]?.reasoningEfforts, {
      off: null,
      low: 'low',
      high: 'high',
      max: 'max',
    })
  } finally {
    await ctx.fiber.dispose()
  }
})
