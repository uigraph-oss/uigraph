import { Node, Position } from '@xyflow/react'

export type Rect = { x: number; y: number; width: number; height: number }

const MAX_PARENT_CHAIN_DEPTH = 32

export function resolveAbsolutePosition(
  node: Node,
  nodesById: Map<string, Node>
): { x: number; y: number } {
  let x = node.position.x
  let y = node.position.y
  let current = node
  let depth = 0

  while (current.parentId && depth < MAX_PARENT_CHAIN_DEPTH) {
    const parent = nodesById.get(current.parentId)
    if (!parent) break
    x += parent.position.x
    y += parent.position.y
    current = parent
    depth++
  }

  return { x, y }
}

export function resolveMeasuredSize(node: Node): {
  width: number
  height: number
} {
  return {
    width: node.measured?.width ?? node.width ?? 0,
    height: node.measured?.height ?? node.height ?? 0,
  }
}

export function getAbsoluteRect(
  node: Node,
  nodesById: Map<string, Node>
): Rect {
  const { x, y } = resolveAbsolutePosition(node, nodesById)
  const { width, height } = resolveMeasuredSize(node)
  return { x, y, width, height }
}

function getRectCenter(rect: Rect) {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}

export function pickHandleSide(sourceRect: Rect, targetRect: Rect): Position {
  const centerA = getRectCenter(sourceRect)
  const centerB = getRectCenter(targetRect)

  const horizontalDiff = Math.abs(centerA.x - centerB.x)
  const verticalDiff = Math.abs(centerA.y - centerB.y)

  if (horizontalDiff > verticalDiff) {
    return centerA.x > centerB.x ? Position.Left : Position.Right
  }
  return centerA.y > centerB.y ? Position.Top : Position.Bottom
}

export function positionToHandleId(
  position: Position,
  kind: 'source' | 'target'
): string {
  return `${kind}-${position}`
}
