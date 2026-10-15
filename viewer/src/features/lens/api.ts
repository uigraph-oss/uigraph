import type { AnalysisState, LensSettings, ReviewData } from '@uigraph/lens/ui'

export type LensRunSummary = {
  runId: string
  repository: string
  number: number | null
  title: string
  status: 'running' | 'done' | 'failed'
  updatedAt: string
}

export type LensRun = {
  review: ReviewData
  analysis: AnalysisState
  running: boolean
}

export async function getLensRuns() {
  const response = await fetch('/api/lens/runs')
  if (!response.ok) {
    throw new Error(`Lens runs could not be loaded (${response.status}).`)
  }
  return (await response.json()) as LensRunSummary[]
}

export async function getLensRun(runId: string) {
  const response = await fetch(`/api/lens/runs/${runId}`)
  if (response.status === 404) {
    return null
  }
  if (!response.ok) {
    throw new Error(`The Lens run could not be loaded (${response.status}).`)
  }
  return (await response.json()) as LensRun
}

export async function getLensSettings() {
  const response = await fetch('/api/lens/settings')
  if (!response.ok) {
    throw new Error(`Lens settings could not be loaded (${response.status}).`)
  }
  return (await response.json()) as LensSettings
}

export async function saveLensSettings(settings: LensSettings) {
  const response = await fetch('/api/lens/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
  if (!response.ok) {
    throw new Error(`Lens settings could not be saved (${response.status}).`)
  }
  return (await response.json()) as LensSettings
}

export async function startLensRun(pullRequest: string) {
  const response = await fetch('/api/lens/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      request: { type: 'github', pullRequest },
      regenerate: false,
    }),
  })
  if (!response.ok) {
    throw new Error(`The Lens run could not be started (${response.status}).`)
  }
  return ((await response.json()) as { runId: string }).runId
}

export async function stopLensRun(runId: string) {
  const response = await fetch(`/api/lens/runs/${runId}/stop`, {
    method: 'POST',
  })
  if (!response.ok && response.status !== 404) {
    throw new Error(`The Lens run could not be stopped (${response.status}).`)
  }
}

export async function answerLensTicket(runId: string, keys: string[]) {
  const response = await fetch(`/api/lens/runs/${runId}/ticket`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keys }),
  })
  if (!response.ok) {
    throw new Error(`The answer could not be sent (${response.status}).`)
  }
}
