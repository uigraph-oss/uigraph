import { FrameGroup } from '@/features/dashboard-pages/api/frame-group'
import { DashboardFrame } from '@/features/dashboard-projects/api'
import { cn } from '@/lib/utils'
import { getViewPointPositionStyle, getViewPointSizeStyle } from '../helpers'

export type FrameGroupCorner =
  'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

type FrameGroupRectProps = {
  contentSize: 'sm' | 'md'
  frame: DashboardFrame
  frameGroup: FrameGroup
  isSelected: boolean
  onClick: () => void
  onResizePointerDown?: (corner: FrameGroupCorner) => void
}

export function FrameGroupRect({
  contentSize,
  frameGroup,
  isSelected,
  onClick,
  onResizePointerDown,
}: FrameGroupRectProps) {
  return (
    <div
      className="absolute"
      style={{
        ...getViewPointPositionStyle({
          x: frameGroup.locationX!,
          y: frameGroup.locationY!,
        }),
        ...getViewPointSizeStyle(frameGroup.width!, frameGroup.height!),
      }}
    >
      <button
        key={frameGroup.id}
        onClick={onClick}
        className={cn(
          'border-primary/50 block size-full rounded-md bg-transparent transition-colors',

          isSelected
            ? 'bg-primary/25 border-primary/80'
            : 'hover:bg-primary/20',

          contentSize === 'sm' && 'border',
          contentSize === 'md' && 'border-2'
        )}
      />

      {isSelected &&
        onResizePointerDown &&
        (
          [
            'top-left',
            'top-right',
            'bottom-left',
            'bottom-right',
          ] as FrameGroupCorner[]
        ).map((corner) => (
          <button
            key={corner}
            type="button"
            aria-label="Resize group"
            onPointerDown={() => onResizePointerDown(corner)}
            className={cn(
              'bg-primary absolute size-3 rounded-sm',
              corner === 'top-left' && '-top-1.5 -left-1.5 cursor-nwse-resize',
              corner === 'top-right' &&
                '-top-1.5 -right-1.5 cursor-nesw-resize',
              corner === 'bottom-left' &&
                '-bottom-1.5 -left-1.5 cursor-nesw-resize',
              corner === 'bottom-right' &&
                '-right-1.5 -bottom-1.5 cursor-nwse-resize'
            )}
          />
        ))}
    </div>
  )
}
