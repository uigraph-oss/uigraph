import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

let directory: string

export async function setup() {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tests-'))
  process.env.TMPDIR = directory
}

export async function teardown() {
  await fs.rm(directory, { recursive: true, force: true })
}
