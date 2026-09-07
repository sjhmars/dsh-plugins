// Link this plugin's development dependencies to the adjacent Harness checkout.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../', import.meta.url))
const harness = process.env.HARNESS_ROOT ?? fileURLToPath(new URL('../../../../deepseek-harness/', import.meta.url))
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const known = new Map()
for (const top of ['packages', 'vendor']) {
  const base = path.join(harness, top)
  for (const group of fs.readdirSync(base, { withFileTypes: true })) {
    if (!group.isDirectory()) continue
    const dir = path.join(base, group.name)
    const candidates = fs.existsSync(path.join(dir, 'package.json')) ? [dir] : fs.readdirSync(dir, { withFileTypes: true })
      .filter(p => p.isDirectory()).map(p => path.join(dir, p.name))
    for (const candidate of candidates) {
      if (!fs.existsSync(path.join(candidate, 'package.json'))) continue
      const json = JSON.parse(fs.readFileSync(path.join(candidate, 'package.json'), 'utf8'))
      known.set(json.name, candidate)
    }
  }
}
for (const name of Object.keys({ ...manifest.peerDependencies, ...manifest.devDependencies })) {
  let target = known.get(name) ?? path.join(harness, 'node_modules', name)
  if (!fs.existsSync(target)) {
    const store = path.join(harness, 'node_modules', '.pnpm')
    const candidates = fs.readdirSync(store).filter(entry => entry.startsWith(name.replace('/', '+') + '@'))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
    const entry = candidates.find(entry => fs.existsSync(path.join(store, entry, 'node_modules', name)))
    if (entry) target = path.join(store, entry, 'node_modules', name)
  }
  if (!fs.existsSync(target)) throw new Error('Build/install dependency missing in Harness: ' + name)
  const destination = path.join(root, 'node_modules', name)
  if (fs.existsSync(destination)) continue
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.symlinkSync(fs.realpathSync(target), destination, process.platform === 'win32' ? 'junction' : 'dir')
}
console.log('Development peers linked inside this plugin only.')
