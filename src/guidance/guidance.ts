import { readFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { writeArtifactFile } from '../artifacts/write.js'

const TEMPLATE = readFileSync(new URL('./agents.md', import.meta.url), 'utf8')
const AGENT_FILES = ['CLAUDE.md', 'AGENTS.md']

export const GUIDANCE_FILE = '.uigraph/AGENTS.md'

const REFERENCE = `## UIGraph

If your change adds or changes API endpoints, database schemas, calls to other services, or a flow shown in a diagram, read \`${GUIDANCE_FILE}\` and follow it.
`

export async function writeGuidance(root: string) {
  await writeArtifactFile(root, GUIDANCE_FILE, TEMPLATE)
  const files: string[] = []
  for (const file of AGENT_FILES) {
    const target = path.join(root, file)
    const text = await fs
      .readFile(target, 'utf8')
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') {
          return null
        }
        throw error
      })
    if (text === null) {
      continue
    }
    files.push(file)
    if (text.includes(GUIDANCE_FILE)) {
      continue
    }
    if (text === '' || text.endsWith('\n\n')) {
      await fs.appendFile(target, REFERENCE)
    } else if (text.endsWith('\n')) {
      await fs.appendFile(target, `\n${REFERENCE}`)
    } else {
      await fs.appendFile(target, `\n\n${REFERENCE}`)
    }
  }
  if (files.length === 0) {
    await fs.writeFile(path.join(root, 'AGENTS.md'), REFERENCE, { flag: 'wx' })
    files.push('AGENTS.md')
  }
  return files
}
