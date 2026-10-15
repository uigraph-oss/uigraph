import {
  BetterDialogContent,
  BetterDialogProvider,
} from '@/components/better-dialog'
import { CrossButton } from '@/components/cross-button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { useApolloClient, useQuery } from '@apollo/client'
import ms from 'ms'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AiOutlineLoading3Quarters } from 'react-icons/ai'
import {
  LuChevronRight,
  LuExternalLink,
  LuListTree,
  LuMinimize2,
  LuRepeat2,
} from 'react-icons/lu'
import { toast } from 'sonner'
import { DIAGRAM } from '../api/diagram'
import { useFlowDiagramContext } from '../context/flow-diagram-context'
import { openSubDiagram } from '../nodes/sub-diagram-node'

const SAVE_ON_CLOSE_TIMEOUT = ms('5s')

declare global {
  interface Window {
    __uigraphEmbedSave?: () => Promise<void>
    __uigraphEmbedClose?: () => void
    __uigraphOpenChild?: (childId: string) => void
  }
}

export function SubDiagramDialog() {
  const {
    diagramId,
    diagramName,
    organizationId,
    isEmbedded,
    childDiagramIds,
    setChildDiagramIds,
  } = useFlowDiagramContext()

  const client = useApolloClient()
  const frameRef = useRef<HTMLIFrameElement>(null)

  const [isLoaded, setIsLoaded] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [pendingRootOpen, setPendingRootOpen] = useState(false)

  const currentChildId = childDiagramIds[childDiagramIds.length - 1]

  useEffect(() => {
    setIsLoaded(false)
    setIsSaving(false)
  }, [currentChildId])

  const goTo = useCallback(
    async (ids: string[]) => {
      if (!currentChildId || !organizationId) return
      if (isSaving) return

      setIsSaving(true)

      const save = frameRef.current?.contentWindow?.__uigraphEmbedSave?.()
      if (save) {
        await Promise.race([
          save,
          new Promise((resolve) => setTimeout(resolve, SAVE_ON_CLOSE_TIMEOUT)),
        ])
      }

      setIsSaving(false)
      setChildDiagramIds(ids)

      try {
        await client.query({
          query: DIAGRAM,
          errorPolicy: 'ignore',
          fetchPolicy: 'network-only',
          variables: { orgId: organizationId, id: currentChildId },
        })
      } catch {
        toast.error('Failed to refresh the sub diagram preview')
      }
    },
    [client, isSaving, currentChildId, organizationId, setChildDiagramIds]
  )

  useEffect(() => {
    if (!currentChildId) return

    window.__uigraphEmbedClose = () => void goTo(childDiagramIds.slice(0, -1))
    window.__uigraphOpenChild = (childId) => {
      if (diagramId && childId === diagramId) {
        setPendingRootOpen(true)
        return
      }
      void goTo([...childDiagramIds, childId])
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (pendingRootOpen) {
        setPendingRootOpen(false)
        e.stopPropagation()
        e.stopImmediatePropagation()
        return
      }

      void goTo(childDiagramIds.slice(0, -1))
    }

    window.addEventListener('keydown', handleEscape, { capture: true })

    return () => {
      delete window.__uigraphEmbedClose
      delete window.__uigraphOpenChild
      window.removeEventListener('keydown', handleEscape, { capture: true })
    }
  }, [currentChildId, childDiagramIds, diagramId, pendingRootOpen, goTo])

  if (isEmbedded) return null
  if (!currentChildId) return null

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (open) return
          void goTo([])
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="bg-shading border-stock flex h-[94vh] w-[96vw] max-w-none flex-col gap-0 overflow-hidden rounded-[0.75rem] p-0 sm:max-w-none"
        >
          <DialogDescription className="hidden">
            Edit the linked sub diagram without leaving this diagram
          </DialogDescription>

          <div className="border-stock flex h-12 shrink-0 items-center gap-2 border-b px-3">
            <div className="flex min-w-0 flex-1 items-center gap-1 text-sm">
              <button
                type="button"
                onClick={() => void goTo([])}
                className="text-paragraph max-w-[16rem] min-w-0 truncate transition-colors hover:text-[#F4F7FC]"
              >
                {diagramName}
              </button>

              {childDiagramIds.map((childId, index) => (
                <span
                  key={`${childId}-${index}`}
                  className="flex min-w-0 items-center gap-1"
                >
                  <LuChevronRight className="text-paragraph size-3.5 shrink-0" />

                  {index === childDiagramIds.length - 1 ? (
                    <DialogTitle className="min-w-0 truncate text-sm font-medium text-[#F4F7FC]">
                      <DiagramCrumbName
                        diagramId={childId}
                        organizationId={organizationId}
                      />
                    </DialogTitle>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        void goTo(childDiagramIds.slice(0, index + 1))
                      }
                      className="text-paragraph max-w-[16rem] min-w-0 truncate transition-colors hover:text-[#F4F7FC]"
                    >
                      <DiagramCrumbName
                        diagramId={childId}
                        organizationId={organizationId}
                      />
                    </button>
                  )}
                </span>
              ))}
            </div>

            {isSaving && (
              <span className="text-paragraph flex shrink-0 items-center gap-1.5 text-xs">
                <AiOutlineLoading3Quarters className="size-3 animate-spin" />
                Saving…
              </span>
            )}

            <button
              type="button"
              title="Open in new tab"
              onClick={() => openSubDiagram(currentChildId)}
              className="text-paragraph flex size-8 shrink-0 items-center justify-center rounded-[0.5rem] transition-colors hover:text-[#F4F7FC]"
            >
              <LuExternalLink className="size-4" />
            </button>

            <CrossButton
              title="Close"
              onClick={() => void goTo([])}
              className="size-8 shrink-0 rounded-[0.5rem]"
            />
          </div>

          <div className="relative min-h-0 flex-1">
            <iframe
              key={currentChildId}
              ref={frameRef}
              src={`/diagram/${currentChildId}/embed`}
              title={`Sub diagram of ${diagramId}`}
              onLoad={() => setIsLoaded(true)}
              className="size-full border-0"
            />

            {!isLoaded && (
              <div className="bg-shading text-paragraph absolute inset-0 flex flex-col items-center justify-center gap-2">
                <AiOutlineLoading3Quarters className="size-5 animate-spin" />
                <span className="text-xs">Opening diagram…</span>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <BetterDialogProvider
        open={pendingRootOpen}
        onOpenChange={(open) => !open && setPendingRootOpen(false)}
        className="sm:max-w-[min(40rem,90%)]"
      >
        <BetterDialogContent
          title="This is the main diagram"
          description="Opening it here nests it inside itself."
        >
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                setPendingRootOpen(false)
                if (diagramId) void goTo([...childDiagramIds, diagramId])
              }}
              className="border-stock hover:border-primary/60 flex flex-col rounded-xl border p-5 text-left transition-colors outline-none"
            >
              <span className="grid flex-1 grid-cols-[auto_1fr] items-start gap-x-3 gap-y-0.5">
                <span className="bg-primary/10 text-primary row-span-2 flex size-11 items-center justify-center rounded-xl">
                  <LuListTree className="size-5" />
                </span>

                <span className="min-w-0 truncate text-sm font-medium text-[#F4F7FC]">
                  Open as child
                </span>
                <span className="text-paragraph line-clamp-2 min-w-0 text-xs leading-snug">
                  Nest the main diagram one level deeper
                </span>
              </span>

              <span className="mt-5 flex items-center gap-1 whitespace-nowrap">
                <span className="border-stock/70 text-paragraph/80 shrink-0 rounded-md border px-1.5 py-0.5 text-[10px]">
                  Main diagram
                </span>
                <LuChevronRight className="text-paragraph/50 size-3 shrink-0" />
                {childDiagramIds.length > 1 && (
                  <>
                    <span className="text-paragraph/60 text-[10px]">…</span>
                    <LuChevronRight className="text-paragraph/50 size-3 shrink-0" />
                  </>
                )}
                <span className="border-stock/70 text-paragraph/80 max-w-[5rem] truncate rounded-md border px-1.5 py-0.5 text-[10px]">
                  <DiagramCrumbName
                    diagramId={currentChildId}
                    organizationId={organizationId}
                  />
                </span>
                <LuChevronRight className="text-primary/60 size-3 shrink-0" />
                <span className="border-primary/40 text-primary/90 flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px]">
                  <LuRepeat2 className="size-3 shrink-0" />
                  Main diagram
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setPendingRootOpen(false)
                void goTo([])
              }}
              className="border-stock hover:border-paragraph/60 flex flex-col rounded-xl border p-5 text-left transition-colors outline-none"
            >
              <span className="grid flex-1 grid-cols-[auto_1fr] items-start gap-x-3 gap-y-0.5">
                <span className="bg-paragraph/10 text-paragraph row-span-2 flex size-11 items-center justify-center rounded-xl">
                  <LuMinimize2 className="size-5" />
                </span>

                <span className="min-w-0 truncate text-sm font-medium text-[#F4F7FC]">
                  Close sub diagrams
                </span>
                <span className="text-paragraph line-clamp-2 min-w-0 text-xs leading-snug">
                  Close the sub diagrams and go back
                </span>
              </span>

              <span className="mt-5 flex items-center gap-1 whitespace-nowrap">
                <span className="border-primary/40 text-primary/90 shrink-0 rounded-md border px-1.5 py-0.5 text-[10px]">
                  Main diagram
                </span>
                <LuChevronRight className="text-paragraph/40 size-3 shrink-0" />
                {childDiagramIds.length > 1 && (
                  <>
                    <span className="border-stock/40 text-paragraph/40 rounded-md border border-dashed px-1.5 py-0.5 text-[10px]">
                      +{childDiagramIds.length - 1}
                    </span>
                    <LuChevronRight className="text-paragraph/40 size-3 shrink-0" />
                  </>
                )}
                <span className="border-stock/40 text-paragraph/40 max-w-[5rem] truncate rounded-md border border-dashed px-1.5 py-0.5 text-[10px] line-through">
                  <DiagramCrumbName
                    diagramId={currentChildId}
                    organizationId={organizationId}
                  />
                </span>
              </span>
            </button>
          </div>
        </BetterDialogContent>
      </BetterDialogProvider>
    </>
  )
}

function DiagramCrumbName({
  diagramId,
  organizationId,
}: {
  diagramId: string
  organizationId: string | null
}) {
  const { data } = useQuery(DIAGRAM, {
    errorPolicy: 'ignore',
    fetchPolicy: 'cache-first',
    skip: !organizationId,
    variables: { orgId: organizationId!, id: diagramId },
  })

  return <>{data?.diagram?.name ?? 'Untitled diagram'}</>
}
