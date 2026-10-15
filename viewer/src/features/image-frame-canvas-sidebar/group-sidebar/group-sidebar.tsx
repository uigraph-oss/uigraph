import { CrossButton } from '@/components/cross-button'
import { useCanvasTarget } from '@/features/image-frame-canvas/hooks/use-canvas-target'
import {
  GroupSidebarDetails,
  GroupSidebarDetailsProps,
} from './group-sidebar-details'

type GroupSidebarProps = GroupSidebarDetailsProps

export function GroupSidebar({
  frame,
  frameGroup,
  frameGroupPoints,
  updateFrameGroup,
  deleteFrameGroup,
}: GroupSidebarProps) {
  const canvasTarget = useCanvasTarget()

  return (
    <>
      <div className="border-stock flex h-14 items-center justify-between border-b px-4 py-3">
        <h2 className="text-lg font-semibold text-gray-900">
          Frame Group Details
        </h2>

        <CrossButton onClick={canvasTarget.clearTarget} className={'size-8'} />
      </div>

      <div className="flex-1 overflow-auto pb-2">
        <GroupSidebarDetails
          frame={frame}
          frameGroup={frameGroup}
          frameGroupPoints={frameGroupPoints}
          updateFrameGroup={updateFrameGroup}
          deleteFrameGroup={deleteFrameGroup}
        />
      </div>
    </>
  )
}
