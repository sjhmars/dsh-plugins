import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addProfilePlugin, isInstallProfile, parseNpmPackageName } from '../src/add.ts'

test('接受合法 npm 包名', () => {
  assert.equal(parseNpmPackageName('@sjhmars/task-notify'), '@sjhmars/task-notify')
  assert.equal(parseNpmPackageName('left-pad'), 'left-pad')
})

test('拒绝路径、协议与版本后缀', () => {
  assert.equal(parseNpmPackageName('../plugin'), undefined)
  assert.equal(parseNpmPackageName('file:./x'), undefined)
  assert.equal(parseNpmPackageName('github:org/repo'), undefined)
  assert.equal(parseNpmPackageName('left-pad@1.0.0'), undefined)
  assert.equal(parseNpmPackageName('@sjhmars/task-notify extra'), undefined)
  assert.equal(parseNpmPackageName(''), undefined)
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
