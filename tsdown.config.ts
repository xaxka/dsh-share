import { readFileSync } from 'node:fs'
import { defineConfig } from 'tsdown'

const PACKAGE_ID = 'dsh-share'
// __ModuleLoader__ 按请求的 npm 包名匹配注册 id，必须与 package.json 的 name 一致。
const MODULE_NAME = JSON.parse(readFileSync(new URL('package.json', import.meta.url), 'utf8')).name

export default defineConfig([
  {
    name: PACKAGE_ID,
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    format: 'esm',
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
  },
  {
    name: `${PACKAGE_ID}/client`,
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    fixedExtension: false,
    dts: false,
    clean: false,
    deps: {
      onlyBundle: ['html-to-image', 'turndown', 'turndown-plugin-gfm'],
      neverBundle: ['react', 'react-dom', 'react-dom/client', '@deepseek-ai/dsh-client-ui-primitives', '@mixmark-io/domino'],
    },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(MODULE_NAME)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
