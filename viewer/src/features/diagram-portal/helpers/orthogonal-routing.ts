import { getSmoothStepPath, Position } from '@xyflow/react'

export type TRoutePoint = { x: number; y: number }

export type TRouteAxis = 'x' | 'y'

export type TRouteSegment = {
  index: number
  axis: TRouteAxis
  from: TRoutePoint
  to: TRoutePoint
}

export type TEdgeRouting = {
  axes: string
  offsets: number[]
}

export type TRouteParams = {
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  sourcePosition: Position
  targetPosition: Position
}

function distance(a: TRoutePoint, b: TRoutePoint): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2)
}

function simplifyRoutePoints(points: TRoutePoint[]): TRoutePoint[] {
  const simplified: TRoutePoint[] = []

  for (const point of points) {
    const last = simplified[simplified.length - 1]
    if (last && last.x === point.x && last.y === point.y) continue
    simplified.push(point)
  }

  for (let index = simplified.length - 2; index >= 1; index--) {
    const previous = simplified[index - 1]
    const current = simplified[index]
    const next = simplified[index + 1]

    const isCollinear =
      (previous.x === current.x && current.x === next.x) ||
      (previous.y === current.y && current.y === next.y)

    if (isCollinear) simplified.splice(index, 1)
  }

  return simplified
}

export function getAutoRoutePoints(params: TRouteParams): TRoutePoint[] {
  const [path] = getSmoothStepPath({ ...params, borderRadius: 0 })

  const commandPattern = /[ML]\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/g
  const points: TRoutePoint[] = []

  let match = commandPattern.exec(path)
  while (match) {
    points.push({ x: Number(match[1]), y: Number(match[2]) })
    match = commandPattern.exec(path)
  }

  return simplifyRoutePoints(points)
}

export function getRouteSegments(points: TRoutePoint[]): TRouteSegment[] {
  const segments: TRouteSegment[] = []

  for (let index = 0; index < points.length - 1; index++) {
    const from = points[index]
    const to = points[index + 1]

    if (from.x === to.x) {
      segments.push({ index, axis: 'x', from, to })
    } else if (from.y === to.y) {
      segments.push({ index, axis: 'y', from, to })
    } else {
      throw new Error(`Route segment ${index} is not orthogonal`)
    }
  }

  return segments
}

export function getRouteAxes(segments: TRouteSegment[]): string {
  return segments.map((segment) => segment.axis).join('')
}

export function readEdgeRouting(
  value: unknown,
  axes: string
): TEdgeRouting | null {
  if (!value || typeof value !== 'object') return null

  const routing = value as Partial<TEdgeRouting>

  if (routing.axes !== axes) return null
  if (!Array.isArray(routing.offsets)) return null
  if (routing.offsets.length !== axes.length) return null
  if (routing.offsets.some((offset) => !Number.isFinite(offset))) return null

  return { axes, offsets: routing.offsets }
}

export function applyRoutingOffsets(
  points: TRoutePoint[],
  axes: string,
  offsets: number[]
): TRoutePoint[] {
  const routed = points.map((point) => ({ ...point }))

  for (let index = 1; index < axes.length - 1; index++) {
    const offset = offsets[index]
    if (offset === 0) continue

    if (axes[index] === 'x') {
      routed[index].x += offset
      routed[index + 1].x += offset
    } else if (axes[index] === 'y') {
      routed[index].y += offset
      routed[index + 1].y += offset
    } else {
      throw new Error(`Unknown route axis: ${axes[index]}`)
    }
  }

  return routed
}

function getBendPath(
  a: TRoutePoint,
  b: TRoutePoint,
  c: TRoutePoint,
  size: number
): string {
  const bendSize = Math.min(distance(a, b) / 2, distance(b, c) / 2, size)
  const { x, y } = b

  if ((a.x === x && x === c.x) || (a.y === y && y === c.y)) {
    return `L${x} ${y}`
  }

  if (a.y === y) {
    const xDir = a.x < c.x ? -1 : 1
    const yDir = a.y < c.y ? 1 : -1
    return `L ${x + bendSize * xDir},${y}Q ${x},${y} ${x},${y + bendSize * yDir}`
  }

  const xDir = a.x < c.x ? 1 : -1
  const yDir = a.y < c.y ? -1 : 1
  return `L ${x},${y + bendSize * yDir}Q ${x},${y} ${x + bendSize * xDir},${y}`
}

export function buildOrthogonalPath(
  points: TRoutePoint[],
  borderRadius: number
): string {
  const last = points[points.length - 1]

  let path = `M${points[0].x} ${points[0].y}`

  for (let index = 1; index < points.length - 1; index++) {
    path += getBendPath(
      points[index - 1],
      points[index],
      points[index + 1],
      borderRadius
    )
  }

  return `${path}L${last.x} ${last.y}`
}

export function getRouteMidpoint(points: TRoutePoint[]): [number, number] {
  let total = 0
  for (let index = 0; index < points.length - 1; index++) {
    total += distance(points[index], points[index + 1])
  }

  let remaining = total / 2

  for (let index = 0; index < points.length - 1; index++) {
    const from = points[index]
    const to = points[index + 1]
    const length = distance(from, to)

    if (remaining <= length) {
      const ratio = length === 0 ? 0 : remaining / length
      return [
        from.x + (to.x - from.x) * ratio,
        from.y + (to.y - from.y) * ratio,
      ]
    }

    remaining -= length
  }

  const last = points[points.length - 1]
  return [last.x, last.y]
}
