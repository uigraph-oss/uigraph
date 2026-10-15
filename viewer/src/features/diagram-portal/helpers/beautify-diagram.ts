import { Edge, Node } from '@xyflow/react'
import { applyAutoLayout } from './auto-layout'
import { beautifySequenceDiagram } from './beautify-sequence-diagram'
import { fixEdgeHandles } from './edge-handles'
import { isFrameNode } from './frame-nodes'

function beautifyStandardDiagram(
  nodes: Node[],
  edges: Edge[],
  direction: 'LR' | 'TB'
): { nodes: Node[]; edges: Edge[] } {
  const laidOut = applyAutoLayout(nodes, edges, direction)

  const stabilized = laidOut.map((n) =>
    isFrameNode(n) && n.data?.autoLayout
      ? { ...n, data: { ...n.data, autoLayout: false } }
      : n
  )

  const fixedEdges = fixEdgeHandles(stabilized, edges)

  return { nodes: stabilized, edges: fixedEdges }
}

export function beautifyDiagram(
  nodes: Node[],
  edges: Edge[],
  direction: 'LR' | 'TB' = 'LR'
): { nodes: Node[]; edges: Edge[] } {
  const isSequenceDiagram = nodes.some((n) => n.type === 'sequenceParticipant')

  return isSequenceDiagram
    ? beautifySequenceDiagram(nodes, edges)
    : beautifyStandardDiagram(nodes, edges, direction)
}
