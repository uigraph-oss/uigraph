import { FocalPoint } from '@/features/dashboard-pages/api/focal-point'
import { cn } from '@/lib/utils'
import { getViewPointPositionStyle } from '../helpers'
import { SvgDot } from './svg-dot'

type FocalPointDotProps = {
  contentSize: 'sm' | 'md'
  focalPoint: FocalPoint
  onClick?: () => void
  onPointerDown?: (e: React.PointerEvent<HTMLButtonElement>) => void
}

export function FocalPointDot({
  contentSize,
  focalPoint,
  onClick,
  onPointerDown,
}: FocalPointDotProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={onPointerDown}
      style={{
        ...getViewPointPositionStyle({
          x: focalPoint.locationX!,
          y: focalPoint.locationY!,
        }),
        color: focalPoint.color ? focalPoint.color : undefined,
      }}
      className={cn(
        'group absolute block -translate-x-1/2 -translate-y-1/2 rounded-full',
        !onClick && onPointerDown && 'cursor-grab',
        !focalPoint.color && 'text-primary',
        contentSize === 'sm' && 'text-[1.5rem]',
        contentSize === 'md' && 'text-[3rem]'
      )}
    >
      <SvgDot />
    </button>
  )
}
