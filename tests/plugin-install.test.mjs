/** Built installer requests mutate private profiles through real official package operations. */
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import * as Installer from '../plugins/plugin-install/lib/index.js'
import { profileFixture } from './profile.mjs'
import { installFixture } from './installer-fixture.mjs'

async function bootInstaller(t) {
  const fixture = await installFixture(t)
  const routes = new Map()
  const carrier = { apply(ctx) {
    ctx.provide('connection', { fetch: { register(route) {
      assert.equal(route.requestBody, 'buffered')
      routes.set(route.path, route)
      return () => routes.delete(route.path)
    } } })
  } }
  const { ctx, profile } = await profileFixture(t, { carrier, installer: Installer }, [
    { id: 'carrier', name: 'cordis:carrier' },
    { id: 'installer', name: 'cordis:installer', config: { profile: 'web' } },
  ], [], { name: 'web', packageManager: fixture.profile.packageManager })
  const install = async spec => (await routes.get('/api/pluginInstall/install').fetch(
    new Request('http://localhost/api/pluginInstall/install?package=' + encodeURIComponent(spec)))).json()
  const read = async () => JSON.parse(await fs.readFile(path.join(profile.dir, 'package.json'), 'utf8'))
  return { fixture, ctx, profile, routes, install, read }
}
test('Loader 启动的安装页面接受普通组件和 bundle 并保存真实 profile', async t => {
  const { ctx, routes, install, read } = await bootInstaller(t)
  assert.deepEqual(await (await routes.get('/api/pluginInstall/target').fetch()).json(), { profile: 'web' })
  assert.equal((await install('file:x')).code, 2)
  const ordinary = await install('@deepseek-ai/dsh-web-search-exa@0.2.1-alpha.1')
  assert.equal(ordinary.ok, true)
  assert.equal(ordinary.kind, 'dependency')
  assert.equal(ordinary.application, 'restart-required')
  assert.equal((await read()).dependencies['@deepseek-ai/dsh-web-search-exa'], '0.2.1-alpha.1')
  assert.equal((await read()).dsh.profile.bundles.includes('@deepseek-ai/dsh-web-search-exa'), false)
  const bundle = await install('@fixture/bundle')
  assert.equal(bundle.ok, true)
  assert.equal(bundle.enabled, true)
  assert.ok((await read()).dsh.profile.bundles.includes('@fixture/bundle'))
  await ctx.fiber.dispose()
  assert.equal(routes.size, 0)
})
test('卸载 Loader 中的安装插件会取消并等待包进程退出', async t => {
  const { fixture, ctx, profile, install, read, routes } = await bootInstaller(t)
  const before = await read()
  const ready = fixture.started()
  const request = install('@fixture/wait')
  const marker = await ready
  const { pid } = JSON.parse(await fs.readFile(marker, 'utf8'))
  await ctx.fiber.dispose()
  const result = await request
  assert.equal(result.ok, false)
  assert.equal(result.application, 'cancelled')
  assert.deepEqual(await read(), before)
  assert.equal(routes.size, 0)
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
  await assert.rejects(fs.stat(path.join(profile.dir, 'package.json.lock')), { code: 'ENOENT' })
})
test('installer rejects a mismatched destination at load', () => {
  assert.throws(() => Installer.apply({ profileContext: { name: 'desktop' } }, { profile: 'web' }), /profile/)
})
