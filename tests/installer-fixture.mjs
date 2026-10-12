/** Private profiles and a local pnpm carrier for real package-operation tests. */
import fs from 'node:fs/promises'
import { watch, existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { initProfile } from '@deepseek-ai/dsh-app-boot'

export async function installFixture(t, profileName = 'web') {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-installer-'))
  t.after(() => fs.rm(home, { recursive: true, force: true }))
  const dir = path.join(home, 'profiles', profileName)
  initProfile(dir, [])
  await fs.writeFile(path.join(home, 'package.json'), '{"name":"installer-fixture"}\n')
  const catalogue = path.join(home, 'catalogue.json')
  const packages = {
    '@fixture/component': { name: '@fixture/component', version: '1.0.0' },
    '@deepseek-ai/dsh-web-search-exa': { name: '@deepseek-ai/dsh-web-search-exa', version: '0.2.1-alpha.1',
      peerDependencies: { '@deepseek-ai/dsh-web': '0.2.1-alpha.1' } },
    '@fixture/bundle': { name: '@fixture/bundle', version: '1.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } } },
    '@fixture/failure': { name: '@fixture/failure', version: '1.0.0' },
    '@fixture/wait': { name: '@fixture/wait', version: '1.0.0' },
    '@fixture/incompatible': { name: '@fixture/incompatible', version: '1.0.0',
      peerDependencies: { '@deepseek-ai/dsh-web': '^0.1.0' } },
    '@fixture/bad-bundle': { name: '@fixture/bad-bundle', version: '1.0.0', dsh: { bundle: { patch: './missing.yml' } } },
  }
  await fs.writeFile(catalogue, JSON.stringify(packages))
  const packageManager = {
    command: process.execPath,
    args: [fileURLToPath(new URL('./installer-pnpm.mjs', import.meta.url))],
    env: { INSTALLER_TEST_CATALOGUE: catalogue, INSTALLER_TEST_HOME: home },
  }
  const profile = {
    name: profileName, dir, patchPath: path.join(dir, 'cordis.patch.yml'),
    installAnchor: path.join(home, 'package.json'), cwd: home, home, packageManager,
    startedBundles: [], overlays: [], telemetryDisabledEnv: undefined,
  }
  const config = { profile: profileName, pnpmCommand: 'unused', outputBytes: 16_384,
    lockWaitMs: 30_000, idleTimeoutMs: 30_000, lookupTimeoutMs: 30_000 }
  const read = async () => JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'))
  const snapshot = async () => ({
    manifest: await fs.readFile(path.join(dir, 'package.json'), 'utf8'),
    lock: await fs.readFile(path.join(dir, 'pnpm-lock.yaml'), 'utf8').catch(error => {
      if (error.code !== 'ENOENT') throw error
      return undefined
    }),
    patch: await fs.readFile(profile.patchPath, 'utf8'),
  })
  const seed = async (name, version, selected = false) => {
    const json = await read()
    json.dependencies[name] = version
    if (selected) json.dsh.profile.bundles.push(name)
    const installed = path.join(dir, 'node_modules', name)
    await fs.mkdir(installed, { recursive: true })
    await fs.writeFile(path.join(installed, 'package.json'), JSON.stringify({ ...packages[name], name, version }))
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify(json, null, 2) + '\n')
    await fs.writeFile(path.join(dir, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n# original\n')
  }
  const started = () => new Promise((resolve, reject) => {
    const marker = path.join(home, 'waiting.json')
    const check = () => {
      if (!existsSync(marker)) return
      watcher.close()
      clearTimeout(timer)
      resolve(marker)
    }
    const watcher = watch(home, check)
    const timer = setTimeout(() => { watcher.close(); reject(Error('pnpm fixture did not become ready')) }, 30_000)
    t.after(() => { watcher.close(); clearTimeout(timer) })
    check()
  })
  return { home, dir, profile, config, read, snapshot, seed, started }
}
