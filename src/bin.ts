#!/usr/bin/env node
import {
  Command,
  InvalidArgumentError,
  Option,
} from '@commander-js/extra-typings'
import { checkbox, confirm, input, select } from '@inquirer/prompts'
import { AGENT_LABELS, AGENT_NAMES, type AgentName } from '@uigraph/lens/agents'
import { consola, LogLevels } from 'consola'
import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { inspect, promisify } from 'node:util'
import open from 'open'
import pc from 'picocolors'
import {
  AnalysisCancelledError,
  AnalysisError,
  describeUsage,
  generateArtifacts,
  loadSkill,
  planDiagrams,
  type DiagramPlan,
  type SessionSettings,
  type Skill,
} from './analysis/analyze.js'
import type {
  DiagramCandidate,
  DiagramSelection,
  DocCandidate,
} from './analysis/plan.js'
import { listRepositoryFiles } from './analysis/repo-access.js'
import {
  loadArtifacts,
  ROOT_CONFIG,
  type ArtifactDb,
} from './artifacts/load.js'
import { showBanner } from './banner.js'
import { GUIDANCE_FILE, writeGuidance } from './guidance/guidance.js'
import type { LensRequest } from './lens.js'
import { readViewerLock, removeViewerLock, writeViewerLock } from './lock.js'
import {
  DEFAULT_PORT,
  getViewerInfo,
  isServerRunning,
  serverUrl,
  startServer,
} from './server.js'
import { BUILD_ID, VERSION } from './version.js'
import {
  homeRoot,
  isGuidanceDeclined,
  listRegisteredProjects,
  setGuidanceDeclined,
  syncProject,
  type SyncResult,
} from './workspace.js'

const ARTIFACT_ENTRIES = [ROOT_CONFIG, '.uigraph']

if (process.env.UIGRAPH_DEBUG === '1') {
  consola.level = LogLevels.debug
}

class UsageError extends Error {}

function fail(message: string, exitCode = 1): never {
  console.error(pc.red(`✖ ${message}`))
  process.exit(exitCode)
}

async function withCancellation<T>(
  message: string,
  work: (abortController: AbortController) => Promise<T>
) {
  const abortController = new AbortController()
  let signals = 0
  function onSignal() {
    signals++
    if (signals > 1) {
      console.error(pc.red('\nForced exit.'))
      process.exit(130)
    }
    console.log(pc.yellow(`\n${message} (press Ctrl+C again to force quit)`))
    abortController.abort()
  }
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)
  try {
    return await work(abortController)
  } finally {
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
  }
}

async function resolveRepository(input: string | undefined) {
  const requested = path.resolve(input ?? process.cwd())
  let realPath: string
  try {
    realPath = await fs.realpath(requested)
  } catch {
    throw new UsageError(`Repository not found: ${requested}`)
  }
  const stat = await fs.stat(realPath)
  if (!stat.isDirectory()) {
    throw new UsageError(`Not a directory: ${realPath}`)
  }
  return realPath
}

function describeLimits(settings: SessionSettings) {
  if (settings.maxBudgetUsd !== undefined) {
    return `  • Each Claude session is capped at $${settings.maxBudgetUsd.toFixed(2)}.`
  }
  if (settings.agent === 'claude') {
    return '  • No spending cap is set (see --max-budget); usage counts against your Claude plan or API account.'
  }
  return `  • Usage counts against your ${AGENT_LABELS[settings.agent]} plan or API account.`
}

async function chooseAgent(agent: AgentName | undefined, question: string) {
  if (agent !== undefined) {
    return agent
  }
  if (!process.stdin.isTTY) {
    throw new UsageError(
      `Choose an agent with --agent (${AGENT_NAMES.join(', ')}).`
    )
  }
  return select({
    message: question,
    choices: AGENT_NAMES.map((name) => ({
      name: AGENT_LABELS[name],
      value: name,
    })),
  })
}

async function confirmAnalysis(root: string, settings: SessionSettings) {
  const agent = AGENT_LABELS[settings.agent]
  console.log(
    [
      '',
      `${pc.bold('uigraph')} will generate UIGraph artifacts for ${pc.cyan(root)} with ${agent}.`,
      '',
      `  • ${agent} reads selected repository files (manifests, source, configs) and sends`,
      settings.agent === 'opencode'
        ? '    their contents to its model provider, using provider API keys from your environment.'
        : `    their contents to its model provider, using your ${agent} login or API key.`,
      `  • ${agent} first proposes which diagrams to generate and which existing docs to add,`,
      '    and you choose. Nothing is written until you do.',
      `  • ${agent} writes ${ROOT_CONFIG} and files under .uigraph/ in the repository. Nothing else`,
      '    is changed. If generation fails, the previous artifacts are restored.',
      describeLimits(settings),
      '',
    ].join('\n')
  )
  if (await confirm({ message: 'Continue?', default: false })) {
    return true
  }
  console.log(pc.yellow(`Cancelled. Nothing was sent to ${agent}.`))
  return false
}

async function promptForDiagrams(
  candidates: readonly DiagramCandidate[],
  preselected: ReadonlySet<string>,
  docCandidates: readonly DocCandidate[],
  agent: AgentName
): Promise<DiagramSelection> {
  const diagrams = await checkbox({
    message: `${AGENT_LABELS[agent]} found ${candidates.length} ${candidates.length === 1 ? 'diagram' : 'diagrams'} worth generating. Pick the ones to generate.`,
    choices: candidates.map((diagram) => ({
      name: `${diagram.name}  ${pc.cyan(diagram.type)}`,
      value: diagram,
      checked: preselected.has(diagram.id),
      description: `${diagram.summary}\nevidence: ${diagram.evidence.join(', ')}`,
    })),
    pageSize: candidates.length,
  })
  const docs =
    docCandidates.length === 0
      ? []
      : await checkbox({
          message: `${AGENT_LABELS[agent]} found ${docCandidates.length} existing ${docCandidates.length === 1 ? 'document' : 'documents'} in the repository. Pick the ones to add to the viewer.`,
          choices: docCandidates.map((doc) => ({
            name: `${doc.name}  ${pc.cyan(doc.path)}`,
            value: doc,
            checked: true,
            description: doc.summary,
          })),
          pageSize: docCandidates.length,
        })
  const focus = (
    await input({
      message:
        'Anything in particular to focus on? (optional, press Enter to skip)',
    })
  ).trim()
  return {
    diagrams,
    docs,
    focus: focus === '' ? null : focus,
  }
}

async function chooseDiagrams(
  root: string,
  skill: Skill,
  settings: SessionSettings
): Promise<DiagramSelection | null> {
  console.log(pc.bold('\nLooking for diagrams worth generating…\n'))
  let plan: DiagramPlan | null
  try {
    plan = await withCancellation('Cancelling…', (abortController) =>
      planDiagrams(root, path.basename(root), skill, abortController, settings)
    )
  } catch (error) {
    if (error instanceof AnalysisCancelledError) {
      fail('Cancelled. Nothing was written.', 130)
    }
    if (error instanceof AnalysisError) {
      fail(`${error.message}\n  Nothing was written.`)
    }
    throw error
  }
  if (plan === null) {
    console.log(
      pc.yellow(
        '\nCould not build a diagram plan. Generating the default set instead.'
      )
    )
    return null
  }
  console.log(
    pc.dim(
      `\n  ${plan.diagrams.length} diagram and ${plan.docs.length} document candidates · ${plan.seconds}s · ${describeUsage(plan.usage)}`
    )
  )
  const recommended = new Set(
    plan.diagrams.filter((diagram) => diagram.recommended).map(({ id }) => id)
  )
  return promptForDiagrams(
    plan.diagrams,
    recommended,
    plan.docs,
    settings.agent
  )
}

async function downloadSkillOrFail() {
  try {
    return await loadSkill()
  } catch (error) {
    if (error instanceof AnalysisError) {
      fail(error.message)
    }
    throw error
  }
}

async function countAnalyzableFiles(root: string) {
  const files = await listRepositoryFiles(root, '**/*')
  if (files.length === 0) {
    fail(
      'The repository has no analyzable files (generated directories and secret files are skipped). Nothing was sent to an agent.'
    )
  }
  return files.length
}

async function findGitRemote(root: string) {
  const remote = await promisify(execFile)(
    'git',
    ['-C', root, 'remote', 'get-url', 'origin'],
    { timeout: 10_000 }
  ).then(
    ({ stdout }) => stdout.trim(),
    () => null
  )
  if (remote === null) {
    return null
  }
  const match =
    /^(?:https:\/\/|ssh:\/\/git@|git@)(github\.com|gitlab\.com|bitbucket\.org)[:/](.+?)(?:\.git)?\/?$/.exec(
      remote
    )
  if (match === null) {
    return null
  }
  return `https://${match[1]}/${match[2]}`
}

async function pathExists(file: string) {
  return fs.lstat(file).then(
    () => true,
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return false
      }
      throw error
    }
  )
}

async function backupArtifacts(root: string) {
  const backup = await fs.mkdtemp(path.join(os.tmpdir(), 'uigraph-'))
  for (const entry of ARTIFACT_ENTRIES) {
    if (await pathExists(path.join(root, entry))) {
      await fs.cp(path.join(root, entry), path.join(backup, entry), {
        recursive: true,
        verbatimSymlinks: true,
      })
    }
  }
  return backup
}

async function restoreArtifacts(root: string, backup: string) {
  for (const entry of ARTIFACT_ENTRIES) {
    await fs.rm(path.join(root, entry), { recursive: true, force: true })
    if (await pathExists(path.join(backup, entry))) {
      await fs.cp(path.join(backup, entry), path.join(root, entry), {
        recursive: true,
        verbatimSymlinks: true,
      })
    }
  }
}

async function runGeneration(
  root: string,
  fileCount: number,
  update: boolean,
  skill: Skill,
  selection: DiagramSelection | null,
  settings: SessionSettings
) {
  const gitRemote = await findGitRemote(root)
  const backup = await backupArtifacts(root)
  console.log(
    pc.bold(
      `\nGenerating artifacts from ${fileCount} ${fileCount === 1 ? 'file' : 'files'} with ${AGENT_LABELS[settings.agent]}…\n`
    )
  )
  try {
    await withCancellation('Cancelling generation…', (abortController) =>
      generateArtifacts(
        root,
        path.basename(root),
        gitRemote,
        update,
        abortController,
        skill,
        selection,
        settings
      )
    )
    console.log(
      pc.green(`\n✔ Artifacts written to ${ROOT_CONFIG} and .uigraph/`)
    )
  } catch (error) {
    await restoreArtifacts(root, backup)
    if (error instanceof AnalysisCancelledError) {
      fail('Generation cancelled. The previous artifacts were restored.', 130)
    }
    if (error instanceof AnalysisError) {
      fail(`${error.message}\n  The previous artifacts were restored.`)
    }
    throw error
  } finally {
    await fs.rm(backup, { recursive: true, force: true })
  }
}

function printSummary(db: ArtifactDb) {
  const endpoints = db.apiGroups.reduce(
    (count, { endpoints }) => count + endpoints.length,
    0
  )
  console.log(
    pc.dim(
      `  ${db.services.length} services · ${endpoints} endpoints · ${db.dependencies.length} dependencies · ${db.diagrams.length} diagrams`
    )
  )
}

type GenerationOptions = {
  agent: AgentName | undefined
  model: string | undefined
  maxBudgetUsd: number | undefined
}

async function generate(
  root: string,
  hasArtifacts: boolean,
  options: GenerationOptions
) {
  const fileCount = await countAnalyzableFiles(root)
  const settings: SessionSettings = {
    agent: await chooseAgent(
      options.agent,
      'Which agent should generate the artifacts?'
    ),
    model: options.model,
    maxBudgetUsd: options.maxBudgetUsd,
  }
  if (settings.agent !== 'claude' && settings.maxBudgetUsd !== undefined) {
    throw new UsageError(
      `--max-budget only works with Claude. ${AGENT_LABELS[settings.agent]} does not support a spending cap.`
    )
  }
  if (!(await confirmAnalysis(root, settings))) {
    return false
  }
  const skill = await downloadSkillOrFail()
  const selection = await chooseDiagrams(root, skill, settings)
  await runGeneration(root, fileCount, hasArtifacts, skill, selection, settings)
  return true
}

async function registerProject(root: string, port: number) {
  const { db, errors } = await loadArtifacts(root)
  if (errors.length > 0) {
    console.error(
      pc.red(
        `✖ The UIGraph artifacts are invalid:\n${errors.map((error) => `  • ${error}`).join('\n')}\n  Fix them or run "uigraph generate --update".`
      )
    )
    return false
  }
  printSummary(db)
  return reportSync(root, await syncProject(root), port)
}

async function offerGuidance(root: string, hasGuidance: boolean) {
  const accepted = await confirm({
    message: hasGuidance
      ? 'Update the UIGraph instructions for coding agents?'
      : 'Add UIGraph instructions for coding agents?',
    default: true,
  })
  await setGuidanceDeclined(root, !accepted)
  if (!accepted) {
    console.log(pc.dim('  Run "uigraph init" to add them later.'))
    return
  }
  const files = await writeGuidance(root)
  console.log(
    pc.green(
      `✔ Wrote ${GUIDANCE_FILE} and linked it from ${files.join(' and ')}`
    )
  )
}

function reportSync(root: string, result: SyncResult, port: number) {
  if (result.synced) {
    console.log(pc.green(`✔ Registered with the viewer (${serverUrl(port)})`))
    return true
  }
  console.error(
    pc.red(
      `✖ The viewer will not show this repository. ${root} ${result.reason}`
    )
  )
  return false
}

const STALE_HELP = 'Run "uigraph restart" to replace it.'

async function findListeningPid(port: number) {
  const pid = await promisify(execFile)(
    'lsof',
    ['-ti', `tcp:${port}`, '-sTCP:LISTEN'],
    { timeout: 5000 }
  ).then(
    ({ stdout }) => Number.parseInt(stdout.split('\n')[0] ?? '', 10),
    () => Number.NaN
  )
  return Number.isInteger(pid) && pid > 0 ? pid : null
}

async function stopViewerProcess(port: number) {
  const lock = await readViewerLock()
  const pid =
    lock !== null && lock.port === port
      ? lock.pid
      : await findListeningPid(port)
  if (pid === null || pid === process.pid) {
    return false
  }
  try {
    process.kill(pid, 'SIGTERM')
  } catch {
    return false
  }
  for (let waited = 0; waited < 5000; waited += 100) {
    if (!(await isServerRunning(port))) {
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return false
}

async function describeStaleViewer(port: number) {
  const info = await getViewerInfo(port)
  if (info === null) {
    return null
  }
  if (info === 'legacy') {
    return 'An older uigraph viewer is running and may not show your changes.'
  }
  return info.build === BUILD_ID
    ? null
    : `A viewer from a different build (${info.version}, ${info.build}) is running and may not show your changes.`
}

type Viewer = Awaited<ReturnType<typeof startServer>>

async function viewerLogPath() {
  return path.join(await homeRoot(), '.uigraph', 'viewer.log')
}

async function startViewer(
  port: number,
  mode: 'foreground' | 'background'
): Promise<Viewer | null> {
  await showBanner()
  const url = serverUrl(port)
  const stale = await describeStaleViewer(port)
  if (stale !== null) {
    console.log(pc.yellow(`${stale} Restarting it.`))
    if (!(await stopViewerProcess(port))) {
      fail(
        `Could not stop it. Stop whatever listens on port ${port} (lsof -ti :${port} | xargs kill), then run this command again.`
      )
    }
  }
  if (await isServerRunning(port)) {
    console.log(
      `\n${pc.bold('UIGraph viewer')} is already running at ${pc.cyan(url)}`
    )
    return null
  }
  if (mode === 'background') {
    const logFile = await viewerLogPath()
    await fs.mkdir(path.dirname(logFile), { recursive: true })
    const log = await fs.open(logFile, 'a')
    await log.write(
      `\n--- ${new Date().toISOString()} uigraph ${VERSION} ---\n`
    )
    spawn(
      process.execPath,
      [...process.execArgv, process.argv[1]!, 'start', '--port', String(port)],
      { detached: true, stdio: ['ignore', log.fd, log.fd] }
    ).unref()
    await log.close()
    for (let waited = 0; !(await isServerRunning(port)); waited += 100) {
      if (waited >= 10000) {
        fail(
          `The viewer did not start in the background. See ${logFile}, or run "uigraph start" to see why.`
        )
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    console.log(
      `\n${pc.bold('UIGraph viewer')} running in the background at ${pc.cyan(url)}`
    )
    console.log(pc.dim(`  Logs: ${logFile}`))
    console.log(pc.dim('  Run "uigraph stop" to stop it.\n'))
    return null
  }
  const server = await startServer(port)
  await writeViewerLock({ pid: process.pid, port })
  console.log(`\n${pc.bold('UIGraph viewer')} running at ${pc.cyan(url)}\n`)
  return server
}

function holdViewer(server: Viewer) {
  console.log(pc.dim('\nPress Ctrl+C to stop.\n'))
  let stopping = false
  async function stop() {
    if (stopping) {
      process.exit(0)
    }
    stopping = true
    await server.close()
    await removeViewerLock(process.pid)
    console.log(pc.dim('\nViewer stopped.'))
    process.exit(0)
  }
  process.on('SIGINT', () => void stop())
  process.on('SIGTERM', () => void stop())
}

async function openBrowser(url: string) {
  try {
    await open(url)
  } catch {
    console.log(pc.yellow(`Could not open a browser. Open ${url} manually.`))
  }
}

async function resolvePullRequest(input: string) {
  if (!/^\d+$/.test(input)) {
    return input
  }
  const remote = await findGitRemote(process.cwd())
  if (remote === null || !remote.startsWith('https://github.com/')) {
    throw new UsageError(
      'A bare pull request number needs a GitHub origin remote in the current directory. Pass a pull request URL or owner/repo#number instead.'
    )
  }
  return `${remote}/pull/${input}`
}

async function lens(
  request: LensRequest,
  regenerate: boolean,
  agent: AgentName,
  model: string | undefined,
  port: number,
  noOpen: boolean
) {
  const viewer = await startViewer(port, 'foreground')
  const response = await fetch(`${serverUrl(port)}api/lens/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ request, regenerate, agent, model }),
  })
  const text = await response.text()
  if (response.ok) {
    const { runId } = JSON.parse(text) as { runId: string }
    const url = `${serverUrl(port)}lens/${runId}`
    console.log(`${pc.bold('Lens')} review at ${pc.cyan(url)}`)
    if (!noOpen) {
      await openBrowser(url)
    }
  } else {
    const isJson = (response.headers.get('content-type') ?? '').startsWith(
      'application/json'
    )
    console.error(
      pc.red(
        `✖ ${isJson ? (JSON.parse(text) as { error: string }).error : text}`
      )
    )
    process.exitCode = 1
  }
  if (viewer !== null) {
    holdViewer(viewer)
  }
}

async function status(port: number) {
  const lock = await readViewerLock()
  const effectivePort = lock?.port ?? port
  const running = await isServerRunning(effectivePort)
  if (running) {
    console.log(
      `UIGraph viewer is running at ${pc.cyan(serverUrl(effectivePort))}${lock === null ? '' : pc.dim(` (pid ${lock.pid})`)}`
    )
    console.log(pc.dim(`  Logs: ${await viewerLogPath()}`))
    const stale = await describeStaleViewer(effectivePort)
    if (stale !== null) {
      console.log(pc.yellow(`  ${stale}\n  ${STALE_HELP}`))
    }
  } else {
    console.log('UIGraph viewer is not running.')
    process.exitCode = 1
  }
  const projects = await listRegisteredProjects()
  if (projects.length === 0) {
    console.log(pc.dim('No repositories are registered.'))
    return
  }
  console.log(pc.bold('\nRegistered repositories'))
  for (const { root, problem } of projects) {
    console.log(
      problem === null
        ? `  ${pc.green('✔')} ${root}`
        : `  ${pc.red('✖')} ${root}\n      ${problem}`
    )
  }
}

async function stopViewer(port: number) {
  const lock = await readViewerLock()
  if (lock === null) {
    if (await isServerRunning(port)) {
      if (await stopViewerProcess(port)) {
        console.log(`Stopped the UIGraph viewer on port ${port}.`)
        return
      }
      console.error(
        pc.red(
          `✖ A viewer is running on port ${port} but could not be stopped. Try: lsof -ti :${port} | xargs kill`
        )
      )
      process.exitCode = 1
      return
    }
    console.log('UIGraph viewer is not running.')
    return
  }
  if (await stopViewerProcess(lock.port)) {
    console.log(`Stopped the UIGraph viewer (pid ${lock.pid}).`)
    return
  }
  console.error(
    pc.red(
      `✖ The UIGraph viewer (pid ${lock.pid}) could not be stopped. Try: kill ${lock.pid}`
    )
  )
  process.exitCode = 1
}

function parseNumber(min: number, max: number, integer: boolean) {
  return (raw: string) => {
    const value = Number(raw)
    if (
      raw.trim() === '' ||
      !Number.isFinite(value) ||
      value < min ||
      value > max ||
      (integer && !Number.isInteger(value))
    ) {
      throw new InvalidArgumentError(
        `Expected ${integer ? 'an integer' : 'a number'} between ${min} and ${max}.`
      )
    }
    return value
  }
}

const parsePort = parseNumber(1, 65535, true)
const parseBudget = parseNumber(0.01, 10_000, false)

function agentOption() {
  return new Option('--agent <name>', 'Coding agent to use').choices(
    AGENT_NAMES
  )
}

function portOption() {
  return new Option('--port <number>', 'Viewer port')
    .env('UIGRAPH_PORT')
    .default(DEFAULT_PORT)
    .argParser(parsePort)
}

const program = new Command()
  .name('uigraph')
  .description(
    'Generate UIGraph artifacts for a repository with a coding agent (Claude Code,\nCodex, OpenCode, Pi or Cursor) and browse every registered repository in one\nlocal viewer.'
  )
  .version(VERSION, '-v, --version')
  .option(
    '--debug',
    'Print stack traces, agent output and Lens progress (also UIGRAPH_DEBUG=1)'
  )
  .showHelpAfterError('(run uigraph --help for usage)')
  .addHelpText(
    'after',
    '\nA repository literally named "open", "init", "generate", "sync", "start",\n"status", "stop", "restart" or "lens" can be passed as ./start.'
  )
  .hook('preAction', () => {
    if (program.opts().debug === true) {
      process.env.UIGRAPH_DEBUG = '1'
      consola.level = LogLevels.debug
    }
  })

program
  .command('open', { isDefault: true })
  .description(
    'Start the viewer, offer to generate artifacts if there are none, and open it (default)'
  )
  .argument('[repository]', 'Repository path (default: current directory)')
  .addOption(agentOption())
  .option(
    '--model <name>',
    "Model to use for generation, in the agent's own format"
  )
  .option(
    '--max-budget <usd>',
    'Spending cap per Claude session (planning, generation and repair each get one). Claude only',
    parseBudget
  )
  .addOption(portOption())
  .option('--no-open', 'Do not open a browser')
  .action(async (repository, options) => {
    const root = await resolveRepository(repository)
    await startViewer(options.port, 'background')
    const hasArtifacts = await pathExists(path.join(root, ROOT_CONFIG))
    let generated = false
    if (hasArtifacts) {
      console.log(`Opening the UIGraph artifacts in ${pc.cyan(root)}`)
      console.log(pc.dim('  Run "uigraph generate --update" to update them.'))
    } else if (!process.stdin.isTTY) {
      console.log(
        `${root} has no UIGraph artifacts. Run "uigraph generate" in a terminal to generate them.`
      )
    } else if (
      await confirm({
        message: `${root} has no UIGraph artifacts. Generate them with an agent?`,
        default: true,
      })
    ) {
      generated = await generate(root, false, {
        agent: options.agent,
        model: options.model,
        maxBudgetUsd: options.maxBudget,
      })
    }
    const synced =
      hasArtifacts || generated
        ? await registerProject(root, options.port)
        : true
    if (
      process.stdin.isTTY &&
      (hasArtifacts || generated) &&
      !(await pathExists(path.join(root, GUIDANCE_FILE))) &&
      !(await isGuidanceDeclined(root))
    ) {
      await offerGuidance(root, false)
    }
    if (options.open) {
      await openBrowser(serverUrl(options.port))
    }
    if (!synced) {
      process.exitCode = 1
    }
  })

program
  .command('init')
  .description(
    'Generate artifacts if there are none, then add or update the instructions for coding agents'
  )
  .argument('[repository]', 'Repository path (default: current directory)')
  .addOption(agentOption())
  .option(
    '--model <name>',
    "Model to use for generation, in the agent's own format"
  )
  .option(
    '--max-budget <usd>',
    'Spending cap per Claude session (planning, generation and repair each get one). Claude only',
    parseBudget
  )
  .action(async (repository, options) => {
    const root = await resolveRepository(repository)
    if (!process.stdin.isTTY) {
      throw new UsageError('"uigraph init" needs a terminal.')
    }
    if (!(await pathExists(path.join(root, ROOT_CONFIG)))) {
      const generated = await generate(root, false, {
        agent: options.agent,
        model: options.model,
        maxBudgetUsd: options.maxBudget,
      })
      if (!generated) {
        process.exitCode = 130
        return
      }
    }
    const synced = await registerProject(
      root,
      parsePort(process.env.UIGRAPH_PORT ?? String(DEFAULT_PORT))
    )
    await offerGuidance(root, await pathExists(path.join(root, GUIDANCE_FILE)))
    if (!synced) {
      process.exitCode = 1
    }
  })

program
  .command('generate')
  .description('Generate artifacts, or update them after asking, then exit')
  .argument('[repository]', 'Repository path (default: current directory)')
  .option('--update', 'Regenerate existing artifacts without asking')
  .addOption(agentOption())
  .option(
    '--model <name>',
    "Model to use for generation, in the agent's own format"
  )
  .option(
    '--max-budget <usd>',
    'Spending cap per Claude session (planning, generation and repair each get one). Claude only',
    parseBudget
  )
  .action(async (repository, options) => {
    const root = await resolveRepository(repository)
    if (!process.stdin.isTTY) {
      throw new UsageError('"uigraph generate" needs a terminal.')
    }
    const hasArtifacts = await pathExists(path.join(root, ROOT_CONFIG))
    if (
      hasArtifacts &&
      options.update !== true &&
      !(await confirm({
        message: `${root} already has UIGraph artifacts. Update them?`,
        default: false,
      }))
    ) {
      console.log('Nothing was changed.')
      return
    }
    const generated = await generate(root, hasArtifacts, {
      agent: options.agent,
      model: options.model,
      maxBudgetUsd: options.maxBudget,
    })
    if (!generated) {
      process.exitCode = 130
      return
    }
    const synced = await registerProject(
      root,
      parsePort(process.env.UIGRAPH_PORT ?? String(DEFAULT_PORT))
    )
    if (!synced) {
      process.exitCode = 1
    }
  })

program
  .command('sync')
  .description('Show the artifacts of a repository in the viewer, then exit')
  .argument('[repository]', 'Repository path (default: current directory)')
  .action(async (repository) => {
    const root = await resolveRepository(repository)
    if (!(await pathExists(path.join(root, ROOT_CONFIG)))) {
      throw new UsageError(
        `${root} has no UIGraph artifacts. Run "uigraph generate" to generate them.`
      )
    }
    const synced = await registerProject(
      root,
      parsePort(process.env.UIGRAPH_PORT ?? String(DEFAULT_PORT))
    )
    if (!synced) {
      process.exitCode = 1
    }
  })

program
  .command('start')
  .description('Start the viewer')
  .addOption(portOption())
  .action(async (options) => {
    const viewer = await startViewer(options.port, 'foreground')
    if (viewer !== null) {
      holdViewer(viewer)
    }
  })

program
  .command('status')
  .description('Show the viewer and every registered repository')
  .addOption(portOption())
  .action((options) => status(options.port))

program
  .command('stop')
  .description('Stop a running viewer')
  .addOption(portOption())
  .action((options) => stopViewer(options.port))

program
  .command('restart')
  .description('Stop a running viewer and start it in this terminal')
  .addOption(portOption())
  .action(async (options) => {
    await stopViewer(options.port)
    if (process.exitCode === 1) {
      return
    }
    const viewer = await startViewer(options.port, 'foreground')
    if (viewer !== null) {
      holdViewer(viewer)
    }
  })

program
  .command('lens')
  .description('Review a GitHub pull request, or two branches, with Lens')
  .argument(
    '[pull-request]',
    'Pull request URL, owner/repo#number, or a number in the current repository'
  )
  .option('--base <branch>', 'Branch or commit to compare against')
  .option('--target <branch>', 'Branch or commit to review')
  .option('--regenerate', 'Run a new review instead of reusing a completed one')
  .addOption(agentOption())
  .option(
    '--model <name>',
    "Model to use, in the agent's own format (default: the agent's default)"
  )
  .addOption(portOption())
  .option('--no-open', 'Do not open a browser')
  .action(async (pullRequest, options) => {
    let request: LensRequest
    if (pullRequest !== undefined) {
      if (options.base !== undefined || options.target !== undefined) {
        throw new UsageError(
          'Pass a pull request, or --base with --target, not both.'
        )
      }
      request = {
        type: 'github',
        pullRequest: await resolvePullRequest(pullRequest),
      }
    } else if (options.base !== undefined && options.target !== undefined) {
      request = {
        type: 'local',
        directory: process.cwd(),
        base: options.base,
        target: options.target,
      }
    } else {
      throw new UsageError('Pass a pull request, or both --base and --target.')
    }
    await lens(
      request,
      options.regenerate === true,
      await chooseAgent(options.agent, 'Which agent should run the review?'),
      options.model,
      options.port,
      !options.open
    )
  })

program.parseAsync().catch((error: unknown) => {
  if (error instanceof Error && error.name === 'ExitPromptError') {
    fail('Cancelled.', 130)
  }
  if (error instanceof UsageError) {
    fail(`${error.message}\n\nRun uigraph --help for usage.`)
  }
  if (consola.level >= LogLevels.debug) {
    fail(inspect(error))
  }
  fail(
    `${error instanceof Error ? error.message : String(error)}\n  Run with --debug for details.`
  )
})
