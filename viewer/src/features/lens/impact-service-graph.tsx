import { SectionLoader } from '@/components/section-loader'
import {
  ORGANIZATION_DEPENDENCY_GRAPH,
  dependenciesToGraph,
  type DependencyGraphEdge,
  type DependencyGraphNode,
  type OrganizationDependencyGraphData,
} from '@/features/services/api/dependencies'
import { DependencyGraph } from '@/features/services/components/dependencies/dependency-graph'
import { useCurrentOrganization } from '@/store/auth-store'
import { useQuery } from '@apollo/client'
import { IMPACT_EFFECTS, type ImpactGraphProps } from '@uigraph/lens/ui'

export function ImpactServiceGraph(props: ImpactGraphProps) {
  const orgId = useCurrentOrganization().id
  const { data, loading } = useQuery<OrganizationDependencyGraphData>(
    ORGANIZATION_DEPENDENCY_GRAPH,
    { variables: { orgId }, skip: !orgId }
  )

  if (loading || !data) {
    return <SectionLoader label="Loading service graph..." />
  }

  const graph = dependenciesToGraph(data.dependencyGraph)
  const names = new Set(props.services.map((service) => service.name))
  const nodes: DependencyGraphNode[] = graph.nodes.filter((node) =>
    names.has(node.name)
  )
  const kept = new Set(nodes.map((node) => node.id))
  const edges: DependencyGraphEdge[] = graph.edges.filter(
    (edge) => kept.has(edge.source) && kept.has(edge.target)
  )

  const marks = new Map<string, { color: string; label: string }>()
  for (const service of props.services) {
    let node = nodes.find((item) => item.name === service.name)
    if (node === undefined) {
      node = { id: `impact:${service.name}`, name: service.name, service: null }
      nodes.push(node)
    }
    marks.set(node.id, {
      color: IMPACT_EFFECTS[service.effect].color,
      label: IMPACT_EFFECTS[service.effect].label,
    })
  }
  const ids = new Map(nodes.map((node) => [node.name, node.id]))

  const selfName = props.services.find(
    (service) => service.direction === 'self'
  )?.name
  const selfId = selfName === undefined ? undefined : ids.get(selfName)

  const edgeMarks = new Map<string, string>()
  for (const service of props.services) {
    if (service.direction === 'self') {
      continue
    }
    const id = ids.get(service.name)
    const anchor =
      service.via !== null && ids.has(service.via)
        ? ids.get(service.via)
        : selfId
    if (id === undefined || anchor === undefined) {
      continue
    }
    let edge = edges.find(
      (item) =>
        (item.source === id && item.target === anchor) ||
        (item.source === anchor && item.target === id)
    )
    if (edge === undefined) {
      if (service.direction === 'dependency') {
        edge = {
          id: `impact:${service.name}`,
          source: anchor,
          target: id,
          direction: 'downstream',
        }
      } else if (service.direction === 'consumer') {
        edge = {
          id: `impact:${service.name}`,
          source: id,
          target: anchor,
          direction: 'downstream',
        }
      } else {
        throw new Error(`unknown impact direction: ${service.direction}`)
      }
      edges.push(edge)
    }
    if (service.effect !== 'none' && service.effect !== 'unknown') {
      edgeMarks.set(edge.id, IMPACT_EFFECTS[service.effect].color)
    }
  }

  return (
    <DependencyGraph
      nodes={nodes}
      edges={edges}
      focusId={selfId}
      marks={marks}
      edgeMarks={edgeMarks}
      selectedId={ids.get(props.selected)}
      onNodeClick={(node) => props.select(node.name)}
    />
  )
}
