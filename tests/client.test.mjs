/** Published lazy client bundles bind current Plugins slots and Config forms. */
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.resolve('@deepseek-ai/dsh-client-ui-renderer/client'))
const { createElement } = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

for (const id of ['happy-bridge', 'segmented-compaction']) {
  test(id + ' published client renders on its Plugins bundle page and forwards accepted/refused writes', async () => {
    const source = await fs.readFile(new URL('../plugins/' + id + '/lib/client.js', import.meta.url), 'utf8')
    let definition
    vm.runInNewContext(source, { window: { __ModuleLoader__: { load(value) { definition = value } } } })
    assert.equal(definition.id, '@sjhmars/' + id)
    const module = definition.factory(require)
    let contribution, component, dictionaries
    let accepted = false
    const writes = []
    const snapshot = { status: 'ready', value: id === 'happy-bridge' ? { enabled: true, remoteGrant: 'approve' }
      : { enabled: true, contextRatio: 0.8, maxShrinkRetries: 8, maxCalls: 128 }, writable: true, revision: 4 }
    const form = {
      getSnapshot: () => snapshot, subscribe: () => () => {},
      async set(key, value) { writes.push({ key, value }); return accepted },
      async mutate(ops, revision) { writes.push({ ops, revision }); return accepted },
    }
    const ctx = {
      get: () => ({ rpc: { call: async () => ({ ok: true, value: {} }) } }),
      effect: callback => callback(),
      configForms: { get(namespace) { assert.equal(namespace, id); return form } },
      locale: { register(namespace, value) { assert.equal(namespace, id); dictionaries = value; return () => {} } },
      slots: {
        inject(name, install) { assert.equal(name, 'plugins.bundle.config'); return install() },
        register(entry, renderer) { contribution = entry; component = renderer; return () => {} },
      },
    }
    module.apply(ctx)
    assert.equal(contribution.key, '@sjhmars/' + id)
    const injected = contribution.inject()
    const props = { view: 'page', t: key => dictionaries.zh[key], ...injected }
    if (id === 'happy-bridge') props.useHappySettings = selector => selector(snapshot)
    else props.useSegmentedSettings = selector => selector(snapshot)
    const html = renderToStaticMarkup(createElement(component, props))
    assert.match(html, /<section/)
    assert.ok(html.includes(id === 'happy-bridge' ? 'Happy 远程' : '分段压缩'))
    const save = () => id === 'happy-bridge' ? injected.setGrant('full') : injected.save(snapshot.value, snapshot.revision)
    assert.equal(await save(), false)
    accepted = true
    assert.equal(await save(), true)
    if (id === 'segmented-compaction') assert.equal(writes[1].revision, 4)
    else assert.deepEqual(writes[1], { key: 'remoteGrant', value: 'full' })
  })
}
