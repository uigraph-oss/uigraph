import { estimateSequenceMessageBoxSize, SEQUENCE_LAYOUT } from '@uigraph/sdk'
import { Edge, Node } from '@xyflow/react'
import { getComponentField } from '../hooks/use-component-field'
import { TComponentField } from '../types/component-fields'
import { DEFAULT_CONFIG } from './sequence-diagram-layout'

const ROW_HEIGHT_VERTICAL_PADDING = SEQUENCE_LAYOUT.ROW_VERTICAL_PADDING
const PARTICIPANT_CENTER_OFFSET = 5

type ParticipantLink = { from?: string; to?: string }

function buildMessageParticipantLinks(edges: Edge[]) {
  const links = new Map<string, ParticipantLink>()

  for (const e of edges) {
    if (
      e.source.startsWith('participant-') &&
      e.target.startsWith('message-')
    ) {
      const existing = links.get(e.target) ?? {}
      links.set(e.target, { ...existing, from: e.source })
    }
    if (
      e.source.startsWith('message-') &&
      e.target.startsWith('participant-')
    ) {
      const existing = links.get(e.source) ?? {}
      links.set(e.source, { ...existing, to: e.target })
    }
  }

  return links
}

function getMessageLabel(message: Node): string {
  const componentFields = message.data?.componentFields as
    (TComponentField | undefined | null)[] | undefined

  const fromFields = getComponentField<string>(componentFields, {
    componentFieldId: 'name',
  })

  return fromFields ?? (message.data?.label as string | undefined) ?? ''
}

const ROW_HANDLE_RE = /^row-\d+-(left|right)-(source|target)$/

function isSelfMessage(
  messageId: string,
  links: Map<string, ParticipantLink>
): boolean {
  const link = links.get(messageId)
  return Boolean(link?.from && link.from === link.to)
}

function isRowItem(node: Node): boolean {
  return node.id.startsWith('message-') || node.id.startsWith('note-')
}

function assignMessageRowIndices(
  nodes: Node[],
  links: Map<string, ParticipantLink>
): Map<string, number> {
  const ordered = nodes
    .filter(isRowItem)
    .sort((a, b) => a.position.y - b.position.y)

  const rowIndexByMessageId = new Map<string, number>()
  let row = 0
  for (const item of ordered) {
    rowIndexByMessageId.set(item.id, row)
    row += isSelfMessage(item.id, links) ? 2 : 1
  }

  return rowIndexByMessageId
}

function assignSequenceNumbers(orderedItems: Node[]): Map<string, number> {
  const messages = orderedItems.filter((item) => item.id.startsWith('message-'))
  const existing = messages
    .map((message) => message.data?.sequenceNumber)
    .filter((value): value is number => typeof value === 'number')

  if (existing.length === 0) return new Map()

  const start = existing[0]
  const step = existing.length > 1 ? existing[1] - existing[0] : 1

  return new Map(
    messages.map((message, index) => [
      message.id,
      Number((start + index * step).toFixed(2)),
    ])
  )
}

type SequenceBlockData = {
  startRow: number
  endRow: number
  depth?: number
  sections?: Array<{ startRow: number; endRow: number }>
}

function getBlockData(node: Node): SequenceBlockData | undefined {
  const block = node.data?.sequenceBlock as SequenceBlockData | undefined
  if (!block) return undefined
  if (typeof block.startRow !== 'number') return undefined
  if (typeof block.endRow !== 'number') return undefined
  return block
}

function buildRowYs(
  nodes: Node[],
  rowCount: number,
  rowHeight: number
): { tops: number[]; centers: number[]; height: number } {
  const padBefore = new Array<number>(rowCount + 1).fill(0)
  const padAfter = new Array<number>(rowCount + 1).fill(0)

  for (const node of nodes) {
    const block = getBlockData(node)
    if (!block) continue
    if (block.startRow > rowCount - 1) continue
    padBefore[block.startRow] +=
      SEQUENCE_LAYOUT.BLOCK_TOP_PADDING + SEQUENCE_LAYOUT.BLOCK_FRAME_GAP
    padAfter[Math.min(block.endRow, rowCount - 1)] +=
      SEQUENCE_LAYOUT.BLOCK_BOTTOM_PADDING
    for (const section of (block.sections ?? []).slice(1)) {
      if (section.startRow > rowCount - 1) continue
      padBefore[section.startRow] += SEQUENCE_LAYOUT.BLOCK_SECTION_PADDING
    }
  }

  const tops: number[] = []
  let y = SEQUENCE_LAYOUT.HEADER_HEIGHT
  for (let row = 0; row < rowCount; row++) {
    y += padBefore[row]
    tops.push(y)
    y += rowHeight + padAfter[row]
  }

  return { tops, centers: tops.map((top) => top + rowHeight / 2), height: y }
}

export function getNextSequenceRow(nodes: Node[], edges: Edge[]): number {
  const links = buildMessageParticipantLinks(edges)
  const rowIndexByMessageId = assignMessageRowIndices(nodes, links)

  let next = 0
  for (const [messageId, rowIndex] of rowIndexByMessageId) {
    next = Math.max(next, rowIndex + (isSelfMessage(messageId, links) ? 2 : 1))
  }

  return next
}

export function renumberSequenceRows(
  nodes: Node[],
  edges: Edge[]
): { nodes: Node[]; edges: Edge[] } {
  const links = buildMessageParticipantLinks(edges)
  const rowIndexByMessageId = assignMessageRowIndices(nodes, links)

  if (rowIndexByMessageId.size === 0) {
    return { nodes, edges }
  }

  const updatedEdges = edges.map((edge) => {
    const outgoingRowIndex = rowIndexByMessageId.get(edge.source)
    const baseRowIndex =
      outgoingRowIndex ?? rowIndexByMessageId.get(edge.target)
    if (baseRowIndex === undefined) return edge

    const isReturnEdge =
      outgoingRowIndex !== undefined && isSelfMessage(edge.source, links)
    const rowIndex = isReturnEdge ? baseRowIndex + 1 : baseRowIndex

    let sourceHandle = edge.sourceHandle
    let targetHandle = edge.targetHandle
    let changed = false

    if (sourceHandle && ROW_HANDLE_RE.test(sourceHandle)) {
      sourceHandle = sourceHandle.replace(/^row-\d+-/, `row-${rowIndex}-`)
      changed = changed || sourceHandle !== edge.sourceHandle
    }
    if (targetHandle && ROW_HANDLE_RE.test(targetHandle)) {
      targetHandle = targetHandle.replace(/^row-\d+-/, `row-${rowIndex}-`)
      changed = changed || targetHandle !== edge.targetHandle
    }

    return changed ? { ...edge, sourceHandle, targetHandle } : edge
  })

  return { nodes, edges: updatedEdges }
}

function computeMessageX(
  fromX: number,
  toX: number,
  messageWidth: number,
  isSelfMessage: boolean
): number {
  if (isSelfMessage) {
    return fromX + PARTICIPANT_CENTER_OFFSET + DEFAULT_CONFIG.selfLoopOffset
  }
  return (fromX + toX) / 2 + PARTICIPANT_CENTER_OFFSET - messageWidth / 2
}

export function beautifySequenceDiagram(
  nodes: Node[],
  edges: Edge[]
): { nodes: Node[]; edges: Edge[] } {
  const participants = nodes.filter((n) => n.type === 'sequenceParticipant')
  const items = nodes.filter(isRowItem)

  if (participants.length === 0 || items.length === 0) {
    return { nodes, edges }
  }

  const links = buildMessageParticipantLinks(edges)
  const participantsById = new Map(participants.map((p) => [p.id, p]))

  const orderedItems = [...items].sort((a, b) => a.position.y - b.position.y)

  const sizesById = new Map(
    orderedItems.map((item) => [
      item.id,
      estimateSequenceMessageBoxSize(getMessageLabel(item)),
    ])
  )

  const rowHeight = Math.max(
    DEFAULT_CONFIG.rowHeight,
    ...orderedItems.map(
      (item) => sizesById.get(item.id)!.height + ROW_HEIGHT_VERTICAL_PADDING
    )
  )

  const rowIndexByItemId = assignMessageRowIndices(nodes, links)
  const rowCount = Math.max(
    ...[...rowIndexByItemId].map(
      ([id, row]) => row + (isSelfMessage(id, links) ? 2 : 1)
    )
  )
  const rows = buildRowYs(nodes, rowCount, rowHeight)
  const numberByMessageId = assignSequenceNumbers(orderedItems)

  const updatedItems = orderedItems.map((item) => {
    const size = sizesById.get(item.id)!
    const row = rowIndexByItemId.get(item.id)!
    const newY = rows.centers[row] - size.height / 2

    const link = links.get(item.id)
    const fromParticipant = link?.from
      ? participantsById.get(link.from)
      : undefined
    const toParticipant = link?.to ? participantsById.get(link.to) : undefined

    const newX =
      fromParticipant && toParticipant
        ? computeMessageX(
            fromParticipant.position.x,
            toParticipant.position.x,
            size.width,
            link!.from === link!.to
          )
        : item.position.x

    const width = item.id.startsWith('note-')
      ? (item.width ?? size.width)
      : size.width

    const sequenceNumber = numberByMessageId.get(item.id)

    return {
      ...item,
      data:
        sequenceNumber === undefined
          ? item.data
          : { ...item.data, sequenceNumber },
      position: { x: newX, y: newY },
      width,
      height: size.height,
      style: {
        ...(item.style ?? {}),
        width,
        height: size.height,
      },
    }
  })

  const updatedItemsById = new Map(updatedItems.map((item) => [item.id, item]))

  const updatedParticipants = participants.map((p) => ({
    ...p,
    data: {
      ...p.data,
      rowHeight,
      rowCount,
      rowYs: rows.centers,
      lifelineHeight: rows.height,
    },
  }))
  const updatedParticipantsById = new Map(
    updatedParticipants.map((p) => [p.id, p])
  )

  const updatedFrames = new Map<string, Node>()
  for (const node of nodes) {
    const block = getBlockData(node)
    if (block) {
      const startRow = Math.min(block.startRow, rowCount - 1)
      const endRow = Math.min(block.endRow, rowCount - 1)
      const deeperAtTop = nodes.filter((other) => {
        const otherBlock = getBlockData(other)
        if (!otherBlock) return false
        if (other.id === node.id) return false
        if ((otherBlock.depth ?? 0) <= (block.depth ?? 0)) return false
        return Math.min(otherBlock.startRow, rowCount - 1) === startRow
      }).length
      const deeperAtBottom = nodes.filter((other) => {
        const otherBlock = getBlockData(other)
        if (!otherBlock) return false
        if (other.id === node.id) return false
        if ((otherBlock.depth ?? 0) <= (block.depth ?? 0)) return false
        return Math.min(otherBlock.endRow, rowCount - 1) === endRow
      }).length

      const top =
        rows.tops[startRow] -
        SEQUENCE_LAYOUT.BLOCK_TOP_PADDING * (deeperAtTop + 1)
      const bottom =
        rows.tops[endRow] +
        rowHeight +
        SEQUENCE_LAYOUT.BLOCK_BOTTOM_PADDING * (deeperAtBottom + 1)
      updatedFrames.set(node.id, {
        ...node,
        position: { ...node.position, y: top },
        height: bottom - top,
        style: { ...(node.style ?? {}), height: bottom - top },
      })
      continue
    }

    if (node.data?.sequenceBox) {
      const height =
        rows.height +
        SEQUENCE_LAYOUT.BOX_TOP_INSET +
        SEQUENCE_LAYOUT.BOX_BOTTOM_PADDING
      updatedFrames.set(node.id, {
        ...node,
        height,
        style: { ...(node.style ?? {}), height },
      })
    }
  }

  const updatedNodes = nodes.map(
    (n) =>
      updatedParticipantsById.get(n.id) ??
      updatedItemsById.get(n.id) ??
      updatedFrames.get(n.id) ??
      n
  )

  return renumberSequenceRows(updatedNodes, edges)
}
