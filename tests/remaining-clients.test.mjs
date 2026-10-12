/** Built clients render current slots and use current Host/navigation services. */
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'
import { createRequire, registerHooks } from 'node:module'
import { test } from 'node:test'
const require = createRequire(import.meta.resolve('@deepseek-ai/dsh-client-ui-renderer/client'))
const { createElement } = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const cssHook = registerHooks({ load(url, context, next) {
  if (url.endsWith('.css')) return { format: 'module', source: 'export default {}', shortCircuit: true }
  return next(url, context)
} })
const primitives = await import('@deepseek-ai/dsh-client-ui-primitives')
cssHook.deregister()

async function client(id, globals = {}) {
  const source = await fs.readFile(new URL('../plugins/' + id + '/lib/client.js', import.meta.url), 'utf8')
  let definition
  const sandbox = { URLSearchParams, window: { __ModuleLoader__: { load(value) { definition = value } } }, ...globals }
  vm.runInNewContext(source, sandbox)
  assert.equal(definition.id, '@sjhmars/' + id)
  return definition.factory(spec => spec === '@deepseek-ai/dsh-client-ui-primitives' ? primitives : require(spec))
}

test('editor-launcher mounts, caches detection and opens current-session/home-relative file links', async () => {
  let click, contribution, component, dictionaries, selected = 'selected'
  const preferred = { id: 'code', name: 'VS Code' }
  const storage = new Map([['dsh.editor-launcher.preferred', JSON.stringify(preferred)]])
  const disposers = []
  class Element {
    constructor(text, title = null) { this.textContent = text; this.title = title }
    closest(selector) { return selector === 'button' || selector === '[data-tool]' ? this : null }
    hasAttribute() { return false }
    getAttribute(key) { return key === 'title' ? this.title : null }
  }
  const module = await client('editor-launcher', {
    Element, localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    document: {
      querySelector: () => ({}),
      addEventListener(name, listener) { assert.equal(name, 'click'); click = listener },
      removeEventListener(name, listener) { assert.equal(name, 'click'); assert.equal(click, listener); click = undefined },
    },
  })
  const calls = [], defaults = []
  let detections = 0, openOk = true
  const connection = { rpc: { async call(route, endpoint, payload) {
    assert.equal(route, '/api')
    if (endpoint === 'editorLauncher/listEditors') { detections++; return { ok: true, value: [{ id: 'code', name: 'VS Code', command: 'code' }] } }
    assert.equal(endpoint, 'editorLauncher/openWith')
    calls.push(structuredClone(payload.args))
    return { ok: true, value: { ok: openOk } }
  } } }
  const ctx = {
    get(name) { assert.equal(name, 'connection'); return connection },
    effect(install) { const dispose = install(); if (typeof dispose === 'function') disposers.push(dispose) },
    locale: { register(ns, copy) { assert.equal(ns, 'editor-launcher'); dictionaries = copy; return () => {} } },
    slots: {
      inject(name, install) { assert.equal(name, 'conversation.session.header.utilities'); return install() },
      register(entry, renderer) { contribution = entry; component = renderer; return () => {} },
    },
    sessions: { list: { getSnapshot: () => ({ byId: { selected: { cwd: 'H:/project' }, other: { cwd: 'H:/other' } } }) } },
    uiSession: { adapter: { current: { getSnapshot: () => ({ key: selected }) } } },
    remote: { $host: { home: 'C:/Users/test' }, session: { async openWorkspacePath(input) { defaults.push(structuredClone(input)) } } },
  }
  module.apply(ctx)
  assert.equal(contribution.id, 'editor-launcher')
  const injected = contribution.inject()
  await injected.listEditors()
  await injected.listEditors()
  assert.equal(detections, 1)
  await injected.refreshEditors()
  assert.equal(detections, 2)
  const html = renderToStaticMarkup(createElement(component, { ...injected, t: key => dictionaries.zh[key] }))
  assert.match(html, /<button/)
  async function open(path, title = null) {
    let intercepted = false
    click({ target: new Element(path, title), preventDefault() { intercepted = true }, stopPropagation() {} })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(intercepted, true)
  }
  await open('src/main.ts')
  await open('~/notes.txt')
  selected = 'other'
  await open('src/main.ts')
  openOk = false
  await open('irrelevant', 'D:/shared/result.txt')
  assert.deepEqual(calls.map(row => row.filePath), ['H:/project/src/main.ts', 'C:/Users/test/notes.txt', 'H:/other/src/main.ts', 'D:/shared/result.txt'])
  assert.deepEqual(defaults, [{ path: 'D:/shared/result.txt' }])
  for (const dispose of disposers.reverse()) dispose()
  assert.equal(click, undefined)
})

test('plugin-install renders its current bundle page and preserves official application results', async () => {
  let contribution, component, dictionaries
  const fetches = []
  const module = await client('plugin-install', { async fetch(url) {
    fetches.push(url)
    return { ok: true, async json() {
      return url.endsWith('/target') ? { profile: 'desktop' } : { ok: true, code: 0, stdout: '', stderr: '', application: 'restart-required' }
    } }
  } })
  module.apply({
    effect: install => install(),
    locale: { register(ns, copy) { assert.equal(ns, 'plugin-install'); dictionaries = copy; return () => {} } },
    slots: {
      inject(name, install) { assert.equal(name, 'plugins.bundle.config'); return install() },
      register(entry, renderer) { contribution = entry; component = renderer; return () => {} },
    },
  })
  assert.equal(contribution.key, '@sjhmars/plugin-install')
  const injected = contribution.inject()
  assert.equal((await injected.target()).profile, 'desktop')
  assert.equal((await injected.install('@sjhmars/task-notify@0.1.3')).application, 'restart-required')
  assert.equal(fetches[1], '/api/pluginInstall/install?package=%40sjhmars%2Ftask-notify%400.1.3')
  const html = renderToStaticMarkup(createElement(component, { view: 'page', ...injected, t: key => dictionaries.zh[key] }))
  assert.match(html, /用包名安装/)
  assert.match(html, /普通组件/)
  assert.equal(dictionaries.zh.restart, '安装完成，请重启应用后生效。')
  assert.match(dictionaries.zh.dependencyRestart, /首次安装还需在配置文件中启用/)
  assert.match(dictionaries.en.dependencyRestart, /configuration file/)
})
