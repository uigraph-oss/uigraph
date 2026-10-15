const ENDPOINT_RADIUS = 5

type TEdgeEndpointsProps = {
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
}

export function EdgeEndpoints({
  sourceX,
  sourceY,
  targetX,
  targetY,
}: TEdgeEndpointsProps) {
  return (
    <>
      <circle
        r={ENDPOINT_RADIUS}
        className="react-flow__edge-endpoint"
        style={{
          transform: `translate(${sourceX}px, ${sourceY}px) scale(var(--react-flow-counter-scale))`,
        }}
      />
      <circle
        r={ENDPOINT_RADIUS}
        className="react-flow__edge-endpoint"
        style={{
          transform: `translate(${targetX}px, ${targetY}px) scale(var(--react-flow-counter-scale))`,
        }}
      />
    </>
  )
}
