import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  addProfilePlugin,
  entryBelongsToPackage,
  isInstallProfile,
  parseNpmPackageName,
} from '../src/add.ts'

test('接受合法 npm 包名', () => {
  assert.deepEqual(parseNpmPackageName('@sjhmars/task-notify'), { name: '@sjhmars/task-notify', version: undefined })
  assert.deepEqual(parseNpmPackageName('left-pad'), { name: 'left-pad', version: undefined })
})

test('接受可选版本后缀', () => {
  assert.deepEqual(parseNpmPackageName('left-pad@1.0.0'), { name: 'left-pad', version: '1.0.0' })
  assert.deepEqual(parseNpmPackageName('@sjhmars/task-notify@0.2.0'), { name: '@sjhmars/task-notify', version: '0.2.0' })
  assert.deepEqual(parseNpmPackageName('left-pad@latest'), { name: 'left-pad', version: 'latest' })
  assert.deepEqual(parseNpmPackageName('left-pad@^1.2.3'), { name: 'left-pad', version: '^1.2.3' })
})

test('拒绝路径、协议与畸形输入', () => {
  assert.equal(parseNpmPackageName('../plugin'), undefined)
  assert.equal(parseNpmPackageName('file:./x'), undefined)
  assert.equal(parseNpmPackageName('github:org/repo'), undefined)
  assert.equal(parseNpmPackageName('left-pad@'), undefined)
  assert.equal(parseNpmPackageName('left-pad@@1.0'), undefined)
  assert.equal(parseNpmPackageName('@sjhmars/task-notify extra'), undefined)
  assert.equal(parseNpmPackageName(''), undefined)
})

test('Loader 行能认出官方包名和 file:// 热挂路径', () => {
  const pkg = '@sjhmars/task-notify'
  assert.equal(entryBelongsToPackage(pkg, pkg), true)
  assert.equal(entryBelongsToPackage(`${pkg}?hot=abc`, pkg), true)
  assert.equal(entryBelongsToPackage(
    'file:///C:/Users/x/.dsh/profiles/web/node_modules/@sjhmars/task-notify/lib/index.js?hot=m8k',
    pkg,
  ), true)
  assert.equal(entryBelongsToPackage(
    'file:///C:/x/.pnpm/@sjhmars+task-notify@0.1.0/node_modules/@sjhmars/task-notify/lib/index.js?hot=1',
    pkg,
  ), true)
  assert.equal(entryBelongsToPackage(
    'file:///C:/x/node_modules/@sjhmars/task-notify-extra/lib/index.js?hot=1',
    pkg,
  ), false)
  assert.equal(entryBelongsToPackage(
    'file:///C:/x/node_modules/left-pad/index.js?hot=1',
    'left-pad',
  ), true)
  assert.equal(entryBelongsToPackage('@sjhmars/happy-bridge', pkg), false)
  assert.equal(entryBelongsToPackage(undefined, pkg), false)
})

test('只允许 web 与 desktop 两套 profile', () => {
  assert.equal(isInstallProfile('web'), true)
  assert.equal(isInstallProfile('desktop'), true)
  assert.equal(isInstallProfile('headless'), false)
  const result = addProfilePlugin('headless', 'left-pad', '.')
  assert.equal(result.ok, false)
  assert.equal(result.code, 2)
  assert.match(result.stderr, /web 或 desktop/)
})

