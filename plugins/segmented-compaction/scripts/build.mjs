// Use installed development tools without depending on workspace-root binaries.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../', import.meta.url))
function run(packageName, binary, args) {
  const directory = path.join(root, 'node_modules', packageName)
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'))
  const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin[binary]
  const result = spawnSync(process.execPath, [path.join(directory, bin), ...args], { cwd: root, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
run('typescript', 'tsc', ['-p', 'tsconfig.json', ...(process.argv.includes('--check') ? ['--noEmit'] : [])])
if (!process.argv.includes('--check')) run('tsdown', 'tsdown', ['-c', 'tsdown.config.ts'])
