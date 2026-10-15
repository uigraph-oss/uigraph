import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { version } = require('../package.json') as { version: string }

export const VERSION = version

export const BUILD_ID = createHash('sha1')
  .update(readFileSync(new URL(import.meta.url)))
  .digest('hex')
  .slice(0, 8)
