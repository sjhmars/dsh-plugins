/** Bundle the Host plugin while retaining Harness runtime imports. */
import type { UserConfig } from 'tsdown'

const PLUGIN_ID = '@sjhmars/pi-ai-thinking'

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
  deps: { neverBundle: [/^@deepseek-ai\//] },
}

export default [libConfig]
