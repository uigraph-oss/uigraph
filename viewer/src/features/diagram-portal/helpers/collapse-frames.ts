import { Edge, Node } from '@xyflow/react'
import { CSSProperties } from 'react'
import { isCollapsedFrame } from './frame-nodes'
import { collapsedFontSize, LOD_HIDDEN_CLASS } from './lod'

const MAX_PARENT_DEPTH = 32

export function applyCollapsedFrames(
  nodes: Node[],
  edges: Edge[]
): { nodes: Node[]; edges: Edge[] } {
  if (!nodes.some((node) => isCollapsedFrame(node))) {
    return { nodes, edges }
  }

  const nodesById = new Map(nodes.map((node) => [node.id, node]))

  function hasCollapsedAncestor(node: Node) {
    let parent = node.parentId ? nodesById.get(node.parentId) : undefined

    for (let hop = 0; hop < MAX_PARENT_DEPTH && parent; hop++) {
      if (isCollapsedFrame(parent)) return true
      parent = parent.parentId ? nodesById.get(parent.parentId) : undefined
    }

    return false
  }

  const foldedIds = new Set(
    nodes.filter(hasCollapsedAncestor).map((node) => node.id)
  )

  const nextNodes = nodes.map((node) => {
    if (foldedIds.has(node.id)) {
      return { ...node, hidden: true, selected: false }
    }

    if (isCollapsedFrame(node)) {
      if (node.className === LOD_HIDDEN_CLASS) return node

      return {
        ...node,
        className: undefined,
        style: {
          ...node.style,
          ['--lod-font-size']: `${collapsedFontSize(node)}px`,
        } as CSSProperties,
      }
    }

    return node
  })

  function isOnCanvas(node: Node | undefined): node is Node {
    if (!node) return false
    if (node.hidden === true) return false

    return node.className !== LOD_HIDDEN_CLASS
  }

  const nextEdges = edges.map((edge) => {
    if (foldedIds.has(edge.source) || foldedIds.has(edge.target)) {
      return { ...edge, hidden: true }
    }

    const source = nodesById.get(edge.source)
    const target = nodesById.get(edge.target)

    if (!isOnCanvas(source) || !isOnCanvas(target)) return edge

    if (isCollapsedFrame(source) || isCollapsedFrame(target)) {
      return { ...edge, hidden: false }
    }

    return edge
  })

  return { nodes: nextNodes, edges: nextEdges }
}
