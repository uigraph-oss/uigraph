import { EdgeProps, getBezierPath, useInternalNode } from '@xyflow/react'
import { useEffect, useRef, useState } from 'react'
import { getEdgeParams } from '../helpers/floating-edge'
import { resolveMeasuredSize } from '../helpers/node-geometry'
import { offsetEdgeEndpoints } from '../helpers/parallel-edges'
import { EdgeEndpoints } from './edge-endpoints'

export function DynamicFloatingEdge({
  id,
  data,
  label,
  labelStyle,
  style,
  source,
  target,
  selected,
  markerEnd,
  markerStart,
}: EdgeProps) {
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)

  const labelFontSize = (data?.labelFontSize as number | undefined) ?? 12

  const reverseAnimation = Boolean(data?.reverseAnimation)

  const textRef = useRef<SVGTextElement>(null)
  const [bbox, setBbox] = useState({ width: 0, height: 0 })

  useEffect(() => {
    if (textRef.current) {
      const { width, height } = textRef.current.getBBox()
      setBbox({ width, height })
    }
  }, [label, labelFontSize])

  if (!sourceNode || !targetNode) {
    return null
  }

  const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(
    sourceNode,
    targetNode
  )

  const parallelOffset = (data?.parallelOffset as number | undefined) ?? 0
  const hubOffset = data?.hubOffset as
    { source: number; target: number } | undefined

  const {
    sourceX: offsetSx,
    sourceY: offsetSy,
    targetX: offsetTx,
    targetY: offsetTy,
  } = offsetEdgeEndpoints(
    parallelOffset,
    { x: sx, y: sy, position: sourcePos, ...resolveMeasuredSize(sourceNode) },
    { x: tx, y: ty, position: targetPos, ...resolveMeasuredSize(targetNode) },
    hubOffset
  )

  const [edgePath] = getBezierPath({
    sourceX: offsetSx,
    sourceY: offsetSy,
    sourcePosition: sourcePos,
    targetPosition: targetPos,
    targetX: offsetTx,
    targetY: offsetTy,
  })

  const labelOffset = data?.labelOffset as { x: number; y: number } | undefined
  const labelX = (offsetSx + offsetTx) / 2 + (labelOffset?.x ?? 0)
  const labelY = (offsetSy + offsetTy) / 2 + (labelOffset?.y ?? 0)

  return (
    <g>
      <path
        id={id}
        d={edgePath}
        className="react-flow__edge-path"
        style={{
          stroke: 'transparent',
          strokeWidth: 20,
        }}
      />
      <path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        markerEnd={markerEnd}
        markerStart={markerStart}
        style={
          reverseAnimation ? { ...style, animationDirection: 'reverse' } : style
        }
      />
      {selected && (
        <EdgeEndpoints
          sourceX={offsetSx}
          sourceY={offsetSy}
          targetX={offsetTx}
          targetY={offsetTy}
        />
      )}
      {label && (
        <>
          <rect
            x={labelX - bbox.width / 2 - 4}
            y={labelY - bbox.height / 2 - 2}
            width={bbox.width + 8}
            height={bbox.height + 4}
            fill={(labelStyle?.backgroundColor as string) ?? '#1e2533'}
            rx={4}
            ry={4}
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          />
          <text
            ref={textRef}
            x={labelX}
            y={labelY}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={(labelStyle?.color as string) ?? '#f4f7fc'}
            style={{
              pointerEvents: 'none',
              userSelect: 'none',
              fontSize: labelFontSize,
            }}
          >
            {label}
          </text>
        </>
      )}
    </g>
  )
}
