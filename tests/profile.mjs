/** Test-owned profiles exercise public Loader configuration and durable patches. */
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { boot, initProfile, readProfilePatches } from '@deepseek-ai/dsh-app-boot'
import ConfigEditor from '@deepseek-ai/dsh-config-editor'
import Settings from '@deepseek-ai/dsh-settings'

export async function profileFixture(t, builtins, rows, patches = [], options = {}) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-plugin-config-'))
  let ctx
  t.after(async () => {
    try { await ctx?.fiber.dispose() }
    finally { await fs.rm(home, { recursive: true, force: true }) }
  })
  const dir = path.join(home, 'profiles', options.name ?? 'test')
  initProfile(dir, ['test-bundle'])
  const bundle = path.join(dir, 'node_modules', 'test-bundle')
  await fs.mkdir(bundle, { recursive: true })
  await fs.writeFile(path.join(home, 'package.json'), '{"name":"plugin-test"}\n')
  await fs.writeFile(path.join(bundle, 'package.json'), JSON.stringify({
    name: 'test-bundle', version: '1.0.0', dsh: { bundle: { patch: 'cordis.patch.yml' } },
  }))
  await fs.writeFile(path.join(bundle, 'cordis.patch.yml'), JSON.stringify([{ insert: [
    { id: 'config-editor', name: 'cordis:editor' },
    { id: 'settings', name: 'cordis:settings' }, ...rows,
  ] }]))
  await fs.writeFile(path.join(dir, 'cordis.yml'), '[]\n')
  const profile = {
    name: options.name ?? 'test', ...options.packageManager === undefined ? {} : { packageManager: options.packageManager }, startedBundles: ['test-bundle'], dir, patchPath: path.join(dir, 'cordis.patch.yml'),
    installAnchor: path.join(home, 'package.json'), cwd: home, home, overlays: [], telemetryDisabledEnv: undefined,
  }
  await fs.writeFile(profile.patchPath, JSON.stringify(patches))
  ctx = await boot('test', path.join(dir, 'cordis.yml'), readProfilePatches('test', profile), ctx => {
    ctx.provide('profileContext', profile)
    ctx.provide('appReady', { onReady(listener) { listener(); return () => {} } })
    Object.assign(ctx.loader.builtins, { editor: ConfigEditor, settings: Settings, ...builtins })
  })
  return { ctx, profile }
}

export async function waitForSettings(ctx, predicate) {
  if (predicate()) return
  await new Promise((resolve, reject) => {
    const off = ctx.on('settings/document-updated', () => {
      if (!predicate()) return
      clearTimeout(timer); off(); resolve()
    }, { global: true })
    const timer = setTimeout(() => { off(); reject(Error('Settings update did not arrive')) }, 5000)
    if (predicate()) { clearTimeout(timer); off(); resolve() }
  })
}
