/** Resolve hook: redirect harness peer packages to inert test stubs. */

const STUBS = new Map([
  ['@deepseek-ai/dsh-attachment', 'attachment.mjs'],
  ['@deepseek-ai/dsh-llm', 'llm.mjs'],
  ['@deepseek-ai/dsh-session', 'session.mjs'],
  ['@deepseek-ai/dsh-user-questions', 'user-questions.mjs'],
])

export async function resolve(specifier, context, nextResolve) {
  const stub = STUBS.get(specifier)
  if (stub !== undefined) {
    return { url: new URL(`./${stub}`, import.meta.url).href, shortCircuit: true }
  }
  return nextResolve(specifier, context)
}
