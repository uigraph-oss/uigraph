import { Edge, Node } from '@xyflow/react'
import { CSSProperties } from 'react'

export const LOD_HIDDEN_CLASS = 'lod-hidden'
export const LOD_COLLAPSED_CLASS = 'lod-collapsed'
export const LOD_BOUNDARY_LABEL_CLASS = 'lod-boundary-label'

const LOD_THRESHOLDS = [0.3, 0.5, 0.7]
const LOD_HYSTERESIS = 0.03
const MAX_PARENT_DEPTH = 32

const COLLAPSED_FONT_WIDTH_RATIO = 0.08
const COLLAPSED_FONT_HEIGHT_RATIO = 0.16
const COLLAPSED_FONT_FALLBACK = 16
const BOUNDARY_LABEL_FONT_RATIO = 0.45

export function collapsedFontSize(node: Node) {
  const width = node.width ?? node.measured?.width
  const height = node.height ?? node.measured?.height

  if (!width || !height) return COLLAPSED_FONT_FALLBACK

  return Math.min(
    width * COLLAPSED_FONT_WIDTH_RATIO,
    height * COLLAPSED_FONT_HEIGHT_RATIO
  )
}

export function resolveVisibleDepth(zoom: number, previousDepth: number) {
  for (let depth = 0; depth < LOD_THRESHOLDS.length; depth++) {
    const threshold = LOD_THRESHOLDS[depth]
    const limit =
      previousDepth <= depth ? threshold + LOD_HYSTERESIS : threshold

    if (zoom < limit) return depth
  }

  return Infinity
}

export function applyLevelOfDetail(
  nodes: Node[],
  edges: Edge[],
  visibleDepth: number
): { nodes: Node[]; edges: Edge[] } {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))

  function boundaryDepthOf(node: Node) {
    let depth = 0
    let parent = node.parentId ? nodesById.get(node.parentId) : undefined

    for (let hop = 0; hop < MAX_PARENT_DEPTH && parent; hop++) {
      if (parent.type === 'c4Boundary') depth++
      parent = parent.parentId ? nodesById.get(parent.parentId) : undefined
    }

    return depth
  }

  const hiddenNodeIds = new Set<string>()
  const collapsedFontSizes = new Map<string, number>()

  const nextNodes = nodes.map((node) => {
    const depth = boundaryDepthOf(node)

    if (depth > visibleDepth) {
      hiddenNodeIds.add(node.id)
      return { ...node, className: LOD_HIDDEN_CLASS }
    }

    if (node.type === 'c4Boundary' && depth === visibleDepth) {
      const fontSize = collapsedFontSize(node)

      collapsedFontSizes.set(node.id, fontSize)

      return {
        ...node,
        className: LOD_COLLAPSED_CLASS,
        style: {
          ...node.style,
          ['--lod-font-size']: `${fontSize}px`,
        } as CSSProperties,
      }
    }

    return { ...node, className: undefined }
  })

  const nextEdges = edges.map((edge) => {
    const sourceIsBoundary = nodesById.get(edge.source)?.type === 'c4Boundary'
    const targetIsBoundary = nodesById.get(edge.target)?.type === 'c4Boundary'

    if (sourceIsBoundary && targetIsBoundary) {
      const sourceFontSize = collapsedFontSizes.get(edge.source)
      const targetFontSize = collapsedFontSizes.get(edge.target)

      if (sourceFontSize === undefined || targetFontSize === undefined) {
        return { ...edge, className: undefined, hidden: true }
      }

      return {
        ...edge,
        className: undefined,
        hidden: false,
        data: {
          ...edge.data,
          labelFontSize:
            Math.min(sourceFontSize, targetFontSize) *
            BOUNDARY_LABEL_FONT_RATIO,
          lodLabelClass: LOD_BOUNDARY_LABEL_CLASS,
        },
      }
    }

    if (hiddenNodeIds.has(edge.source) || hiddenNodeIds.has(edge.target)) {
      return { ...edge, className: LOD_HIDDEN_CLASS, hidden: false }
    }

    return { ...edge, className: undefined, hidden: false }
  })

  return { nodes: nextNodes, edges: nextEdges }
}
