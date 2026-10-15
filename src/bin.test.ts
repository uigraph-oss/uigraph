import { execFile } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createRepo, ORDERS_FILES } from './test-repo.js'
import { VERSION } from './version.js'

const BIN = path.resolve('dist/bin.mjs')

let home: string
let root: string
let port: number

async function findFreePort() {
  const probe = net.createServer()
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve))
  const address = probe.address()
  if (address === null || typeof address === 'string') {
    throw new Error('Could not find a free port')
  }
  await new Promise((resolve) => probe.close(resolve))
  return address.port
}

function uigraph(...args: string[]) {
  return new Promise<{ code: number; stdout: string; stderr: string }>(
    (resolve) => {
      execFile(
        process.execPath,
        [BIN, ...args],
        {
          env: {
            ...process.env,
            HOME: home,
            UIGRAPH_PORT: String(port),
            NO_COLOR: '1',
          },
          timeout: 30_000,
        },
        (error, stdout, stderr) => {
          resolve({
            code: error === null ? 0 : Number(error.code),
            stdout,
            stderr,
          })
        }
      )
    }
  )
}

beforeAll(async () => {
  home = await createRepo({})
  root = await createRepo(ORDERS_FILES)
  port = await findFreePort()
})

afterAll(async () => {
  await uigraph('stop')
})

describe('uigraph CLI', () => {
  it('prints its version', async () => {
    expect(await uigraph('--version')).toMatchObject({
      code: 0,
      stdout: `${VERSION}\n`,
    })
  })

  it('registers valid artifacts with sync', async () => {
    const result = await uigraph('sync', root)
    expect(result.code).toBe(0)
    expect(result.stdout).toContain(
      `Registered with the viewer (http://127.0.0.1:${port}/)`
    )
  })

  it('refuses to sync invalid artifacts', async () => {
    const repository = await createRepo({ '.uigraph.yaml': 'version: 3\n' })
    const result = await uigraph('sync', repository)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('The UIGraph artifacts are invalid')
    expect(result.stderr).toContain('version: Invalid input: expected 1')
  })

  it('explains that a repository without artifacts needs generate', async () => {
    const repository = await createRepo({ 'README.md': '# Shop' })
    const result = await uigraph('sync', repository)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain(
      `${repository} has no UIGraph artifacts. Run "uigraph generate" to generate them.`
    )
  })

  it('needs a terminal to generate', async () => {
    const repository = await createRepo({ 'README.md': '# Shop' })
    const result = await uigraph('generate', repository)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('"uigraph generate" needs a terminal.')
  })

  it('needs both branches for a local Lens review', async () => {
    const result = await uigraph('lens', '--base', 'main')
    expect(result.code).toBe(1)
    expect(result.stderr).toContain(
      'Pass a pull request, or both --base and --target.'
    )
  })

  it('starts, reports and stops the viewer', async () => {
    expect(await uigraph('status')).toMatchObject({
      code: 1,
      stdout: expect.stringContaining('UIGraph viewer is not running.'),
    })

    const opened = await uigraph('open', '--no-open', root)
    expect(opened).toMatchObject({ code: 0, stderr: '' })
    expect(opened.stdout).toContain('running in the background')
    expect(opened.stdout).toContain('Registered with the viewer')

    const health = await fetch(`http://127.0.0.1:${port}/__uigraph`)
    expect(await health.text()).toBe('uigraph')

    const running = await uigraph('status')
    expect(running.code).toBe(0)
    expect(running.stdout).toContain(
      `UIGraph viewer is running at http://127.0.0.1:${port}/`
    )
    expect(running.stdout).toContain(root)

    const stopped = await uigraph('stop')
    expect(stopped.code).toBe(0)
    expect(stopped.stdout).toMatch(/Stopped the UIGraph viewer \(pid \d+\)\./)
    await expect(fetch(`http://127.0.0.1:${port}/__uigraph`)).rejects.toThrow()
  })
})
