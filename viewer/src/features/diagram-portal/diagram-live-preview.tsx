import { DIAGRAM_WITH_CONTENT } from '@/features/diagram-portal/api/diagram'
import { convertDiagramServerData } from '@/features/diagram-portal/helpers/diagram-data'
import { useCurrentOrganization } from '@/store/auth-store'
import { useQuery } from '@apollo/client'
import { lazy, Suspense, useMemo } from 'react'

const FlowDiagramPreview = lazy(() =>
  import('@/features/diagram-portal/flow-diagram-preview').then((mod) => ({
    default: mod.FlowDiagramPreview,
  }))
)

export function DiagramLivePreview({ diagramId }: { diagramId: string }) {
  const organizationId = useCurrentOrganization().id

  const { data } = useQuery(DIAGRAM_WITH_CONTENT, {
    variables: { orgId: organizationId, id: diagramId },
    fetchPolicy: 'cache-first',
  })

  const diagramData = useMemo(() => {
    const content = data?.diagram?.content
    if (!content) return null
    return convertDiagramServerData(content)
  }, [data?.diagram?.content])

  if (!diagramData) return null

  return (
    <div className="pointer-events-none h-full w-full">
      <Suspense fallback={null}>
        <FlowDiagramPreview
          data={diagramData}
          options={{ forceNoBackground: true }}
          name={data?.diagram?.name}
        />
      </Suspense>
    </div>
  )
}
