import {
  BaseEdge,
  EdgeLabelRenderer,
  EdgeProps,
  getBezierPath,
  getSimpleBezierPath,
  getSmoothStepPath,
  getStraightPath,
  useInternalNode,
  useStore,
} from '@xyflow/react'
import { useMemo, useState } from 'react'
import { resolveMeasuredSize } from '../helpers/node-geometry'
import {
  applyRoutingOffsets,
  buildOrthogonalPath,
  getAutoRoutePoints,
  getRouteAxes,
  getRouteMidpoint,
  getRouteSegments,
  readEdgeRouting,
} from '../helpers/orthogonal-routing'
import { offsetEdgeEndpoints } from '../helpers/parallel-edges'
import { EdgeEndpoints } from './edge-endpoints'
import { EdgeSegmentHandles, type TRoutingDraft } from './edge-segment-handles'

const SMOOTHSTEP_BORDER_RADIUS = 5

type PathType = 'bezier' | 'straight' | 'smoothstep' | 'step' | 'simplebezier'

const SELECTED_LABEL_ELEVATION = 1000

export function createLabeledEdge(pathType: PathType) {
  return function LabeledEdge({
    id,
    data,
    label,
    labelStyle,
    style,
    selected,
    markerEnd,
    markerStart,
    source,
    sourceX,
    sourceY,
    target,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  }: EdgeProps) {
    const sourceNode = useInternalNode(source)
    const targetNode = useInternalNode(target)

    const [draft, setDraft] = useState<TRoutingDraft | null>(null)
    const elementsSelectable = useStore((state) => state.elementsSelectable)

    const parallelOffset = (data?.parallelOffset as number | undefined) ?? 0
    const hubOffset = data?.hubOffset as
      { source: number; target: number } | undefined

    const sourceSize = sourceNode
      ? resolveMeasuredSize(sourceNode)
      : { width: 0, height: 0 }
    const targetSize = targetNode
      ? resolveMeasuredSize(targetNode)
      : { width: 0, height: 0 }

    const {
      sourceX: offsetSourceX,
      sourceY: offsetSourceY,
      targetX: offsetTargetX,
      targetY: offsetTargetY,
    } = offsetEdgeEndpoints(
      parallelOffset,
      { x: sourceX, y: sourceY, position: sourcePosition, ...sourceSize },
      { x: targetX, y: targetY, position: targetPosition, ...targetSize },
      hubOffset
    )

    let labelZIndex = 0

    if (sourceNode?.parentId) {
      labelZIndex = sourceNode.internals.z
    }

    if (targetNode?.parentId && targetNode.internals.z > labelZIndex) {
      labelZIndex = targetNode.internals.z
    }

    if (selected) {
      labelZIndex += SELECTED_LABEL_ELEVATION
    }

    const params = {
      sourceX: offsetSourceX,
      sourceY: offsetSourceY,
      targetX: offsetTargetX,
      targetY: offsetTargetY,
      sourcePosition,
      targetPosition,
    }

    let edgePath: string
    let labelX: number
    let labelY: number

    if (pathType === 'straight') {
      ;[edgePath, labelX, labelY] = getStraightPath({
        sourceX: offsetSourceX,
        sourceY: offsetSourceY,
        targetX: offsetTargetX,
        targetY: offsetTargetY,
      })
    } else if (pathType === 'smoothstep') {
      ;[edgePath, labelX, labelY] = getSmoothStepPath(params)
    } else if (pathType === 'step') {
      ;[edgePath, labelX, labelY] = getSmoothStepPath({
        ...params,
        borderRadius: 0,
      })
    } else if (pathType === 'simplebezier') {
      ;[edgePath, labelX, labelY] = getSimpleBezierPath(params)
    } else if (pathType === 'bezier') {
      ;[edgePath, labelX, labelY] = getBezierPath(params)
    } else {
      throw new Error(`Unknown edge path type: ${pathType}`)
    }

    const storedRouting = data?.routing

    const routing = useMemo(() => {
      if (pathType !== 'step' && pathType !== 'smoothstep') return null
      if (!storedRouting && !elementsSelectable && !draft) return null

      const autoPoints = getAutoRoutePoints({
        sourceX: offsetSourceX,
        sourceY: offsetSourceY,
        targetX: offsetTargetX,
        targetY: offsetTargetY,
        sourcePosition,
        targetPosition,
      })

      const axes = getRouteAxes(getRouteSegments(autoPoints))
      const stored = readEdgeRouting(storedRouting, axes)
      const baseOffsets = stored ? stored.offsets : axes.split('').map(() => 0)

      const offsets = draft
        ? baseOffsets.map((offset, index) =>
            index === draft.index ? draft.value : offset
          )
        : baseOffsets

      const isRouted = offsets.some((offset) => offset !== 0)
      const points = isRouted
        ? applyRoutingOffsets(autoPoints, axes, offsets)
        : autoPoints

      return {
        axes,
        offsets,
        points,
        isRouted,
        segments: getRouteSegments(points),
      }
    }, [
      storedRouting,
      elementsSelectable,
      draft,
      offsetSourceX,
      offsetSourceY,
      offsetTargetX,
      offsetTargetY,
      sourcePosition,
      targetPosition,
    ])

    if (routing?.isRouted) {
      edgePath = buildOrthogonalPath(
        routing.points,
        pathType === 'step' ? 0 : SMOOTHSTEP_BORDER_RADIUS
      )
      ;[labelX, labelY] = getRouteMidpoint(routing.points)
    }

    const labelOffset = data?.labelOffset as
      { x: number; y: number } | undefined
    if (labelOffset) {
      labelX += labelOffset.x
      labelY += labelOffset.y
    }

    const labelFontSize = (data?.labelFontSize as number | undefined) ?? 12

    const reverseAnimation = Boolean(data?.reverseAnimation)

    return (
      <>
        <BaseEdge
          id={id}
          path={edgePath}
          style={
            reverseAnimation
              ? { ...style, animationDirection: 'reverse' }
              : style
          }
          markerEnd={markerEnd}
          markerStart={markerStart}
        />
        {selected && (
          <EdgeEndpoints
            sourceX={offsetSourceX}
            sourceY={offsetSourceY}
            targetX={offsetTargetX}
            targetY={offsetTargetY}
          />
        )}
        {routing && (elementsSelectable || draft !== null) && (
          <EdgeSegmentHandles
            edgeId={id}
            axes={routing.axes}
            offsets={routing.offsets}
            segments={routing.segments}
            draft={draft}
            onDraft={setDraft}
          />
        )}
        {label && (
          <EdgeLabelRenderer>
            <div
              className={data?.lodLabelClass as string | undefined}
              style={{
                position: 'absolute',
                zIndex: labelZIndex,
                transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                fontSize: labelFontSize,
                lineHeight: 1.2,
                padding: '2px 6px',
                borderRadius: 4,
                background: labelStyle?.backgroundColor ?? '#1E293B',
                color: labelStyle?.color ?? '#E2E8F0',
                border: labelStyle?.backgroundColor
                  ? 'none'
                  : '1px solid #334155',
                pointerEvents: 'none',
                userSelect: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </div>
          </EdgeLabelRenderer>
        )}
      </>
    )
  }
}
