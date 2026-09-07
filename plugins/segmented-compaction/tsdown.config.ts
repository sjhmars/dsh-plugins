/** Host ESM and client module-table bundles, with shared runtime imports external. */
import type { UserConfig } from 'tsdown'
const id = '@sjhmars/segmented-compaction'
const configs: UserConfig[] = [
  { entry: ['src/index.ts'], outDir: 'lib', format: 'esm', fixedExtension: false, platform: 'node', dts: false, clean: false,
    deps: { neverBundle: [/^@deepseek-ai\//] } },
  { entry: { client: 'src/client/index.ts' }, outDir: 'lib', format: 'cjs', platform: 'browser', dts: false, clean: false,
    deps: { neverBundle: ['react', 'react/jsx-runtime'] },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: 'window.__ModuleLoader__.load({ id: ' + JSON.stringify(id) + ', factory: (require) => {',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
      footer: 'return module.exports; } });',
    },
  },
]
export default configs
