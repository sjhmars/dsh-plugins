/**
 * Host-only tsdown config: bundles tsc-emitted sources so `@Remote` decorators
 * are already transpiled. electron stays external for the Desktop dynamic import.
 */
import type { UserConfig } from 'tsdown'

const PLUGIN_ID = '@sjhmars/task-notify'

const libConfig: UserConfig = {
  name: PLUGIN_ID,
  entry: ['lib/types/index.js', 'lib/types/invariant.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  deps: { neverBundle: ['electron'] },
}

export default [libConfig]
