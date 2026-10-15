import { copyFileSync, cpSync, rmSync } from 'node:fs'
import { defineConfig } from 'tsdown'
import packageJSON from './package.json' with { type: 'json' }

export default defineConfig({
  entry: { bin: './src/bin.ts' },
  outDir: './dist',
  tsconfig: './tsconfig.json',
  target: 'node20',
  format: ['esm'],
  dts: false,
  clean: false,
  minify: 'dce-only',

  onSuccess: () => {
    copyFileSync('src/assets/uigraph-mark.png', 'dist/uigraph-mark.png')
    rmSync('dist/schema', { recursive: true, force: true })
    cpSync('src/graphql/schema', 'dist/schema', { recursive: true })
  },

  deps: {
    neverBundle: [
      /^node:/,
      ...Object.keys(packageJSON.dependencies).map(
        (dep) => new RegExp(`(^${dep}$)|(^${dep}/)`)
      ),
    ],
  },
})
