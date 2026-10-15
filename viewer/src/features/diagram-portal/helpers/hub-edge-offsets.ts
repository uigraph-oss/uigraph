import { Edge, Node, Position } from '@xyflow/react'
import { isSequenceEndpoint } from './edge-handles'
import { getAbsoluteRect, pickHandleSide } from './node-geometry'

const HUB_EDGE_SPACING = 24

type Point = { x: number; y: number }

type Endpoint = {
  edgeId: string
  role: 'source' | 'target'
  side: Position
  otherCenter: Point
}

export function applyHubEdgeOffsets(nodes: Node[], edges: Edge[]): Edge[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const bundles = new Map<string, Endpoint[]>()

  function addEndpoint(
    edgeId: string,
    role: 'source' | 'target',
    nodeId: string,
    otherNodeId: string
  ) {
    const node = nodesById.get(nodeId)
    const other = nodesById.get(otherNodeId)
    if (!node || !other) return

    const rect = getAbsoluteRect(node, nodesById)
    const otherRect = getAbsoluteRect(other, nodesById)
    const side = pickHandleSide(rect, otherRect)
    const otherCenter = {
      x: otherRect.x + otherRect.width / 2,
      y: otherRect.y + otherRect.height / 2,
    }

    const key = `${nodeId}|${side}`
    const bundle = bundles.get(key)
    const endpoint = { edgeId, role, side, otherCenter }
    if (bundle) bundle.push(endpoint)
    else bundles.set(key, [endpoint])
  }

  for (const edge of edges) {
    if (edge.hidden) continue
    if (edge.source === edge.target) continue
    if (edge.data?.handlesLocked) continue
    const sourceNode = nodesById.get(edge.source)
    const targetNode = nodesById.get(edge.target)
    if (!sourceNode || !targetNode) continue
    if (isSequenceEndpoint(sourceNode) || isSequenceEndpoint(targetNode))
      continue
    addEndpoint(edge.id, 'source', edge.source, edge.target)
    addEndpoint(edge.id, 'target', edge.target, edge.source)
  }

  const sourceOffsets = new Map<string, number>()
  const targetOffsets = new Map<string, number>()

  for (const bundle of bundles.values()) {
    if (bundle.length < 2) continue

    const side = bundle[0].side
    const sorted = [...bundle].sort((a, b) =>
      side === Position.Left || side === Position.Right
        ? a.otherCenter.y - b.otherCenter.y
        : a.otherCenter.x - b.otherCenter.x
    )

    sorted.forEach((endpoint, index) => {
      const offset = (index - (sorted.length - 1) / 2) * HUB_EDGE_SPACING
      const target = endpoint.role === 'source' ? sourceOffsets : targetOffsets
      target.set(endpoint.edgeId, offset)
    })
  }

  return edges.map((edge) => {
    const hasSource = sourceOffsets.has(edge.id)
    const hasTarget = targetOffsets.has(edge.id)
    const existing = edge.data?.hubOffset as
      { source: number; target: number } | undefined

    if (!hasSource && !hasTarget) {
      if (existing === undefined) return edge
      const { hubOffset: _unused, ...restData } = edge.data ?? {}
      return { ...edge, data: restData }
    }

    const source = sourceOffsets.get(edge.id) ?? 0
    const target = targetOffsets.get(edge.id) ?? 0
    if (existing && existing.source === source && existing.target === target) {
      return edge
    }

    return { ...edge, data: { ...edge.data, hubOffset: { source, target } } }
  })
}
