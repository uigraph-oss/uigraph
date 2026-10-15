import { Edge, Node } from '@xyflow/react'
import { getAbsoluteRect } from './node-geometry'

const LABEL_COLLISION_RADIUS = 50
const LABEL_OFFSET_SPACING = 22

type Point = { x: number; y: number }

type Candidate = { edge: Edge; point: Point; dir: Point }

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function normalize(v: Point): Point {
  const length = Math.hypot(v.x, v.y)
  if (length === 0) return { x: 0, y: 1 }
  return { x: v.x / length, y: v.y / length }
}

export function applyLabelCollisionOffsets(
  nodes: Node[],
  edges: Edge[]
): Edge[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const candidates: Candidate[] = []

  for (const edge of edges) {
    if (edge.hidden) continue
    if (!edge.label) continue

    const source = nodesById.get(edge.source)
    const target = nodesById.get(edge.target)
    if (!source || !target) continue

    const sourceRect = getAbsoluteRect(source, nodesById)
    const targetRect = getAbsoluteRect(target, nodesById)
    const sourceCenter = {
      x: sourceRect.x + sourceRect.width / 2,
      y: sourceRect.y + sourceRect.height / 2,
    }
    const targetCenter = {
      x: targetRect.x + targetRect.width / 2,
      y: targetRect.y + targetRect.height / 2,
    }

    candidates.push({
      edge,
      point: {
        x: (sourceCenter.x + targetCenter.x) / 2,
        y: (sourceCenter.y + targetCenter.y) / 2,
      },
      dir: normalize({
        x: targetCenter.x - sourceCenter.x,
        y: targetCenter.y - sourceCenter.y,
      }),
    })
  }

  const clusters: Candidate[][] = []
  const assigned = new Set<string>()

  for (const candidate of candidates) {
    if (assigned.has(candidate.edge.id)) continue

    const cluster = [candidate]
    assigned.add(candidate.edge.id)

    for (const other of candidates) {
      if (assigned.has(other.edge.id)) continue
      if (distance(candidate.point, other.point) <= LABEL_COLLISION_RADIUS) {
        cluster.push(other)
        assigned.add(other.edge.id)
      }
    }

    clusters.push(cluster)
  }

  const offsets = new Map<string, Point>()

  for (const cluster of clusters) {
    if (cluster.length < 2) continue

    const avgDir = normalize(
      cluster.reduce((acc, c) => ({ x: acc.x + c.dir.x, y: acc.y + c.dir.y }), {
        x: 0,
        y: 0,
      })
    )
    const perp = { x: -avgDir.y, y: avgDir.x }

    cluster.forEach((c, index) => {
      const spread = (index - (cluster.length - 1) / 2) * LABEL_OFFSET_SPACING
      offsets.set(c.edge.id, { x: perp.x * spread, y: perp.y * spread })
    })
  }

  return edges.map((edge) => {
    const offset = offsets.get(edge.id)
    const existing = edge.data?.labelOffset as Point | undefined

    if (!offset && existing === undefined) return edge
    if (
      offset &&
      existing &&
      existing.x === offset.x &&
      existing.y === offset.y
    ) {
      return edge
    }

    return { ...edge, data: { ...edge.data, labelOffset: offset } }
  })
}
