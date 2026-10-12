/** Test-only package manager: deterministic manifests and controlled process outcomes. */
import fs from 'node:fs/promises'
import path from 'node:path'
const [command, spec] = process.argv.slice(2)
const packages = JSON.parse(await fs.readFile(process.env.INSTALLER_TEST_CATALOGUE, 'utf8'))
const name = spec?.lastIndexOf('@') > 0 ? spec.slice(0, spec.lastIndexOf('@')) : spec
const metadata = packages[name]
if (!metadata) throw Error('unknown fixture package: ' + spec)
if (command === 'view') {
  console.log(JSON.stringify(metadata))
} else if (command === 'add') {
  const installed = path.join(process.cwd(), 'node_modules', name)
  await fs.mkdir(installed, { recursive: true })
  await fs.writeFile(path.join(installed, 'package.json'), JSON.stringify(metadata) + '\n')
  if (name === '@fixture/bundle') await fs.writeFile(path.join(installed, 'cordis.patch.yml'), '[]\n')
  const file = path.join(process.cwd(), 'package.json')
  const manifest = JSON.parse(await fs.readFile(file, 'utf8'))
  manifest.dependencies[name] = metadata.version
  await fs.writeFile(file, JSON.stringify(manifest, null, 2) + '\n')
  await fs.writeFile(path.join(process.cwd(), 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n# fixture update\n')
  console.log('Installed ' + name + '@' + metadata.version)
  if (name === '@fixture/failure') {
    console.error('controlled package-manager failure')
    process.exitCode = 7
  }
  if (name === '@fixture/wait') {
    await fs.writeFile(path.join(process.env.INSTALLER_TEST_HOME, 'waiting.json'), JSON.stringify({ pid: process.pid }))
    setInterval(() => {}, 60_000)
  }
} else {
  throw Error('unsupported fixture command: ' + command)
}
