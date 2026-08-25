import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildThinkingOps, reasoningEffortsFor } from '../src/patch.ts'

test('按协议生成 pi-ai 思考档位映射', () => {
  assert.deepEqual(reasoningEffortsFor('openai-completions'), {
    off: null,
    low: 'low',
    high: 'high',
    max: 'max',
  })
  assert.deepEqual(reasoningEffortsFor('openai-responses'), {
    off: 'none',
    low: 'low',
    high: 'high',
    max: 'max',
  })
  assert.deepEqual(reasoningEffortsFor('anthropic-messages'), {
    off: null,
    low: 'low',
    high: 'high',
    max: 'max',
  })
})

test('补齐自定义 provider 的模型能力并保留其他字段', () => {
  const ops = buildThinkingOps({
    providers: {
      gateway: {
        api: 'openai-completions',
        baseURL: 'https://gateway.example/v1',
        models: [{
          id: 'custom-model',
          name: '自定义模型',
          contextWindow: 32768,
          maxTokens: 4096,
          extra: 'kept',
        }],
      },
    },
  }, false)

  assert.deepEqual(ops, [
    {
      op: 'set',
      path: ['providers', 'gateway', 'models'],
      value: [{
        id: 'custom-model',
        name: '自定义模型',
        contextWindow: 32768,
        maxTokens: 4096,
        extra: 'kept',
        reasoningEfforts: { off: null, low: 'low', high: 'high', max: 'max' },
      }],
    },
    { op: 'set', path: ['providers', 'gateway', 'reasoning'], value: 'off' },
  ])
})

test('Anthropic 补齐预算而不覆盖用户的现有预算', () => {
  const ops = buildThinkingOps({
    providers: {
      messages: {
        api: 'anthropic-messages',
        thinkingBudgets: { low: 4096, medium: 8192 },
        models: [{ id: 'custom-model' }],
      },
    },
  }, false)

  assert.deepEqual(ops, [
    {
      op: 'set',
      path: ['providers', 'messages', 'models'],
      value: [{
        id: 'custom-model',
        reasoningEfforts: { off: null, low: 'low', high: 'high', max: 'max' },
      }],
    },
    { op: 'set', path: ['providers', 'messages', 'reasoning'], value: 'off' },
    {
      op: 'set',
      path: ['providers', 'messages', 'thinkingBudgets'],
      value: { low: 4096, medium: 8192, high: 16384 },
    },
  ])
})

test('默认保留已有能力声明，force 才替换', () => {
  const section = {
    providers: {
      gateway: {
        api: 'openai-responses',
        reasoning: 'high',
        models: [{
          id: 'custom-model',
          reasoningEfforts: { off: null, high: 'custom-high' },
        }],
      },
    },
  }

  assert.deepEqual(buildThinkingOps(section, false), [])
  assert.deepEqual(buildThinkingOps(section, true), [{
    op: 'set',
    path: ['providers', 'gateway', 'models'],
    value: [{
      id: 'custom-model',
      reasoningEfforts: { off: 'none', low: 'low', high: 'high', max: 'max' },
    }],
  }])
})

test('跳过 catalog provider 和不支持的协议', () => {
  assert.deepEqual(buildThinkingOps({
    providers: {
      catalog: { api: 'openai-completions' },
      unsupported: { api: 'bedrock-converse', models: [{ id: 'model' }] },
    },
  }, false), [])
})
