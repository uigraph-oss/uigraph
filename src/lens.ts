import {
  analyzeReview,
  fetchReview,
  listRuns,
  readLocalReview,
  readRun,
  readSettings,
  saveSettings,
  type AgentName,
  type AnalysisState,
  type LensSettings,
  type ReviewData,
  type ReviewSource,
  type ServiceGraph,
  type StageId,
} from '@uigraph/lens/agents'
import { consola } from 'consola'
import { execFile } from 'node:child_process'
import path from 'node:path'
import { inspect, promisify } from 'node:util'
import pc from 'picocolors'
import { homeRoot, loadWorkspace } from './workspace.js'

export class LensRequestError extends Error {}

export type LensRequest =
  | { type: 'github'; pullRequest: string }
  | { type: 'local'; directory: string; base: string; target: string }

type Subscriber = {
  update: (analysis: AnalysisState) => void
  end: () => void
}

type ActiveRun = {
  review: ReviewData
  analysis: AnalysisState
  stop: AbortController
  ticket: { answer: ((keys: string[]) => void) | null }
  subscribers: Set<Subscriber>
  finished: Promise<void>
}

export type LensRunSummary = {
  runId: string
  repository: string
  number: number | null
  title: string
  status: 'running' | 'done' | 'failed'
  updatedAt: string
}

const activeRuns = new Map<string, ActiveRun>()

async function dataDirectory() {
  return path.join(await homeRoot(), '.uigraph', 'lens')
}

async function resolveGitHubToken() {
  const environmentToken =
    process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim()
  if (environmentToken) {
    return environmentToken
  }
  const token = await promisify(execFile)('gh', ['auth', 'token'], {
    timeout: 10_000,
  }).then(
    ({ stdout }) => stdout.trim(),
    () => ''
  )
  if (token === '') {
    throw new LensRequestError(
      'GitHub authentication is required. Set GITHUB_TOKEN or GH_TOKEN, or sign in with `gh auth login`, then restart the viewer.'
    )
  }
  return token
}

export async function startLensRun(
  request: LensRequest,
  regenerate: boolean,
  agent: AgentName | undefined,
  model: string | undefined
) {
  if (agent === undefined && model !== undefined) {
    throw new LensRequestError(
      'A model can only be set together with an agent.'
    )
  }
  let review: ReviewData
  let source: ReviewSource
  try {
    if (request.type === 'github') {
      const token = await resolveGitHubToken()
      review = await fetchReview({ pullRequest: request.pullRequest, token })
      source = { type: 'github', token }
    } else {
      const local = await readLocalReview(request)
      review = local.review
      source = { type: 'local', repositoryPath: local.repositoryPath }
    }
  } catch (error) {
    throw new LensRequestError(
      error instanceof Error ? error.message : String(error)
    )
  }

  const label =
    review.pullRequest.number === null
      ? `${review.repository.fullName} ${review.pullRequest.base.branch}..${review.pullRequest.head.branch}`
      : `${review.repository.fullName}#${review.pullRequest.number}`
  const settings = await readSettings(await dataDirectory())
  const stop = new AbortController()
  const ticket: ActiveRun['ticket'] = { answer: null }
  const states = analyzeReview({
    review,
    source,
    dataDirectory: await dataDirectory(),
    services: await readServiceGraph(),
    settings:
      agent === undefined
        ? settings
        : { ...settings, agent, model: model ?? '' },
    regenerate,
    signal: stop.signal,
    askTicket: () =>
      new Promise((resolve) => {
        ticket.answer = resolve
      }),
    log: (message) => consola.debug(`Lens ${label} ${message}`),
  })
  const first = await states.next()
  if (first.done) {
    throw new Error('Lens ended without reporting any progress.')
  }
  const runId = first.value.runId
  const run: ActiveRun = {
    review,
    analysis: first.value,
    stop,
    ticket,
    subscribers: new Set(),
    finished: Promise.resolve(),
  }
  activeRuns.set(runId, run)
  console.log(`${pc.cyan('Lens')} ${label} ${pc.dim(runId)}`)

  run.finished = (async () => {
    try {
      for await (const analysis of states) {
        for (const [id, stage] of Object.entries(analysis.stages)) {
          if (stage.status !== run.analysis.stages[id as StageId].status) {
            consola.debug(`Lens ${label} ${id} ${stage.status}`)
          }
        }
        run.analysis = analysis
        for (const subscriber of run.subscribers) {
          subscriber.update(analysis)
        }
      }
      console.log(`${pc.cyan('Lens')} ${label} finished ${pc.dim(runId)}`)
    } catch (error) {
      console.error(
        `${pc.red('Lens')} ${label} failed: ${error instanceof Error ? error.message : String(error)}`
      )
      consola.debug(inspect(error))
    } finally {
      activeRuns.delete(runId)
      for (const subscriber of run.subscribers) {
        subscriber.end()
      }
    }
  })()

  return runId
}

export async function getLensSettings() {
  return readSettings(await dataDirectory())
}

export async function saveLensSettings(settings: LensSettings) {
  await saveSettings(await dataDirectory(), settings)
}

export function stopLensRun(runId: string) {
  const run = activeRuns.get(runId)
  if (!run) {
    return false
  }
  run.stop.abort()
  return true
}

export function answerLensTicket(runId: string, keys: string[]) {
  const run = activeRuns.get(runId)
  const candidates = run?.analysis.ticketCandidates ?? null
  if (!run || run.ticket.answer === null || candidates === null) {
    return false
  }
  if (
    new Set(keys).size !== keys.length ||
    !keys.every((key) => candidates.some((candidate) => candidate.key === key))
  ) {
    return false
  }
  run.ticket.answer(keys)
  run.ticket.answer = null
  return true
}

export async function stopAllLensRuns() {
  const runs = [...activeRuns.values()]
  for (const run of runs) {
    run.stop.abort()
  }
  await Promise.all(runs.map((run) => run.finished))
}

export async function listLensRuns(): Promise<LensRunSummary[]> {
  const saved = await listRuns(await dataDirectory())
  const runs = [
    ...[...activeRuns.values()].map((run) => ({ ...run, running: true })),
    ...saved
      .filter((run) => !activeRuns.has(run.analysis.runId))
      .map((run) => ({ ...run, running: false })),
  ]
  return runs
    .map((run) => ({
      runId: run.analysis.runId,
      repository: run.review.repository.fullName,
      number: run.review.pullRequest.number,
      title: run.review.pullRequest.title,
      status: readStatus(run.analysis, run.running),
      updatedAt: Object.values(run.analysis.stages)
        .flatMap((stage) => [stage.startedAt, stage.completedAt])
        .reduce<string>(
          (latest, time) =>
            time !== null && time > latest ? time : latest,
          run.review.fetchedAt
        ),
    }))
    .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))
}

export async function getLensRun(runId: string) {
  const active = activeRuns.get(runId)
  if (active) {
    return { review: active.review, analysis: active.analysis, running: true }
  }
  const saved = await readRun(await dataDirectory(), runId)
  if (!saved) {
    return null
  }
  return { review: saved.review, analysis: saved.analysis, running: false }
}

export function subscribeToLensRun(runId: string, subscriber: Subscriber) {
  const run = activeRuns.get(runId)
  if (!run) {
    return null
  }
  run.subscribers.add(subscriber)
  return () => {
    run.subscribers.delete(subscriber)
  }
}

function readStatus(
  analysis: AnalysisState,
  running: boolean
): LensRunSummary['status'] {
  if (running) {
    return 'running'
  }
  return Object.values(analysis.stages).every(
    (stage) => stage.status === 'done' || stage.status === 'skipped'
  )
    ? 'done'
    : 'failed'
}

async function readServiceGraph(): Promise<ServiceGraph> {
  const { workspace } = await loadWorkspace()
  return {
    services: workspace.services.map((service) => ({
      name: service.name,
      endpoints: workspace.apiGroups
        .filter(({ group }) => group.serviceId === service.id)
        .flatMap(({ endpoints }) =>
          endpoints.map((endpoint) => ({
            method: endpoint.method,
            path: endpoint.path,
            operationId: endpoint.operationId,
          }))
        ),
      databases: workspace.databases
        .filter(({ serviceDb }) => serviceDb.serviceId === service.id)
        .map(({ serviceDb }) => serviceDb.dbName),
      diagrams: workspace.diagrams
        .filter(({ entity }) =>
          workspace.serviceDiagrams.some(
            (link) =>
              link.serviceId === service.id && link.diagramId === entity.id
          )
        )
        .map(({ entity, mermaid }) => ({ name: entity.name, mermaid })),
      docs: workspace.docs
        .filter(({ serviceDoc }) => serviceDoc.serviceId === service.id)
        .map(({ serviceDoc }) => ({
          name: serviceDoc.doc.fileName,
          description: serviceDoc.doc.description,
        })),
    })),
    links: workspace.dependencies.map((dependency) => {
      const target = dependency.dependency?.name ?? dependency.dependencyName
      const link = {
        type: dependency.type,
        criticality: dependency.criticality,
        endpoints: dependency.apiEndpointNames,
        database: dependency.databaseName,
        description: dependency.description,
      }
      if (dependency.direction === 'downstream') {
        return { consumer: dependency.service.name, provider: target, ...link }
      }
      if (dependency.direction === 'upstream') {
        return { consumer: target, provider: dependency.service.name, ...link }
      }
      throw new Error(
        `Unknown dependency direction: ${String(dependency.direction)}`
      )
    }),
  }
}
