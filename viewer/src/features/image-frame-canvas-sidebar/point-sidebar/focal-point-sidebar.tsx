'use client'

import { CrossButton } from '@/components/cross-button'
import { SuperLogoLoader } from '@/components/loader'
import { FocalPoint } from '@/features/dashboard-pages/api/focal-point'
import { useCanvasTarget } from '@/features/image-frame-canvas/hooks/use-canvas-target'
import { useFocalPointSidebarContext } from '../contexts/focal-point-sidebar-context'
import { FocalPointDetails, FocalPointDetailsApi } from './focal-point-details'

type FocalPointDrawerProps = FocalPointDetailsApi & {
  focalPoint: FocalPoint
}

export function FocalPointSidebar({
  focalPoint,
  updateFocalPoint,
  deleteFocalPoint,
}: FocalPointDrawerProps) {
  const canvasTarget = useCanvasTarget()
  const { pointMetaLoading } = useFocalPointSidebarContext()

  return (
    <>
      <div className="border-stock flex h-14 items-center justify-between border-b px-4 py-3">
        <h2 className="text-lg font-semibold text-[#F4F7FC]">
          Focal Point Details
        </h2>

        <CrossButton onClick={canvasTarget.clearTarget} className={'size-8'} />
      </div>

      <div className="flex-1 overflow-auto pb-2">
        {pointMetaLoading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <SuperLogoLoader />
          </div>
        ) : (
          <>
            <FocalPointDetails
              focalPoint={focalPoint}
              unselectFocalPoint={canvasTarget.clearTarget}
              updateFocalPoint={updateFocalPoint}
              deleteFocalPoint={deleteFocalPoint}
            />
          </>
        )}
      </div>
    </>
  )
}
