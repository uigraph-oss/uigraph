import { agentTool, type AgentTool } from '@uigraph/lens/agents'
import fs from 'node:fs/promises'
import path from 'node:path'
import { glob } from 'tinyglobby'
import { z } from 'zod'
import { loadArtifacts } from '../artifacts/load.js'
import { writeArtifactFile } from '../artifacts/write.js'
import {
  diagramCandidateSchema,
  docCandidateSchema,
  findPlanProblems,
  MAX_DIAGRAM_CANDIDATES,
  MAX_DOC_CANDIDATES,
  type PlanSubmission,
} from './plan.js'

const EXCLUDED_DIRECTORIES = [
  '.git',
  'node_modules',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.turbo',
  '.cache',
  'coverage',
  'target',
  'vendor',
  '.venv',
  'venv',
  '__pycache__',
  '.terraform',
  '.claude',
]

const SECRET_FILE_PATTERNS = [
  /^\.env(\..+)?$/,
  /\.(pem|key|p12|pfx|jks|keystore|crt|cer|der)$/,
  /^id_(rsa|dsa|ecdsa|ed25519)/,
  /^credentials/,
  /^secrets?\./,
  /^\.npmrc$/,
  /^\.netrc$/,
  /^\.pypirc$/,
  /\.tfstate(\.backup)?$/,
]

const ALLOWED_ENV_FILES = ['.env.example', '.env.sample', '.env.template']

const IGNORE_GLOBS = EXCLUDED_DIRECTORIES.map((dir) => `**/${dir}/**`)

const MAX_READ_BYTES = 200_000
const MAX_READ_LINES = 2_000
const MAX_LIST_RESULTS = 2_000
const MAX_SEARCH_MATCHES = 200
const MAX_SEARCH_FILE_BYTES = 1_000_000

export function isExcludedPath(relativePath: string) {
  const segments = relativePath.split('/')
  if (segments.some((segment) => EXCLUDED_DIRECTORIES.includes(segment))) {
    return true
  }
  const fileName = segments[segments.length - 1]
  if (ALLOWED_ENV_FILES.includes(fileName)) {
    return false
  }
  return SECRET_FILE_PATTERNS.some((pattern) => pattern.test(fileName))
}

export async function resolveRepositoryFile(root: string, requested: string) {
  const normalized = path.posix.normalize(requested.replaceAll('\\', '/'))
  if (
    normalized === '..' ||
    normalized.startsWith('../') ||
    path.isAbsolute(normalized)
  ) {
    throw new Error(`Path must be relative to the repository: ${requested}`)
  }
  const relativePath = normalized.replace(/^\.\//, '')
  if (isExcludedPath(relativePath)) {
    throw new Error(`Path is excluded from analysis: ${relativePath}`)
  }
  const absolutePath = path.join(root, relativePath)
  const realPath = await fs.realpath(absolutePath)
  if (realPath !== root && !realPath.startsWith(root + path.sep)) {
    throw new Error(`Path resolves outside the repository: ${relativePath}`)
  }
  const stat = await fs.stat(realPath)
  return { relativePath, realPath, stat }
}

export async function listRepositoryFiles(root: string, pattern: string) {
  const files = await glob(pattern, {
    cwd: root,
    ignore: IGNORE_GLOBS,
    dot: true,
    followSymbolicLinks: false,
    onlyFiles: true,
  })
  const allowed: string[] = []
  for (const file of files.sort()) {
    if (isExcludedPath(file)) {
      continue
    }
    const stat = await fs.lstat(path.join(root, file))
    if (stat.isSymbolicLink()) {
      continue
    }
    allowed.push(file)
  }
  return allowed
}

function isBinary(buffer: Buffer) {
  return buffer.subarray(0, 8000).includes(0)
}

function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }] }
}

function errorResult(error: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: error instanceof Error ? error.message : String(error),
      },
    ],
    isError: true,
  }
}

export type RepositoryToolEvent =
  | { tool: 'list_files'; pattern: string }
  | { tool: 'read_file'; path: string }
  | { tool: 'search'; pattern: string; glob: string }
  | { tool: 'write_file'; path: string }
  | { tool: 'validate_artifacts' }
  | { tool: 'read_skill_file'; path: string }
  | { tool: 'submit_diagram_plan'; count: number }

export function createRepositoryTools(
  root: string,
  skill: Map<string, string>,
  onToolUse: (event: RepositoryToolEvent) => void,
  plan?: { onSubmit: (submission: PlanSubmission) => void }
): AgentTool[] {
  const onSubmit = plan?.onSubmit

  const listFiles = agentTool(
    'list_files',
    'List repository files matching a glob pattern. Generated directories and secret files are never listed.',
    {
      pattern: z
        .string()
        .default('**/*')
        .describe('Glob relative to the repository root, e.g. src/**/*.ts'),
    },
    async ({ pattern }) => {
      onToolUse({ tool: 'list_files', pattern })
      try {
        const files = await listRepositoryFiles(root, pattern)
        const shown = files.slice(0, MAX_LIST_RESULTS)
        const more =
          files.length > shown.length
            ? `\n… ${files.length - shown.length} more files; narrow the pattern`
            : ''
        return textResult(
          shown.length === 0 ? 'No files matched.' : shown.join('\n') + more
        )
      } catch (error) {
        return errorResult(error)
      }
    }
  )

  const readFile = agentTool(
    'read_file',
    'Read a repository text file. Lines are prefixed with their line numbers.',
    {
      path: z.string().describe('Repository-relative file path'),
      offset: z
        .number()
        .int()
        .min(1)
        .default(1)
        .describe('First line to read, 1-based'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(MAX_READ_LINES)
        .default(MAX_READ_LINES)
        .describe('Maximum number of lines to read'),
    },
    async ({ path: requested, offset, limit }) => {
      onToolUse({ tool: 'read_file', path: requested })
      try {
        const { realPath, stat } = await resolveRepositoryFile(root, requested)
        if (!stat.isFile()) {
          return errorResult(`Not a file: ${requested}`)
        }
        const handle = await fs.open(realPath, 'r')
        const buffer = Buffer.alloc(Math.min(stat.size, MAX_READ_BYTES))
        await handle.read(buffer, 0, buffer.length, 0)
        await handle.close()
        if (isBinary(buffer)) {
          return errorResult(`Binary file skipped: ${requested}`)
        }
        const lines = buffer.toString('utf8').split('\n')
        const selected = lines.slice(offset - 1, offset - 1 + limit)
        const numbered = selected
          .map((line, index) => `${offset + index}\t${line}`)
          .join('\n')
        const truncated =
          stat.size > MAX_READ_BYTES
            ? `\n… file truncated at ${MAX_READ_BYTES} bytes`
            : ''
        return textResult(numbered + truncated)
      } catch (error) {
        return errorResult(error)
      }
    }
  )

  const search = agentTool(
    'search',
    'Search repository text files with a JavaScript regular expression. Returns path:line: text matches.',
    {
      pattern: z.string().describe('JavaScript regular expression'),
      glob: z
        .string()
        .default('**/*')
        .describe('Glob limiting which files are searched'),
      caseInsensitive: z.boolean().default(false),
    },
    async ({ pattern, glob: fileGlob, caseInsensitive }) => {
      onToolUse({ tool: 'search', pattern, glob: fileGlob })
      try {
        const regex = new RegExp(pattern, caseInsensitive ? 'i' : '')
        const files = await listRepositoryFiles(root, fileGlob)
        const matches: string[] = []
        for (const file of files) {
          const absolutePath = path.join(root, file)
          const stat = await fs.stat(absolutePath)
          if (stat.size > MAX_SEARCH_FILE_BYTES) {
            continue
          }
          const buffer = await fs.readFile(absolutePath)
          if (isBinary(buffer)) {
            continue
          }
          const lines = buffer.toString('utf8').split('\n')
          for (let index = 0; index < lines.length; index++) {
            if (regex.test(lines[index])) {
              matches.push(
                `${file}:${index + 1}: ${lines[index].trim().slice(0, 300)}`
              )
            }
            if (matches.length >= MAX_SEARCH_MATCHES) {
              break
            }
          }
          if (matches.length >= MAX_SEARCH_MATCHES) {
            matches.push(`… stopped at ${MAX_SEARCH_MATCHES} matches`)
            break
          }
        }
        return textResult(
          matches.length === 0 ? 'No matches.' : matches.join('\n')
        )
      } catch (error) {
        return errorResult(error)
      }
    }
  )

  const writeFile = agentTool(
    'write_file',
    'Create or replace a UIGraph artifact. Only .uigraph.yaml and files under .uigraph/ can be written.',
    {
      path: z
        .string()
        .describe('Repository-relative path: .uigraph.yaml or .uigraph/...'),
      content: z.string().describe('Complete file content'),
    },
    async ({ path: requested, content }) => {
      onToolUse({ tool: 'write_file', path: requested })
      try {
        const written = await writeArtifactFile(root, requested, content)
        return textResult(`Wrote ${written}`)
      } catch (error) {
        return errorResult(error)
      }
    }
  )

  const validateArtifacts = agentTool(
    'validate_artifacts',
    'Load .uigraph.yaml and every artifact it references the way the UIGraph viewer does, and list every problem found.',
    {},
    async () => {
      onToolUse({ tool: 'validate_artifacts' })
      const { errors } = await loadArtifacts(root)
      return textResult(
        errors.length === 0
          ? 'All artifacts are valid.'
          : errors.map((error) => `- ${error}`).join('\n')
      )
    }
  )

  const readSkillFile = agentTool(
    'read_skill_file',
    'Read a file from the UIGraph skill, e.g. references/uigraph-yaml-schema.md or assets/templates/context-example.json.',
    {
      path: z.string().describe('Path relative to the skill directory'),
    },
    async ({ path: requested }) => {
      onToolUse({ tool: 'read_skill_file', path: requested })
      const content = skill.get(
        path.posix
          .normalize(requested.replaceAll('\\', '/'))
          .replace(/^\.\//, '')
      )
      if (content === undefined) {
        return errorResult(`The skill has no file ${requested}`)
      }
      return textResult(content)
    }
  )

  function createSubmitPlanTool(submit: (submission: PlanSubmission) => void) {
    return agentTool(
      'submit_diagram_plan',
      'Submit the architecture diagrams worth generating and the existing documents worth adding for this repository. Call it exactly once, when you finish exploring.',
      {
        diagrams: z
          .array(diagramCandidateSchema)
          .min(1)
          .max(MAX_DIAGRAM_CANDIDATES),
        docs: z.array(docCandidateSchema).max(MAX_DOC_CANDIDATES),
      },
      async ({ diagrams, docs }) => {
        onToolUse({ tool: 'submit_diagram_plan', count: diagrams.length })
        try {
          const problems = findPlanProblems(diagrams)
          for (const diagram of diagrams) {
            for (const file of diagram.evidence) {
              try {
                const { stat } = await resolveRepositoryFile(root, file)
                if (!stat.isFile()) {
                  problems.push(
                    `${diagram.id}: evidence is not a file: ${file}`
                  )
                }
              } catch {
                problems.push(`${diagram.id}: evidence file not found: ${file}`)
              }
            }
          }
          for (const doc of docs) {
            if (!/\.(md|markdown|html?)$/i.test(doc.path)) {
              problems.push(`${doc.path}: not a Markdown or HTML document`)
              continue
            }
            try {
              const { stat } = await resolveRepositoryFile(root, doc.path)
              if (!stat.isFile()) {
                problems.push(`${doc.path}: document is not a file`)
              }
            } catch {
              problems.push(`${doc.path}: document not found`)
            }
          }
          if (problems.length > 0) {
            return errorResult(
              `The plan was not accepted. Fix these and submit again:\n${problems.map((problem) => `- ${problem}`).join('\n')}`
            )
          }
          submit({ diagrams, docs })
          return textResult('Plan received. Stop here.')
        } catch (error) {
          return errorResult(error)
        }
      }
    )
  }

  return onSubmit === undefined
    ? [listFiles, readFile, search, writeFile, validateArtifacts, readSkillFile]
    : [
        listFiles,
        readFile,
        search,
        readSkillFile,
        createSubmitPlanTool(onSubmit),
      ]
}
