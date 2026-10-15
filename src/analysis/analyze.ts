import {
  AGENT_LABELS,
  AgentError,
  AgentLimitError,
  runAgent,
  type AgentName,
} from '@uigraph/lens/agents'
import { consola } from 'consola'
import fs from 'node:fs'
import path from 'node:path'
import { inspect } from 'node:util'
import pc from 'picocolors'
import { loadArtifacts } from '../artifacts/load.js'
import { VERSION } from '../version.js'
import {
  formatApprovedDiagrams,
  type DiagramSelection,
  type PlanSubmission,
} from './plan.js'
import {
  createRepositoryTools,
  type RepositoryToolEvent,
} from './repo-access.js'
import { downloadSkill, SKILL_SOURCE } from './skill.js'

const PROMPT = fs.readFileSync(new URL('./prompt.md', import.meta.url), 'utf8')
const PLAN_PROMPT = fs.readFileSync(
  new URL('./plan-prompt.md', import.meta.url),
  'utf8'
)

const PLAN_MAX_TURNS = 100

export type Skill = Awaited<ReturnType<typeof downloadSkill>>

export type SessionSettings = {
  agent: AgentName
  model?: string
  maxBudgetUsd?: number
}

export class AnalysisError extends Error {}

export class AnalysisCancelledError extends Error {}

export class AnalysisLimitError extends AnalysisError {}

function describeToolEvent(event: RepositoryToolEvent) {
  if (event.tool === 'list_files') {
    return `list   ${event.pattern}`
  }
  if (event.tool === 'read_file') {
    return `read   ${event.path}`
  }
  if (event.tool === 'search') {
    return `search ${event.pattern}  ${pc.dim(`in ${event.glob}`)}`
  }
  if (event.tool === 'write_file') {
    return pc.green(`write  ${event.path}`)
  }
  if (event.tool === 'validate_artifacts') {
    return 'validate'
  }
  if (event.tool === 'read_skill_file') {
    return `skill  ${event.path}`
  }
  if (event.tool === 'submit_diagram_plan') {
    return pc.green(`plan   ${event.count} diagram candidates`)
  }
  throw new Error(`Unknown tool event: ${JSON.stringify(event)}`)
}

type SessionOutcome = {
  tokens: number
  costUsd: number | null
}

export function describeUsage(outcome: SessionOutcome) {
  return `${outcome.tokens.toLocaleString()} tokens${outcome.costUsd === null ? '' : ` · ~$${outcome.costUsd.toFixed(2)} estimated`}`
}

type SessionMode = 'generate' | { onPlan: (submission: PlanSubmission) => void }

async function runSession(
  root: string,
  skill: Skill,
  prompt: string,
  abortController: AbortController,
  settings: SessionSettings,
  mode: SessionMode = 'generate'
): Promise<SessionOutcome> {
  let toolCalls = 0
  const tools = createRepositoryTools(
    root,
    skill.files,
    (event) => {
      toolCalls++
      console.log(
        pc.dim(`  ${String(toolCalls).padStart(3)} `) + describeToolEvent(event)
      )
    },
    mode === 'generate' ? undefined : { onSubmit: mode.onPlan }
  )

  let outcome: SessionOutcome
  try {
    outcome = await runAgent({
      agent: settings.agent,
      cwd: root,
      systemPrompt:
        mode === 'generate'
          ? `${PROMPT}\n# UIGraph skill\n\nThe skill below was written for interactive use. The run instructions above override its approval workflow, and its file references resolve through \`read_skill_file\`.\n\n${skill.instructions}`
          : PLAN_PROMPT,
      prompt,
      tools,
      signal: abortController.signal,
      model: settings.model,
      maxBudgetUsd: settings.maxBudgetUsd,
      maxTurns: mode === 'generate' ? undefined : PLAN_MAX_TURNS,
      clientApp: `uigraph/${VERSION}`,
      log: consola.debug,
    })
  } catch (error) {
    if (abortController.signal.aborted) {
      throw new AnalysisCancelledError('Analysis cancelled')
    }
    if (error instanceof AgentLimitError) {
      throw new AnalysisLimitError(error.message, { cause: error })
    }
    if (error instanceof AgentError) {
      throw new AnalysisError(error.message, { cause: error })
    }
    throw error
  }
  if (abortController.signal.aborted) {
    throw new AnalysisCancelledError('Analysis cancelled')
  }
  return outcome
}

function printErrors(errors: string[]) {
  for (const error of errors.slice(0, 30)) {
    console.log(pc.yellow(`  • ${error}`))
  }
  if (errors.length > 30) {
    console.log(pc.yellow(`  • … ${errors.length - 30} more`))
  }
}

export async function loadSkill() {
  console.log(pc.dim(`  Downloading the UIGraph skill from ${SKILL_SOURCE}`))
  try {
    return await downloadSkill()
  } catch (error) {
    throw new AnalysisError(
      `Could not download the UIGraph skill from ${SKILL_SOURCE}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function listExistingDiagrams(root: string) {
  const entries = await fs.promises
    .readdir(path.join(root, '.uigraph', 'diagrams'), { withFileTypes: true })
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return []
      }
      throw error
    })
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

export type DiagramPlan = PlanSubmission & {
  seconds: number
  usage: SessionOutcome
}

export async function planDiagrams(
  root: string,
  repositoryName: string,
  skill: Skill,
  abortController: AbortController,
  settings: SessionSettings
): Promise<DiagramPlan | null> {
  const startedAt = Date.now()
  const existing = await listExistingDiagrams(root)
  const captured: { submission: PlanSubmission | null } = { submission: null }
  let outcome: SessionOutcome
  try {
    outcome = await runSession(
      root,
      skill,
      [
        `Propose the architecture diagrams worth generating and the existing documents worth adding for the repository "${repositoryName}" in the working directory.`,
        existing.length === 0
          ? 'No diagrams exist yet.'
          : `These diagrams already exist, so do not propose them again: ${existing.join(', ')}.`,
      ].join('\n'),
      abortController,
      settings,
      {
        onPlan: (submission) => {
          captured.submission = submission
        },
      }
    )
  } catch (error) {
    if (error instanceof AnalysisLimitError) {
      consola.debug(`Planning stopped: ${inspect(error)}`)
      return null
    }
    throw error
  }
  if (captured.submission === null) {
    return null
  }
  return {
    ...captured.submission,
    seconds: Math.round((Date.now() - startedAt) / 1000),
    usage: outcome,
  }
}

export async function generateArtifacts(
  root: string,
  repositoryName: string,
  gitRemote: string | null,
  update: boolean,
  abortController: AbortController,
  skill: Skill,
  selection: DiagramSelection | null,
  settings: SessionSettings
) {
  const startedAt = Date.now()
  const existing = await listExistingDiagrams(root)
  const first = await runSession(
    root,
    skill,
    [
      update
        ? `Update the existing UIGraph artifacts of the repository "${repositoryName}" in the working directory so they match the current code. Read the existing .uigraph.yaml and .uigraph/ files first and keep what is still correct.`
        : `Generate UIGraph artifacts for the repository "${repositoryName}" in the working directory.`,
      gitRemote === null
        ? 'The CLI found no usable git remote.'
        : `The repository's git remote is ${gitRemote}.`,
      ...(selection === null
        ? []
        : [formatApprovedDiagrams(selection, existing)]),
    ].join('\n'),
    abortController,
    settings
  )
  let outcome = first
  let { errors } = await loadArtifacts(root)

  if (errors.length > 0) {
    console.log(
      pc.yellow(
        `\nThe artifacts have ${errors.length} problem(s). Asking ${AGENT_LABELS[settings.agent]} to repair them once:`
      )
    )
    printErrors(errors)
    console.log()
    outcome = await runSession(
      root,
      skill,
      [
        'The UIGraph artifacts failed validation. Fix every problem below, re-reading files where needed, and run validate_artifacts until it passes. Remove findings you cannot support with evidence rather than guessing.',
        '',
        ...errors.map((error) => `- ${error}`),
      ].join('\n'),
      abortController,
      settings
    )
    errors = (await loadArtifacts(root)).errors
  }

  if (errors.length > 0) {
    printErrors(errors)
    throw new AnalysisError(
      `The artifacts are still invalid after one repair attempt (${errors.length} problem(s)).`
    )
  }

  const seconds = Math.round((Date.now() - startedAt) / 1000)
  console.log(pc.dim(`\n  ${seconds}s · ${describeUsage(outcome)}`))
}
