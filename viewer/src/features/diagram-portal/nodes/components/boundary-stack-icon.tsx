const MAX_STACK_PLATES = 4
const MIN_STACK_PLATES = 2

const PLATE_HALF_WIDTH = 13
const PLATE_HALF_HEIGHT = 6.5
const PLATE_STEP = 7.8
const PLATE_STROKE = 2.4
const PLATE_PADDING = PLATE_STROKE / 2 + 0.5

export function BoundaryStackIcon({
  levels,
  color,
}: {
  levels: number
  color: string
}) {
  const plateCount = Math.min(
    Math.max(levels + 1, MIN_STACK_PLATES),
    MAX_STACK_PLATES
  )

  const width = PLATE_HALF_WIDTH * 2 + PLATE_PADDING * 2
  const height =
    PLATE_HALF_HEIGHT * 2 + PLATE_STEP * (plateCount - 1) + PLATE_PADDING * 2

  const centerX = width / 2

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: '1.3em', height: 'auto', color }}
      fill="none"
      aria-hidden
    >
      {Array.from({ length: plateCount }, (_, index) => {
        const centerY = PLATE_PADDING + PLATE_HALF_HEIGHT + PLATE_STEP * index

        const left = `${centerX - PLATE_HALF_WIDTH},${centerY}`
        const right = `${centerX + PLATE_HALF_WIDTH},${centerY}`
        const bottom = `${centerX},${centerY + PLATE_HALF_HEIGHT}`
        const top = `${centerX},${centerY - PLATE_HALF_HEIGHT}`

        if (index === 0) {
          return (
            <polygon
              key={index}
              points={`${top} ${right} ${bottom} ${left}`}
              fill="currentColor"
              fillOpacity={0.35}
              stroke="currentColor"
              strokeWidth={PLATE_STROKE}
              strokeLinejoin="round"
            />
          )
        }

        return (
          <path
            key={index}
            d={`M ${left} L ${bottom} L ${right}`}
            stroke="currentColor"
            strokeOpacity={0.8}
            strokeWidth={PLATE_STROKE}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )
      })}
    </svg>
  )
}
