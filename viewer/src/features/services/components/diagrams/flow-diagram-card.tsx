import { ActorAvatar } from '@/components/actor-avatar'
import { DiagramLivePreview } from '@/features/diagram-portal/diagram-live-preview'
import { serviceDiagramToLegacyWithMeta } from '@/features/services/api/service-diagram'
import { format } from 'date-fns'
import { Calendar } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useServiceContext } from '../../contexts/service-context'

type ServiceDiagramWithMeta = ReturnType<typeof serviceDiagramToLegacyWithMeta>

export function FlowDiagramCard({
  diagram,
  serviceDiagram,
}: {
  diagram: NonNullable<ServiceDiagramWithMeta['diagram']>
  serviceDiagram: ServiceDiagramWithMeta['serviceDiagram']
}) {
  const { service } = useServiceContext()

  const updatedDate = serviceDiagram.updatedAt
    ? new Date(serviceDiagram.updatedAt)
    : null

  const updatedByActor =
    'updatedByActor' in diagram
      ? (diagram.updatedByActor as
          | {
              name?: string | null
              avatarUrl?: string | null
              type?: string | null
            }
          | null
          | undefined)
      : undefined
  const createdByActor =
    'createdByActor' in diagram
      ? (diagram.createdByActor as
          | {
              name?: string | null
              avatarUrl?: string | null
              type?: string | null
            }
          | null
          | undefined)
      : undefined

  const actor = updatedByActor ?? createdByActor
  const commitHash = updatedByActor
    ? diagram.updatedByCommitHash
    : diagram.createdByCommitHash

  return (
    <div className="group relative">
      <Link
        target="_blank"
        to={`/diagram/${diagram.diagramId}`}
        className="relative block cursor-pointer overflow-hidden rounded-[1.4525rem] bg-[#141925] shadow-[0_1px_3px_rgba(0,0,0,0.07),0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-[#2A3242] transition-all duration-300 hover:shadow-[0_0_0_3px_rgba(1,90,235,0.18),0_8px_24px_rgba(0,0,0,0.10)] hover:ring-2 hover:ring-[#015AEB]"
      >
        <div className="relative aspect-[16/10] w-full bg-[#1E2533] transition-colors duration-300">
          <DiagramLivePreview diagramId={diagram.diagramId} />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-black/30 to-transparent" />
        </div>

        <div className="h-px bg-[#1E2533]" />

        <div className="px-4 py-3">
          <h4 className="line-clamp-1 text-sm font-semibold text-[#F4F7FC]">
            {diagram.componentFlowDiagramName ? (
              diagram.componentFlowDiagramName.charAt(0).toUpperCase() +
              diagram.componentFlowDiagramName.slice(1)
            ) : (
              <span className="text-[#B0B0B2]">Blank Diagram</span>
            )}
          </h4>

          <div className="mt-2 flex min-h-[1.75rem] items-center justify-between gap-2">
            {updatedDate ? (
              <div className="flex min-w-0 items-center gap-1.5 text-[#828DA3]">
                <Calendar className="h-3 w-3 shrink-0" />
                <span className="text-[11px]">
                  {format(updatedDate, 'dd MMM yyyy')}
                </span>
              </div>
            ) : (
              <span />
            )}

            <ActorAvatar
              actor={actor}
              commitHash={commitHash}
              repoUrl={service?.gitRepoUrl}
              className="shrink-0"
            />
          </div>
        </div>
      </Link>
    </div>
  )
}
