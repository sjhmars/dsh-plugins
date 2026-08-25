import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { reasoningEffortsFor } from '../src/patch.ts'

const harnessRoot = new URL('../../../../deepseek-harness/', import.meta.url)
const cordis = await import(new URL('vendor/cordis/lib/index.js', harnessRoot).href)
const llm = await import(new URL('packages/llm/llm/lib/index.js', harnessRoot).href)
const piAi = await import(new URL('packages/llm/llm-pi-ai/lib/index.js', harnessRoot).href)

const TOOL = {
  name: 'lookup',
  description: '查找一个值。',
  parameters: {
    type: 'object',
    properties: { code: { type: 'string' } },
    required: ['code'],
  },
}

function writeOpenAiCompletions(response: import('node:http').ServerResponse): void {
  response.write('data: {"choices":[{"delta":{"role":"assistant","content":""},"index":0,"finish_reason":null}]}\n\n')
  response.write('data: {"choices":[{"delta":{"content":"ok"},"index":0,"finish_reason":null}]}\n\n')
  response.write('data: {"choices":[{"delta":{},"index":0,"finish_reason":"stop"}]}\n\n')
  response.end('data: [DONE]\n\n')
}

function writeOpenAiResponses(response: import('node:http').ServerResponse): void {
  const event = (value: unknown): void => { response.write(`data: ${JSON.stringify(value)}\n\n`) }
  event({ type: 'response.created', response: { id: 'resp_1' } })
  event({
    type: 'response.output_item.added',
    output_index: 0,
    item: { id: 'msg_1', type: 'message', role: 'assistant', content: [] },
  })
  event({ type: 'response.output_text.delta', output_index: 0, delta: 'ok' })
  event({
    type: 'response.output_item.done',
    output_index: 0,
    item: {
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text: 'ok', annotations: [] }],
    },
  })
  event({
    type: 'response.completed',
    response: {
      id: 'resp_1',
      status: 'completed',
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
    },
  })
  response.end()
}

function writeAnthropicMessages(response: import('node:http').ServerResponse): void {
  const event = (name: string, value: unknown): void => {
    response.write(`event: ${name}\ndata: ${JSON.stringify(value)}\n\n`)
  }
  event('message_start', {
    type: 'message_start',
    message: {
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      model: 'custom-model',
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 0 },
    },
  })
  event('content_block_start', {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'text', text: '' },
  })
  event('content_block_delta', {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'text_delta', text: 'ok' },
  })
  event('content_block_stop', { type: 'content_block_stop', index: 0 })
  event('message_delta', {
    type: 'message_delta',
    delta: { stop_reason: 'end_turn', stop_sequence: null },
    usage: { output_tokens: 1 },
  })
  event('message_stop', { type: 'message_stop' })
  response.end()
}

async function startMock(protocol: string): Promise<{
  url: string
  paths: string[]
  requests: Record<string, unknown>[]
  close(): Promise<void>
}> {
  const paths: string[] = []
  const requests: Record<string, unknown>[] = []
  const server = createServer((request, response) => {
    let body = ''
    request.on('data', chunk => { body += chunk.toString('utf8') })
    request.on('end', () => {
      paths.push(request.url ?? '')
      requests.push(JSON.parse(body) as Record<string, unknown>)
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      switch (protocol) {
        case 'openai-completions':
          writeOpenAiCompletions(response)
          return
        case 'openai-responses':
          writeOpenAiResponses(response)
          return
        case 'anthropic-messages':
          writeAnthropicMessages(response)
          return
        default:
          response.end()
      }
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('mock server did not bind a port')
  return {
    url: `http://127.0.0.1:${address.port}`,
    paths,
    requests,
    close: () => new Promise(resolve => server.close(resolve)),
  }
}

async function runRequest(ctx: InstanceType<typeof cordis.Context>, effort: 'off' | 'low' | 'high' | 'max'): Promise<void> {
  const assembler = new llm.BlockAssembler()
  const messages = [llm.createUserMessage({
    content: [{ type: 'text', text: '回复 ok。' }],
    source: { kind: 'plugin', plugin: 'pi-ai-thinking-test' },
  })]
  for await (const chunk of ctx.llm.stream({
    provider: 'gateway',
    model: 'custom-model',
    messages,
    tools: [TOOL],
    maxTokens: 1024,
    reasoningEffort: llm.ReasoningEffortId(effort),
  })) {
    assembler.push(chunk)
  }
  assert.notEqual(assembler.finish.kind, 'error')
}

for (const protocol of ['openai-completions', 'openai-responses', 'anthropic-messages'] as const) {
  test(`${protocol} 的四档思考请求可流式完成并保留工具声明`, async () => {
    process.env.PI_TEST_KEY = 'test-key'
    const mock = await startMock(protocol)
    const ctx = new cordis.Context()
    try {
      await ctx.plugin(llm.default)
      await ctx.plugin(piAi, {
        providers: {
          gateway: {
            api: protocol,
            apiKeyEnv: 'PI_TEST_KEY',
            baseURL: mock.url,
            reasoning: 'off',
            ...protocol === 'anthropic-messages'
              ? { thinkingBudgets: { low: 2048, high: 16384 } }
              : {},
            models: [{
              id: 'custom-model',
              name: 'Custom model',
              contextWindow: 32768,
              maxTokens: 32768,
              reasoningEfforts: reasoningEffortsFor(protocol),
            }],
          },
        },
      })

      for (const effort of ['off', 'low', 'high', 'max'] as const) await runRequest(ctx, effort)

      assert.equal(mock.requests.length, 4)
      assert.ok(mock.requests.every(request => Array.isArray(request.tools)))
      if (protocol === 'openai-completions') {
        assert.deepEqual(mock.paths, Array(4).fill('/chat/completions'))
        assert.deepEqual(mock.requests.map(request => request.reasoning_effort), [undefined, 'low', 'high', 'max'])
      } else if (protocol === 'openai-responses') {
        assert.deepEqual(mock.paths, Array(4).fill('/responses'))
        assert.deepEqual(
          mock.requests.map(request => (request.reasoning as { effort?: unknown } | undefined)?.effort),
          ['none', 'low', 'high', 'max'],
        )
      } else {
        assert.deepEqual(mock.paths, Array(4).fill('/v1/messages'))
        assert.deepEqual(
          mock.requests.map(request => (request.thinking as { type?: unknown; budget_tokens?: unknown } | undefined)?.type),
          ['disabled', 'enabled', 'enabled', 'enabled'],
        )
        assert.deepEqual(
          mock.requests.slice(1).map(request => (request.thinking as { budget_tokens?: unknown }).budget_tokens),
          [2048, 16384, 16384],
        )
      }
    } finally {
      await ctx.fiber.dispose()
      await mock.close()
    }
  })
}
