import { describe, expect, it } from 'vitest'
import { isExcludedPath } from './repo-access.js'

describe('isExcludedPath', () => {
  it.each([
    ['.env', true],
    ['config/.env.production', true],
    ['.env.example', false],
    ['certs/server.pem', true],
    ['node_modules/pkg/index.js', true],
    ['packages/app/dist/index.js', true],
    ['src/environment.ts', false],
  ])('%s → %s', (file, excluded) => {
    expect(isExcludedPath(file)).toBe(excluded)
  })
})
