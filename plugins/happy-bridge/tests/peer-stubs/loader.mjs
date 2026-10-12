/** Resolve hook: redirect harness peer packages to inert test stubs. */

const STUBS = new Map([
  ['socket.io-client', 'socket.mjs'],
  ['@deepseek-ai/dsh-attachment', 'attachment.mjs'],
  ['@deepseek-ai/dsh-llm', 'llm.mjs'],
  ['@deepseek-ai/dsh-session', 'session.mjs'],
  ['@deepseek-ai/dsh-user-questions', 'user-questions.mjs'],
])

export async function resolve(specifier, context, nextResolve) {
  if (process.env.HAPPY_BRIDGE_TEST_BUILT === '1' && (specifier === '../src/bridge.ts' || specifier === '../src/session-socket.ts')) {
    const file = specifier.slice('../src/'.length).replace(/\.ts$/, '.js')
    return { url: new URL('../../lib/types/' + file, import.meta.url).href, shortCircuit: true }
  }
  const stub = STUBS.get(specifier)
  if (stub !== undefined) {
    return { url: new URL(`./${stub}`, import.meta.url).href, shortCircuit: true }
  }
  return nextResolve(specifier, context)
}
