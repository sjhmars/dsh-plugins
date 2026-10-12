import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { addProfilePlugin, isInstallProfile, parseNpmPackageName } from '../src/add.ts'
import { installFixture } from '../../../tests/installer-fixture.mjs'

test('接受合法 npm 包名与可选版本', () => {
  for (const raw of ['left-pad', '@sjhmars/task-notify']) assert.deepEqual(parseNpmPackageName(raw), { name: raw, version: undefined })
  for (const version of ['1.0.0', 'latest', '^1.2.3', '~1.2.3']) {
    assert.deepEqual(parseNpmPackageName('@sjhmars/task-notify@' + version), { name: '@sjhmars/task-notify', version })
  }
})
test('拒绝路径、协议与畸形输入', () => {
  for (const raw of ['../plugin', 'file:./x', 'github:org/repo', 'left-pad@', 'left-pad@@1.0', '@sjhmars/task-notify extra', '']) {
    assert.equal(parseNpmPackageName(raw), undefined)
  }
})
test('非法包名和不同 profile 不改动 profile 文件', async t => {
  const fixture = await installFixture(t)
  const before = await fixture.snapshot()
  assert.equal(isInstallProfile('web'), true)
  assert.equal(isInstallProfile('desktop'), true)
  assert.equal(isInstallProfile('headless'), false)
  for (const profile of ['desktop', 'headless']) {
    assert.equal((await addProfilePlugin(fixture.profile, { ...fixture.config, profile }, '@fixture/component')).code, 2)
  }
  assert.equal((await addProfilePlugin(fixture.profile, fixture.config, 'file:x')).code, 2)
  assert.deepEqual(await fixture.snapshot(), before)
})
for (const profile of ['web', 'desktop']) {
  test(profile + ' 安装普通组件并使用应用提供的 pnpm', async t => {
    const fixture = await installFixture(t, profile)
    const result = await addProfilePlugin(fixture.profile, fixture.config, '@fixture/component')
    assert.equal(result.ok, true)
    assert.equal(result.kind, 'dependency')
    assert.equal(result.application, 'restart-required')
    assert.equal(result.version, '1.0.0')
    const saved = await fixture.read()
    assert.equal(saved.dependencies['@fixture/component'], '1.0.0')
    assert.deepEqual(saved.dsh.profile.bundles, [])
  })
}
test('更新已有普通 Exa 组件并持久保存新版本', async t => {
  const fixture = await installFixture(t)
  await fixture.seed('@deepseek-ai/dsh-web-search-exa', '0.1.2-alpha.4')
  const result = await addProfilePlugin(fixture.profile, fixture.config, '@deepseek-ai/dsh-web-search-exa@0.2.1-alpha.1')
  assert.equal(result.ok, true)
  assert.equal(result.kind, 'dependency')
  assert.equal(result.application, 'restart-required')
  assert.equal((await fixture.read()).dependencies['@deepseek-ai/dsh-web-search-exa'], '0.2.1-alpha.1')
})
test('新 bundle 自动选择为 profile 层', async t => {
  const fixture = await installFixture(t)
  const result = await addProfilePlugin(fixture.profile, fixture.config, '@fixture/bundle')
  assert.equal(result.ok, true)
  assert.equal(result.kind, 'bundle')
  assert.equal(result.enabled, true)
  assert.deepEqual((await fixture.read()).dsh.profile.bundles, ['@fixture/bundle'])
})
test('更新停用的 bundle 保留停用状态', async t => {
  const fixture = await installFixture(t)
  await fixture.seed('@fixture/bundle', '0.9.0')
  const result = await addProfilePlugin(fixture.profile, fixture.config, '@fixture/bundle')
  assert.equal(result.ok, true)
  assert.equal(result.kind, 'bundle')
  assert.equal(result.enabled, false)
  assert.deepEqual((await fixture.read()).dsh.profile.bundles, [])
})
for (const spec of ['@fixture/failure', '@fixture/bad-bundle', '@fixture/incompatible']) {
  test(spec + ' 失败时恢复清单和 lockfile，保留用户 patch', async t => {
    const fixture = await installFixture(t)
    await fixture.seed('@fixture/component', '0.9.0')
    const before = await fixture.snapshot()
    const result = await addProfilePlugin(fixture.profile, fixture.config, spec)
    assert.equal(result.ok, false)
    assert.equal(result.application, 'failed')
    if (spec === '@fixture/failure') {
      assert.equal(result.code, 7)
      assert.match(result.stdout, /controlled package-manager failure/)
    }
    if (spec === '@fixture/incompatible') assert.match(result.stdout, /incompatible/)
    assert.deepEqual(await fixture.snapshot(), before)
  })
}
test('截断输出提供完整诊断日志的位置', async t => {
  const fixture = await installFixture(t)
  const result = await addProfilePlugin(fixture.profile, { ...fixture.config, outputBytes: 8 }, '@fixture/component')
  assert.equal(result.ok, true)
  assert.match(result.stdout, /Log: .*pnpm\.log/)
})
test('同一 profile 的并行安装通过写锁保留两个依赖', async t => {
  const fixture = await installFixture(t)
  const results = await Promise.all(['@fixture/component', '@fixture/bundle'].map(spec =>
    addProfilePlugin(fixture.profile, fixture.config, spec)))
  assert.ok(results.every(result => result.ok))
  const saved = await fixture.read()
  assert.equal(saved.dependencies['@fixture/component'], '1.0.0')
  assert.equal(saved.dependencies['@fixture/bundle'], '1.0.0')
  assert.deepEqual(saved.dsh.profile.bundles, ['@fixture/bundle'])
})
test('取消等待中的包进程后恢复文件并释放锁', async t => {
  const fixture = await installFixture(t)
  const before = await fixture.snapshot()
  const abort = new AbortController()
  const ready = fixture.started()
  const operation = addProfilePlugin(fixture.profile, fixture.config, '@fixture/wait', abort.signal)
  const marker = await ready
  const { pid } = JSON.parse(await fs.readFile(marker, 'utf8'))
  abort.abort()
  const result = await operation
  assert.equal(result.ok, false)
  assert.equal(result.application, 'cancelled')
  assert.deepEqual(await fixture.snapshot(), before)
  await assert.rejects(fs.stat(path.join(fixture.dir, 'package.json.lock')), { code: 'ENOENT' })
  await assert.rejects(fs.stat(path.join(fixture.dir, '.plugin-manager', 'run.json')), { code: 'ENOENT' })
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
})
