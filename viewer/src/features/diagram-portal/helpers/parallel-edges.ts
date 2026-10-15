import { Edge, Position } from '@xyflow/react'

const PARALLEL_EDGE_SPACING = 28
const BORDER_MARGIN = 8

export function applyParallelEdgeOffsets(edges: Edge[]): Edge[] {
  const bundles = new Map<string, Edge[]>()

  for (const edge of edges) {
    if (edge.hidden) continue
    if (edge.source === edge.target) continue

    const key =
      edge.source < edge.target
        ? `${edge.source}|${edge.target}`
        : `${edge.target}|${edge.source}`
    const bundle = bundles.get(key)

    if (bundle) {
      bundle.push(edge)
    } else {
      bundles.set(key, [edge])
    }
  }

  const offsets = new Map<string, number>()

  for (const bundle of bundles.values()) {
    if (bundle.length < 2) continue

    bundle.forEach((edge, index) => {
      offsets.set(
        edge.id,
        (index - (bundle.length - 1) / 2) * PARALLEL_EDGE_SPACING
      )
    })
  }

  return edges.map((edge) => {
    const offset = offsets.get(edge.id) ?? 0

    if (edge.data?.parallelOffset === offset) return edge
    if (edge.data?.parallelOffset === undefined && offset === 0) return edge

    return { ...edge, data: { ...edge.data, parallelOffset: offset } }
  })
}

export type EdgeEndpointGeometry = {
  x: number
  y: number
  position: Position
  width: number
  height: number
}

function slideAlongBorder(
  offset: number,
  { x, y, position, width, height }: EdgeEndpointGeometry
): { x: number; y: number } {
  if (position === Position.Left || position === Position.Right) {
    const limit = Math.max(height / 2 - BORDER_MARGIN, 0)
    return { x, y: y + clamp(offset, limit) }
  }

  if (position === Position.Top || position === Position.Bottom) {
    const limit = Math.max(width / 2 - BORDER_MARGIN, 0)
    return { x: x + clamp(offset, limit), y }
  }

  throw new Error(`Unknown handle position: ${position}`)
}

function clamp(offset: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, offset))
}

export function offsetEdgeEndpoints(
  offset: number,
  source: EdgeEndpointGeometry,
  target: EdgeEndpointGeometry,
  hubOffset?: { source?: number; target?: number }
) {
  const sourceOffset = offset + (hubOffset?.source ?? 0)
  const targetOffset = offset + (hubOffset?.target ?? 0)

  return {
    sourceX:
      sourceOffset === 0 ? source.x : slideAlongBorder(sourceOffset, source).x,
    sourceY:
      sourceOffset === 0 ? source.y : slideAlongBorder(sourceOffset, source).y,
    targetX:
      targetOffset === 0 ? target.x : slideAlongBorder(targetOffset, target).x,
    targetY:
      targetOffset === 0 ? target.y : slideAlongBorder(targetOffset, target).y,
  }
}
