#!/usr/bin/env node
import {
  Command,
  InvalidArgumentError,
  Option,
} from '@commander-js/extra-typings'
import { select } from '@inquirer/prompts'
import { AGENT_LABELS, AGENT_NAMES, type AgentName } from '@uigraph/lens/agents'
import { consola, LogLevels } from 'consola'
import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { inspect, promisify } from 'node:util'
import open from 'open'
import pc from 'picocolors'
import {
  loadArtifacts,
  ROOT_CONFIG,
  type ArtifactDb,
} from './artifacts/load.js'
import { showBanner } from './banner.js'
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
  listRegisteredProjects,
  syncProject,
  type SyncResult,
} from './workspace.js'

const GENERATE_HINT =
  'Ask your coding agent to generate them with the UIGraph skill (npx skills add uigraph-oss/skills).'

const GET_STARTED = `${pc.bold('Get started')}
  1. Install the UIGraph skill for your coding agent:
       ${pc.cyan('npx skills add uigraph-oss/skills')}
  2. In your repository, ask the agent:
       ${pc.cyan('Generate UIGraph artifacts for this repo')}
  3. Your artifacts appear in the viewer.
`

if (process.env.UIGRAPH_DEBUG === '1') {
  consola.level = LogLevels.debug
}

class UsageError extends Error {}

function fail(message: string, exitCode = 1): never {
  console.error(pc.red(`✖ ${message}`))
  process.exit(exitCode)
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

async function registerProject(root: string, port: number) {
  const { db, errors } = await loadArtifacts(root)
  if (errors.length > 0) {
    console.error(
      pc.red(
        `✖ The UIGraph artifacts are invalid:\n${errors.map((error) => `  • ${error}`).join('\n')}\n  Fix them, or ask your coding agent to fix them with the UIGraph skill.`
      )
    )
    return false
  }
  printSummary(db)
  return reportSync(root, await syncProject(root), port)
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
    console.log(GET_STARTED)
    return null
  }
  const server = await startServer(port)
  await writeViewerLock({ pid: process.pid, port })
  console.log(`\n${pc.bold('UIGraph viewer')} running at ${pc.cyan(url)}\n`)
  console.log(GET_STARTED)
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
    'Browse the UIGraph artifacts of every registered repository in one local\nviewer, and review pull requests with Lens.'
  )
  .version(VERSION, '-v, --version')
  .option(
    '--debug',
    'Print stack traces, agent output and Lens progress (also UIGRAPH_DEBUG=1)'
  )
  .showHelpAfterError('(run uigraph --help for usage)')
  .addHelpText(
    'after',
    '\nA repository literally named "open", "sync", "start", "status", "stop",\n"restart" or "lens" can be passed as ./start.'
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
    'Start the viewer, show the artifacts of a repository in it, and open it (default)'
  )
  .argument('[repository]', 'Repository path (default: current directory)')
  .addOption(portOption())
  .option('--no-open', 'Do not open a browser')
  .action(async (repository, options) => {
    const root = await resolveRepository(repository)
    await startViewer(options.port, 'background')
    const hasArtifacts = await pathExists(path.join(root, ROOT_CONFIG))
    let synced = true
    if (hasArtifacts) {
      console.log(`Opening the UIGraph artifacts in ${pc.cyan(root)}`)
      synced = await registerProject(root, options.port)
    } else {
      console.log(`${root} has no UIGraph artifacts. ${GENERATE_HINT}`)
    }
    if (options.open) {
      await openBrowser(serverUrl(options.port))
    }
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
      throw new UsageError(`${root} has no UIGraph artifacts. ${GENERATE_HINT}`)
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
