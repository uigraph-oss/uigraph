import {
  AgentError,
  AgentLimitError,
  runAgent,
  type AgentTool,
} from '@uigraph/lens/agents'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRepo, ORDERS_CONFIG, ORDERS_FILES } from '../test-repo.js'
import {
  AnalysisCancelledError,
  AnalysisError,
  AnalysisLimitError,
  generateArtifacts,
  planDiagrams,
} from './analyze.js'

vi.mock('@uigraph/lens/agents', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@uigraph/lens/agents')>()),
  runAgent: vi.fn(),
}))

type Session = Parameters<typeof runAgent>[0]

const SKILL = {
  instructions: 'Skill instructions',
  files: new Map<string, string>(),
}
const SETTINGS = { agent: 'claude' as const }

const CANDIDATE = {
  id: 'checkout',
  name: 'Checkout flow',
  type: 'flowchart' as const,
  summary: 'How an order is paid.',
  evidence: ['src/server.ts'],
  recommended: true,
}

let sessions: Session[]

function scriptSessions(...scripts: ((session: Session) => Promise<void>)[]) {
  vi.mocked(runAgent).mockImplementation(async (session) => {
    sessions.push(session)
    const script = scripts[sessions.length - 1]
    if (script === undefined) {
      throw new Error(`Unexpected session ${sessions.length}`)
    }
    await script(session)
    return { tokens: 1000, costUsd: 0.01 }
  })
}

async function call(session: Session, name: string, input: object) {
  const tool = session.tools.find((item: AgentTool) => item.name === name)
  if (tool === undefined) {
    throw new Error(`The session has no ${name} tool`)
  }
  const result = await tool.execute(input)
  return { isError: result.isError === true, text: result.content[0].text }
}

async function writeFiles(session: Session, files: Record<string, string>) {
  for (const [file, content] of Object.entries(files)) {
    const result = await call(session, 'write_file', { path: file, content })
    if (result.isError) {
      throw new Error(result.text)
    }
  }
}

async function createSourceRepo() {
  return createRepo({ 'src/server.ts': 'export const port = 8080\n' })
}

beforeEach(() => {
  sessions = []
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('planDiagrams', () => {
  it('rejects a bad plan and accepts a fixed one', async () => {
    const root = await createSourceRepo()
    const rejections: string[] = []
    scriptSessions(async (session) => {
      const rejected = await call(session, 'submit_diagram_plan', {
        diagrams: [
          { ...CANDIDATE, evidence: ['src/missing.ts'], recommended: false },
        ],
        docs: [{ path: 'README.txt', name: 'Readme', summary: 'Intro.' }],
      })
      expect(rejected.isError).toBe(true)
      rejections.push(rejected.text)
      expect(
        await call(session, 'submit_diagram_plan', {
          diagrams: [CANDIDATE],
          docs: [],
        })
      ).toEqual({
        isError: false,
        text: 'Plan received. Stop here.',
      })
    })

    const plan = await planDiagrams(
      root,
      'shop',
      SKILL,
      new AbortController(),
      SETTINGS
    )

    expect(rejections[0].split('\n')).toEqual([
      'The plan was not accepted. Fix these and submit again:',
      '- Mark between 1 and 8 diagrams as recommended (found 0)',
      '- checkout: evidence file not found: src/missing.ts',
      '- README.txt: not a Markdown or HTML document',
    ])
    expect(plan).toMatchObject({
      diagrams: [CANDIDATE],
      docs: [],
      usage: { tokens: 1000 },
    })
    expect(sessions[0].tools.map((tool: AgentTool) => tool.name)).toEqual([
      'list_files',
      'read_file',
      'search',
      'read_skill_file',
      'submit_diagram_plan',
    ])
    expect(sessions[0].prompt).toContain('No diagrams exist yet.')
  })

  it('tells the agent which diagrams already exist', async () => {
    const root = await createRepo(ORDERS_FILES)
    scriptSessions(async () => {})
    expect(
      await planDiagrams(root, 'shop', SKILL, new AbortController(), SETTINGS)
    ).toBeNull()
    expect(sessions[0].prompt).toContain(
      'These diagrams already exist, so do not propose them again: checkout.'
    )
  })

  it('gives up on the plan when the agent hits its limit', async () => {
    const root = await createSourceRepo()
    scriptSessions(async () => {
      throw new AgentLimitError('Reached the turn limit')
    })
    expect(
      await planDiagrams(root, 'shop', SKILL, new AbortController(), SETTINGS)
    ).toBeNull()
  })
})

describe('generateArtifacts', () => {
  it('writes valid artifacts in one session', async () => {
    const root = await createSourceRepo()
    scriptSessions(async (session) => {
      await writeFiles(session, ORDERS_FILES)
      expect(await call(session, 'validate_artifacts', {})).toEqual({
        isError: false,
        text: 'All artifacts are valid.',
      })
    })

    await generateArtifacts(
      root,
      'shop',
      'https://github.com/acme/shop',
      false,
      new AbortController(),
      SKILL,
      { diagrams: [CANDIDATE], docs: [], focus: 'payments' },
      SETTINGS
    )

    expect(sessions).toHaveLength(1)
    expect(sessions[0].prompt).toContain(
      'Generate UIGraph artifacts for the repository "shop"'
    )
    expect(sessions[0].prompt).toContain(
      "The repository's git remote is https://github.com/acme/shop."
    )
    expect(sessions[0].prompt).toContain(
      '- checkout | Checkout flow | flowchart | How an order is paid. | evidence: src/server.ts'
    )
    expect(sessions[0].prompt).toContain(
      'The owner asked you to focus on: "payments".'
    )
    expect(sessions[0].systemPrompt).toContain('Skill instructions')
    expect(sessions[0].tools.map((tool: AgentTool) => tool.name)).toContain(
      'write_file'
    )
  })

  it('asks the agent to repair invalid artifacts once', async () => {
    const root = await createSourceRepo()
    const files = { ...ORDERS_FILES }
    const openApi = files['.uigraph/apis/openapi.yaml']
    delete (files as Partial<typeof files>)['.uigraph/apis/openapi.yaml']
    scriptSessions(
      async (session) => {
        await writeFiles(session, files)
      },
      async (session) => {
        expect(session.prompt).toMatch(
          /^The UIGraph artifacts failed validation\.[\s\S]*\n- \.uigraph\.yaml: apis\[REST\]: /
        )
        await writeFiles(session, { '.uigraph/apis/openapi.yaml': openApi })
      }
    )

    await generateArtifacts(
      root,
      'shop',
      null,
      true,
      new AbortController(),
      SKILL,
      null,
      SETTINGS
    )

    expect(sessions).toHaveLength(2)
    expect(sessions[0].prompt).toContain(
      'Update the existing UIGraph artifacts'
    )
    expect(sessions[0].prompt).toContain('The CLI found no usable git remote.')
  })

  it('fails when the repair does not fix the artifacts', async () => {
    const root = await createSourceRepo()
    scriptSessions(
      async (session) => {
        await writeFiles(session, { '.uigraph.yaml': ORDERS_CONFIG })
      },
      async () => {}
    )
    await expect(
      generateArtifacts(
        root,
        'shop',
        null,
        false,
        new AbortController(),
        SKILL,
        null,
        SETTINGS
      )
    ).rejects.toThrow(
      new AnalysisError(
        'The artifacts are still invalid after one repair attempt (4 problem(s)).'
      )
    )
  })

  it('turns agent errors into analysis errors', async () => {
    const root = await createSourceRepo()
    scriptSessions(async () => {
      throw new AgentError('Not logged in')
    })
    const error = await generateArtifacts(
      root,
      'shop',
      null,
      false,
      new AbortController(),
      SKILL,
      null,
      SETTINGS
    ).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(AnalysisError)
    expect(error).not.toBeInstanceOf(AnalysisLimitError)
    expect(error).toMatchObject({ message: 'Not logged in' })

    scriptSessions(async () => {
      throw new AgentLimitError('Budget reached')
    })
    sessions = []
    await expect(
      generateArtifacts(
        root,
        'shop',
        null,
        false,
        new AbortController(),
        SKILL,
        null,
        SETTINGS
      )
    ).rejects.toBeInstanceOf(AnalysisLimitError)
  })

  it('reports a cancelled run', async () => {
    const root = await createSourceRepo()
    const abortController = new AbortController()
    scriptSessions(async () => {
      abortController.abort()
    })
    await expect(
      generateArtifacts(
        root,
        'shop',
        null,
        false,
        abortController,
        SKILL,
        null,
        SETTINGS
      )
    ).rejects.toBeInstanceOf(AnalysisCancelledError)
  })
})
