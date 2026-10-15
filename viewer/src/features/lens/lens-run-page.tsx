import {
  BetterDialogCloseButton,
  BetterDialogContent,
  BetterDialogProvider,
} from '@/components/better-dialog'
import { SectionLoader } from '@/components/section-loader'
import { SectionNotFound } from '@/components/section-not-found'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Paths } from '@/constants/paths'
import { cn } from '@/lib/utils'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  type AnalysisState,
  formatLensLocation,
  LensReview,
  parseLensLocation,
  sameSettings,
} from '@uigraph/lens/ui'
import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { LuExternalLink } from 'react-icons/lu'
import { SiGithub, SiJira, SiLinear } from 'react-icons/si'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  answerLensTicket,
  getLensRun,
  getLensSettings,
  type LensRun,
  saveLensSettings,
  startLensRun,
  stopLensRun,
} from './api'
import { ImpactServiceGraph } from './impact-service-graph'
import { LensCustomizeDialog } from './lens-customize-dialog'

export function LensRunPage(props: { inDashboard: boolean }) {
  const { runId } = useParams() as { runId: string }
  const live = useLiveLensRun(runId)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const searchParams = useSearchParams()
  const settings = useQuery({
    queryKey: ['lens-settings'],
    queryFn: getLensSettings,
  })

  if (!live.run) {
    return <LensRunPlaceholder state={live.state} />
  }
  return (
    <>
      {live.run.running && (
        <div className="border-stock flex items-center justify-between gap-4 border-b px-6 py-2 text-sm text-[#828DA3]">
          Review in progress
          <StopButton runId={runId} />
        </div>
      )}
      {live.run.running && live.analysis?.ticketCandidates && (
        <TicketQuestion
          runId={runId}
          candidates={live.analysis.ticketCandidates}
        />
      )}
      <LensReview
        review={live.run.review}
        analysis={live.analysis}
        location={parseLensLocation(searchParams[0])}
        onLocationChange={(next) => searchParams[1](formatLensLocation(next))}
        hideHeader={props.inDashboard}
        renderImpactGraph={(graph) => <ImpactServiceGraph {...graph} />}
        customize={
          settings.data && (
            <LensCustomizeDialog
              settings={settings.data}
              repositoryConfig={live.analysis?.repositoryConfig ?? null}
              saveSettings={async (next) => {
                const saved = await saveLensSettings(next)
                queryClient.setQueryData(['lens-settings'], saved)
                const pullRequest =
                  live.run?.review.pullRequest.githubUrl ?? null
                if (
                  live.analysis === null ||
                  sameSettings(live.analysis.settings, saved)
                ) {
                  return
                }
                if (pullRequest === null) {
                  toast.info('The next review uses these settings.')
                  return
                }
                const nextRunId = await startLensRun(pullRequest)
                void queryClient.invalidateQueries({ queryKey: ['lens-runs'] })
                void navigate(
                  props.inDashboard
                    ? Paths.lens.dashboardRun(nextRunId)
                    : Paths.lens.run(nextRunId)
                )
              }}
            />
          )
        }
      />
      {!live.connected && <ConnectionWarning />}
    </>
  )
}

function useLiveLensRun(runId: string) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['lens-run', runId],
    queryFn: () => getLensRun(runId),
  })
  const [update, setUpdate] = useState<{
    runId: string
    analysis: AnalysisState
  } | null>(null)
  const [connected, setConnected] = useState(true)
  const running = query.data?.running === true

  useEffect(() => {
    if (!running) {
      return
    }
    const events = new EventSource(`/api/lens/runs/${runId}/events`)
    events.onopen = () => setConnected(true)
    events.onerror = () => setConnected(false)
    events.onmessage = (event: MessageEvent<string>) => {
      setUpdate({ runId, analysis: JSON.parse(event.data) as AnalysisState })
    }
    events.addEventListener('end', () => {
      events.close()
      setConnected(true)
      void queryClient.invalidateQueries({ queryKey: ['lens-run', runId] })
      void queryClient.invalidateQueries({ queryKey: ['lens-runs'] })
    })
    return () => events.close()
  }, [running, runId, queryClient])

  useEffect(() => {
    if (query.data) {
      document.title = `${query.data.review.pullRequest.number === null ? '' : `#${query.data.review.pullRequest.number} `}${query.data.review.pullRequest.title} · UIGraph Lens`
    }
  }, [query.data])

  const run: LensRun | null = query.data ?? null
  return {
    run,
    analysis:
      running && update?.runId === runId
        ? update.analysis
        : (run?.analysis ?? null),
    connected: !running || connected,
    state: query.isPending
      ? ('loading' as const)
      : query.isError
        ? ('error' as const)
        : ('missing' as const),
  }
}

function LensRunPlaceholder({
  state,
}: {
  state: 'loading' | 'error' | 'missing'
}) {
  if (state === 'loading') {
    return <SectionLoader label="Loading the review" />
  }
  if (state === 'error') {
    return <SectionNotFound plain label="The review could not be loaded." />
  }
  return <SectionNotFound plain label="This Lens run was not found." />
}

function StopButton({ runId }: { runId: string }) {
  const [stopping, setStopping] = useState(false)
  return (
    <Button
      preset="outline"
      disabled={stopping}
      onClick={() => {
        setStopping(true)
        stopLensRun(runId).catch((error: unknown) => {
          setStopping(false)
          toast.error(
            error instanceof Error ? error.message : 'Lens could not stop.'
          )
        })
      }}
    >
      {stopping ? 'Stopping' : 'Stop review'}
    </Button>
  )
}

function TicketQuestion({
  runId,
  candidates,
}: {
  runId: string
  candidates: NonNullable<AnalysisState['ticketCandidates']>
}) {
  const [open, setOpen] = useState(true)
  const [selected, setSelected] = useState<string[]>([])
  const [sending, setSending] = useState<'tickets' | 'none' | null>(null)
  const trackers = [
    ...new Set(candidates.flatMap((candidate) => candidate.tracker ?? [])),
  ]

  function answer(keys: string[]) {
    setSending(keys.length === 0 ? 'none' : 'tickets')
    answerLensTicket(runId, keys).catch((error: unknown) => {
      setSending(null)
      toast.error(
        error instanceof Error ? error.message : 'The answer could not be sent.'
      )
    })
  }

  return (
    <>
      {!open && (
        <div className="flex items-center justify-between gap-4 border-b border-[#3B6BFF]/30 bg-[#3B6BFF]/10 px-6 py-2 text-sm text-[#C7D3F5]">
          Lens is paused until you pick the tickets for this change.
          <Button preset="outline" onClick={() => setOpen(true)}>
            Pick tickets
          </Button>
        </div>
      )}
      <BetterDialogProvider
        open={open}
        onOpenChange={setOpen}
        className="[--width:36rem]"
      >
        <BetterDialogContent
          _headerContent={
            <DialogHeader className="flex w-full flex-row items-start justify-between gap-4 border-b border-[#2A3242] px-6 py-5">
              <div className="flex flex-col gap-1.5">
                <DialogTitle className="text-left text-base font-medium">
                  Which tickets does this change belong to?
                </DialogTitle>
                <DialogDescription className="text-left">
                  {`Lens found ${candidates.length} ${trackers.length === 1 ? `${trackers[0]} tickets` : 'tickets'} that could match. Pick every ticket this change works on.`}
                </DialogDescription>
              </div>
              <BetterDialogCloseButton className="shrink-0" />
            </DialogHeader>
          }
          _footerContent={
            <DialogFooter className="flex w-full flex-row items-center justify-between gap-3 p-6 pt-3 sm:justify-between">
              <Button
                preset="ghost"
                disabled={sending !== null}
                onClick={() => answer([])}
              >
                {sending === 'none' && (
                  <Loader2 className="size-4 animate-spin" />
                )}
                None of these
              </Button>
              <Button
                preset="primary"
                disabled={selected.length === 0 || sending !== null}
                onClick={() => answer(selected)}
              >
                {sending === 'tickets' && (
                  <Loader2 className="size-4 animate-spin" />
                )}
                {selected.length === 1
                  ? `Use ${selected[0]}`
                  : selected.length > 1
                    ? `Use ${selected.length} tickets`
                    : 'Use tickets'}
              </Button>
            </DialogFooter>
          }
        >
          <div className="flex flex-col gap-2">
            {candidates.map((candidate) => {
              const TrackerIcon = trackerIcon(candidate.tracker)
              const checked = selected.includes(candidate.key)
              return (
                <label
                  key={candidate.key}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-xl border border-[#2A3242] px-4 py-3 transition-colors hover:border-[#3A4357] hover:bg-white/[0.02]',
                    checked &&
                      'border-[#3B6BFF] bg-[#3B6BFF]/10 hover:border-[#3B6BFF] hover:bg-[#3B6BFF]/10'
                  )}
                >
                  <Checkbox
                    className="mt-0.5"
                    checked={checked}
                    onCheckedChange={(next) =>
                      setSelected(
                        candidates
                          .map((item) => item.key)
                          .filter((key) =>
                            key === candidate.key
                              ? next === true
                              : selected.includes(key)
                          )
                      )
                    }
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex items-center gap-2 text-xs text-[#828DA3]">
                      {TrackerIcon && <TrackerIcon className="size-3" />}
                      <span className="font-mono">{candidate.key}</span>
                    </span>
                    <span className="text-foreground text-sm font-medium">
                      {candidate.title}
                    </span>
                    <span className="text-[13px] text-[#828DA3]">
                      {candidate.reason}
                    </span>
                  </span>
                  {candidate.url && (
                    <a
                      href={candidate.url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open ${candidate.key}`}
                      onClick={(event) => event.stopPropagation()}
                      className="hover:text-foreground shrink-0 rounded-md p-1 text-[#828DA3] hover:bg-white/5"
                    >
                      <LuExternalLink className="size-4" />
                    </a>
                  )}
                </label>
              )
            })}
          </div>
        </BetterDialogContent>
      </BetterDialogProvider>
    </>
  )
}

function trackerIcon(tracker: string | null) {
  if (tracker === null) {
    return null
  }
  const name = tracker.toLowerCase()
  if (name === 'linear') {
    return SiLinear
  }
  if (name === 'jira') {
    return SiJira
  }
  if (name === 'github') {
    return SiGithub
  }
  return null
}

function ConnectionWarning() {
  return (
    <div className="uigraph-lens">
      <p className="data-warning connection-warning" role="status">
        Lost the connection to the Lens process. Reconnecting.
      </p>
    </div>
  )
}
