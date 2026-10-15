import fs from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { homeRoot } from './workspace.js'

const LOCK_FILE = path.join('.uigraph', 'viewer.lock.json')

const lockSchema = z.object({
  pid: z.number().int().positive(),
  port: z.number().int().min(1).max(65535),
})

export type ViewerLock = z.infer<typeof lockSchema>

async function lockPath() {
  return path.join(await homeRoot(), LOCK_FILE)
}

function isAlive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

export async function readViewerLock(): Promise<ViewerLock | null> {
  const file = await lockPath()
  const text = await fs.readFile(file, 'utf8').catch(() => null)
  if (text === null) {
    return null
  }
  let lock: ViewerLock
  try {
    lock = lockSchema.parse(JSON.parse(text))
  } catch {
    await fs.rm(file, { force: true })
    return null
  }
  if (!isAlive(lock.pid)) {
    await fs.rm(file, { force: true })
    return null
  }
  return lock
}

export async function writeViewerLock(lock: ViewerLock) {
  const file = await lockPath()
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, JSON.stringify(lock), { mode: 0o600 })
}

export async function removeViewerLock(pid: number) {
  const current = await readViewerLock()
  if (current?.pid === pid) {
    await fs.rm(await lockPath(), { force: true })
  }
}
