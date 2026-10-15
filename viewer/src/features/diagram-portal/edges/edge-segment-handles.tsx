import { useReactFlow } from '@xyflow/react'
import { useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useFlowDiagramContext } from '../context/flow-diagram-context'
import type { TRouteSegment } from '../helpers/orthogonal-routing'

const HIT_STROKE_WIDTH = 14
const HIGHLIGHT_STROKE_WIDTH = 6
const HIGHLIGHT_COLOR = '#0059ea'

export type TRoutingDraft = {
  index: number
  value: number
}

type TEdgeSegmentHandlesProps = {
  edgeId: string
  axes: string
  offsets: number[]
  segments: TRouteSegment[]
  draft: TRoutingDraft | null
  onDraft: (draft: TRoutingDraft | null) => void
}

export function EdgeSegmentHandles({
  edgeId,
  axes,
  offsets,
  segments,
  draft,
  onDraft,
}: TEdgeSegmentHandlesProps) {
  const { screenToFlowPosition } = useReactFlow()
  const ctx = useFlowDiagramContext()

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  function commitRouting(nextOffsets: number[] | null) {
    ctx.setEdges((previous) =>
      previous.map((edge) => {
        if (edge.id !== edgeId) return edge

        if (nextOffsets === null) {
          const nextData = { ...edge.data }
          delete nextData.routing
          return { ...edge, data: nextData }
        }

        return {
          ...edge,
          data: { ...edge.data, routing: { axes, offsets: nextOffsets } },
        }
      })
    )
  }

  function onSegmentPointerDown(
    event: ReactPointerEvent<SVGPathElement>,
    segment: TRouteSegment
  ) {
    event.preventDefault()

    const start = screenToFlowPosition({ x: event.clientX, y: event.clientY })
    const base = offsets[segment.index]

    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect

    document.body.style.cursor =
      segment.axis === 'x' ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'

    let next: number | null = null

    function onPointerMove(moveEvent: PointerEvent) {
      const current = screenToFlowPosition({
        x: moveEvent.clientX,
        y: moveEvent.clientY,
      })

      next = Math.round(base + current[segment.axis] - start[segment.axis])
      onDraft({ index: segment.index, value: next })
    }

    function onPointerUp() {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)

      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect

      const value = next
      onDraft(null)

      if (value === null) return
      if (value === base) return

      const nextOffsets = offsets.map((offset, index) =>
        index === segment.index ? value : offset
      )

      commitRouting(
        nextOffsets.every((offset) => offset === 0) ? null : nextOffsets
      )
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
  }

  return (
    <>
      {segments.map((segment) => {
        if (segment.index === 0) return null
        if (segment.index === segments.length - 1) return null

        const path = `M ${segment.from.x} ${segment.from.y} L ${segment.to.x} ${segment.to.y}`
        const isActive =
          draft?.index === segment.index || hoveredIndex === segment.index

        return (
          <g key={segment.index}>
            {isActive && (
              <path
                d={path}
                fill="none"
                stroke={HIGHLIGHT_COLOR}
                strokeWidth={HIGHLIGHT_STROKE_WIDTH}
                strokeOpacity={0.35}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                style={{ pointerEvents: 'none' }}
              />
            )}

            <path
              d={path}
              fill="none"
              stroke="transparent"
              strokeWidth={HIT_STROKE_WIDTH}
              vectorEffect="non-scaling-stroke"
              style={{
                cursor: segment.axis === 'x' ? 'col-resize' : 'row-resize',
              }}
              onPointerEnter={() => setHoveredIndex(segment.index)}
              onPointerLeave={() => setHoveredIndex(null)}
              onPointerDown={(event) => onSegmentPointerDown(event, segment)}
              onDoubleClick={(event) => {
                event.stopPropagation()
                commitRouting(null)
              }}
            />
          </g>
        )
      })}
    </>
  )
}
