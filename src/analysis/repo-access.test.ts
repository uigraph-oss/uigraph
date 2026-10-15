import fs from 'node:fs/promises'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { createRepo, ORDERS_FILES } from '../test-repo.js'
import {
  createRepositoryTools,
  isExcludedPath,
  type RepositoryToolEvent,
} from './repo-access.js'

let root: string
const events: RepositoryToolEvent[] = []
let tools: ReturnType<typeof createRepositoryTools>

async function call(name: string, input: object) {
  const tool = tools.find((item) => item.name === name)
  if (tool === undefined) {
    throw new Error(`No tool named ${name}`)
  }
  const result = await tool.execute(input)
  return { isError: result.isError === true, text: result.content[0].text }
}

beforeAll(async () => {
  root = await createRepo({
    'src/server.ts':
      'export const port = 8080\nexport const host = "0.0.0.0"\n',
    '.env': 'SECRET=1',
    '.env.example': 'SECRET=',
    'deploy/id_rsa': 'key',
    'node_modules/pkg/index.js': 'module.exports = 1',
  })
  await fs.symlink('/etc/hosts', path.join(root, 'src/hosts'))
  tools = createRepositoryTools(
    root,
    new Map([['references/docs.md', 'Docs reference']]),
    (event) => events.push(event)
  )
})

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

describe('repository tools', () => {
  it('lists files without secrets, generated folders or symbolic links', async () => {
    expect(await call('list_files', { pattern: '**/*' })).toEqual({
      isError: false,
      text: '.env.example\nsrc/server.ts',
    })
  })

  it('reads files with line numbers', async () => {
    expect(
      await call('read_file', { path: 'src/server.ts', offset: 2, limit: 1 })
    ).toEqual({ isError: false, text: '2\texport const host = "0.0.0.0"' })
  })

  it.each([
    ['.env', 'Path is excluded from analysis: .env'],
    ['deploy/id_rsa', 'Path is excluded from analysis: deploy/id_rsa'],
    [
      '../outside.txt',
      'Path must be relative to the repository: ../outside.txt',
    ],
    ['src/hosts', 'Path resolves outside the repository: src/hosts'],
  ])('refuses to read %s', async (file, message) => {
    expect(await call('read_file', { path: file })).toEqual({
      isError: true,
      text: message,
    })
  })

  it('searches with a regular expression', async () => {
    expect(
      await call('search', { pattern: 'PORT =', caseInsensitive: true })
    ).toEqual({
      isError: false,
      text: 'src/server.ts:1: export const port = 8080',
    })
  })

  it('writes only UIGraph artifacts', async () => {
    expect(
      await call('write_file', { path: 'src/server.ts', content: 'hacked' })
    ).toEqual({
      isError: true,
      text: 'Only .uigraph.yaml and files under .uigraph/ can be written: src/server.ts',
    })
    expect(
      await fs.readFile(path.join(root, 'src/server.ts'), 'utf8')
    ).toContain('port = 8080')
    expect(
      await call('write_file', { path: '.uigraph/notes.md', content: 'ok' })
    ).toEqual({ isError: false, text: 'Wrote .uigraph/notes.md' })
  })

  it('validates the artifacts the way the viewer loads them', async () => {
    for (const [file, content] of Object.entries(ORDERS_FILES)) {
      await call('write_file', { path: file, content })
    }
    expect(await call('validate_artifacts', {})).toEqual({
      isError: false,
      text: 'All artifacts are valid.',
    })
    await call('write_file', { path: '.uigraph.yaml', content: 'version: 3\n' })
    expect((await call('validate_artifacts', {})).text).toBe(
      '- .uigraph.yaml: version: Invalid input: expected 1'
    )
  })

  it('reads skill files', async () => {
    expect(
      await call('read_skill_file', { path: './references/docs.md' })
    ).toEqual({ isError: false, text: 'Docs reference' })
    expect(await call('read_skill_file', { path: 'missing.md' })).toEqual({
      isError: true,
      text: 'The skill has no file missing.md',
    })
  })

  it('reports every tool use', () => {
    expect(events.map((event) => event.tool)).toContain('write_file')
    expect(events.map((event) => event.tool)).toContain('validate_artifacts')
  })
})
