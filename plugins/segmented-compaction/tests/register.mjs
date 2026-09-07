// Resolve public Harness package exports from the adjacent checkout, never private source imports.
import { registerHooks } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const root = process.env.HARNESS_ROOT ?? fileURLToPath(new URL('../../../../deepseek-harness/', import.meta.url))
const packages = new Map()
for (const top of ['packages', 'vendor']) {
  const base = path.join(root, top)
  for (const group of fs.readdirSync(base, { withFileTypes: true })) {
    if (!group.isDirectory()) continue
    const groupPath = path.join(base, group.name)
    const candidates = fs.existsSync(path.join(groupPath, 'package.json')) ? [groupPath]
      : fs.readdirSync(groupPath, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => path.join(groupPath, entry.name))
    for (const candidate of candidates) {
      const manifest = path.join(candidate, 'package.json')
      if (!fs.existsSync(manifest)) continue
      const json = JSON.parse(fs.readFileSync(manifest, 'utf8'))
      packages.set(json.name, { directory: candidate, manifest: json })
    }
  }
}
registerHooks({
  resolve(specifier, context, next) {
    const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]
    const pkg = packages.get(name)
    if (!pkg) return next(specifier, context)
    const leaf = specifier.slice(name.length)
    let exported = pkg.manifest.exports?.[leaf ? '.' + leaf : '.']
    if (exported && typeof exported === 'object') exported = exported.default ?? exported.import
    const target = exported ?? (leaf ? '.' + leaf : pkg.manifest.main)
    if (typeof target !== 'string') return next(specifier, context)
    return next(pathToFileURL(path.resolve(pkg.directory, target)).href, context)
  },
})
