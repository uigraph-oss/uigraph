import {
  FocalPointDot,
  FrameGroupRect,
  ImageFrameCanvas,
  LinkedPageDot,
  LinkedProjectDot,
} from '@/features/image-frame-canvas'
import { getVirtualPointPosition } from '@/features/image-frame-canvas/helpers'
import { usePermissions } from '@/hooks/use-permissions'
import { cn } from '@/lib/utils'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useFocalPointContext } from '../context/focal-point-context'
import { DrawOnCanvas } from './add-group-on-canvas'
import { AddPointOnCanvas } from './add-point-on-canvas'
import { AddFocalPointModal } from './temp-focal-point-modal'
import { DrawRectArea } from './temp-frame-group-modal'
import { AddLinkModal } from './temp-link-modal'

type CanvasDrag =
  | {
      type: 'point'
      id: string
      x: number
      y: number
      isSaving: boolean
    }
  | {
      type: 'group'
      id: string
      anchorX: number
      anchorY: number
      x: number
      y: number
      width: number
      height: number
      isSaving: boolean
    }

export function FocalPointCanvas() {
  const {
    frame,
    preset,
    newPoint,
    drawRectMode,

    focalPoints,
    frameGroups,
    frameLinks,

    canvasTarget,
    selectedFrameGroup,

    updateFocalPoint,
    updateFrameGroup,
    updateFrameLink,
    deleteFrameLink,
  } = useFocalPointContext()

  const { canWrite } = usePermissions()

  const pageLinks = frameLinks.filter((link) => link.kind === 'frame')
  const projectLinks = frameLinks.filter((link) => link.kind === 'map')

  const containerRef = useRef<HTMLDivElement>(null)

  const [containerWidth, setContainerWidth] = useState(0)
  const [availableHeight, setAvailableHeight] = useState(0)
  const [aspectRatio, setAspectRatio] = useState<number | null>(null)
  const [drag, setDrag] = useState<CanvasDrag | null>(null)

  useEffect(() => {
    const container = containerRef.current!
    const editor = container.closest('#focal-point-editor')

    if (!container || !editor) return

    const resizeObserver = new ResizeObserver(() => {
      setContainerWidth(container.clientWidth)
      setAvailableHeight(editor.clientHeight)
    })

    setContainerWidth(container.clientWidth)
    setAvailableHeight(editor.clientHeight)

    resizeObserver.observe(container)
    resizeObserver.observe(editor)

    return () => resizeObserver.disconnect()
  }, [containerRef])

  function handleDragMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag || drag.isSaving) return

    const rect = e.currentTarget.getBoundingClientRect()
    const position = getVirtualPointPosition(rect.width, {
      x: e.clientX - rect.left,
      y: Math.min(e.clientY - rect.top, rect.height),
    })

    if (drag.type === 'point') {
      setDrag({ ...drag, x: position.x, y: position.y })
    } else if (drag.type === 'group') {
      setDrag({
        ...drag,
        x: Math.min(drag.anchorX, position.x),
        y: Math.min(drag.anchorY, position.y),
        width: Math.abs(position.x - drag.anchorX),
        height: Math.abs(position.y - drag.anchorY),
      })
    }
  }

  async function handleDragEnd() {
    if (!drag || drag.isSaving) return

    setDrag({ ...drag, isSaving: true })

    try {
      if (drag.type === 'point') {
        canvasTarget.setTarget('point', drag.id)

        const focalPoint = focalPoints.find((f) => f.id === drag.id)!

        if (
          drag.x !== focalPoint.locationX ||
          drag.y !== focalPoint.locationY
        ) {
          await updateFocalPoint(drag.id, {
            locationX: drag.x,
            locationY: drag.y,
          })
        }
      } else if (drag.type === 'group') {
        const frameGroup = frameGroups.find((g) => g.id === drag.id)!

        const hasChanges =
          drag.x !== frameGroup.locationX ||
          drag.y !== frameGroup.locationY ||
          drag.width !== frameGroup.width ||
          drag.height !== frameGroup.height

        if (hasChanges && drag.width > 0 && drag.height > 0) {
          await updateFrameGroup(drag.id, {
            locationX: drag.x,
            locationY: drag.y,
            width: drag.width,
            height: drag.height,
          })
        }
      }
    } catch {
      toast.error(
        drag.type === 'point'
          ? 'Failed to move focal point'
          : 'Failed to resize group'
      )
    } finally {
      setDrag(null)
    }
  }

  return (
    <div ref={containerRef} className="select-none">
      <div
        className="relative isolate mx-auto"
        style={{
          maxWidth:
            preset === 'mobile'
              ? 'max(500px,30%)'
              : preset === 'tablet'
                ? 'max(768px,50%)'
                : preset === 'desktop'
                  ? '100%'
                  : calculateMaxWidth(
                      availableHeight,
                      containerWidth,
                      aspectRatio
                    ),
        }}
      >
        <ImageFrameCanvas
          frame={frame!}
          setCanvasSize={({ width, height }) => setAspectRatio(width / height)}
          onEmptyClick={() => {
            canvasTarget.clearTarget()
          }}
          content={
            <>
              {frameGroups.map((frameGroup) => (
                <FrameGroupRect
                  frame={frame!}
                  key={frameGroup.id}
                  frameGroup={
                    drag?.type === 'group' && drag.id === frameGroup.id
                      ? {
                          ...frameGroup,
                          locationX: drag.x,
                          locationY: drag.y,
                          width: drag.width,
                          height: drag.height,
                        }
                      : frameGroup
                  }
                  isSelected={selectedFrameGroup?.id === frameGroup.id}
                  contentSize="md"
                  onClick={() => {
                    canvasTarget.setTarget('group', frameGroup.id)
                  }}
                  onResizePointerDown={
                    canWrite
                      ? (corner) => {
                          const left = frameGroup.locationX!
                          const top = frameGroup.locationY!
                          const right = left + frameGroup.width!
                          const bottom = top + frameGroup.height!

                          setDrag({
                            type: 'group',
                            id: frameGroup.id,
                            anchorX: corner.endsWith('-left') ? right : left,
                            anchorY: corner.startsWith('top-') ? bottom : top,
                            x: left,
                            y: top,
                            width: frameGroup.width!,
                            height: frameGroup.height!,
                            isSaving: false,
                          })
                        }
                      : undefined
                  }
                />
              ))}

              {pageLinks.map((pageLink) => (
                <LinkedPageDot
                  key={pageLink.id}
                  pageLink={pageLink}
                  contentSize="md"
                  deletePageLink={async () => {
                    await deleteFrameLink(pageLink.id)
                  }}
                  updatePageLink={async (data) => {
                    await updateFrameLink(pageLink.id, { label: data.label })
                  }}
                />
              ))}

              {projectLinks.map((projectLink) => (
                <LinkedProjectDot
                  key={projectLink.id}
                  projectLink={projectLink}
                  contentSize="md"
                  deleteProjectLink={async () => {
                    await deleteFrameLink(projectLink.id)
                  }}
                  updateProjectLink={async (data) => {
                    await updateFrameLink(projectLink.id, { label: data.label })
                  }}
                />
              ))}

              {focalPoints.map((focalPoint) => (
                <FocalPointDot
                  key={focalPoint.id}
                  focalPoint={
                    drag?.type === 'point' && drag.id === focalPoint.id
                      ? { ...focalPoint, locationX: drag.x, locationY: drag.y }
                      : focalPoint
                  }
                  contentSize="md"
                  onClick={() => {
                    canvasTarget.setTarget('point', focalPoint.id)
                  }}
                  onPointerDown={
                    canWrite
                      ? () => {
                          setDrag({
                            type: 'point',
                            id: focalPoint.id,
                            x: focalPoint.locationX!,
                            y: focalPoint.locationY!,
                            isSaving: false,
                          })
                        }
                      : undefined
                  }
                />
              ))}

              {drag && !drag.isSaving && (
                <div
                  className={cn(
                    'absolute inset-0 z-50',
                    drag.type === 'point' && 'cursor-grabbing',
                    drag.type === 'group' && 'cursor-crosshair'
                  )}
                  onPointerMove={handleDragMove}
                  onPointerUp={handleDragEnd}
                  onPointerLeave={handleDragEnd}
                />
              )}

              <AnimatePresence>
                {((newPoint && newPoint.position) ||
                  (drawRectMode && drawRectMode.position)) && (
                  <motion.div
                    className="pointer-events-none absolute inset-0 rounded-[0.75rem] bg-black/20 transition-opacity"
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  />
                )}
              </AnimatePresence>

              {newPoint &&
                newPoint.type === 'focal' &&
                (newPoint.position ? (
                  <>
                    <AddFocalPointModal
                      x={newPoint.position.x}
                      y={newPoint.position.y}
                    />
                  </>
                ) : (
                  <AddPointOnCanvas />
                ))}

              {newPoint &&
                newPoint.type === 'link' &&
                (newPoint.position ? (
                  <>
                    <AddLinkModal
                      x={newPoint.position.x}
                      y={newPoint.position.y}
                    />
                  </>
                ) : (
                  <AddPointOnCanvas />
                ))}

              {drawRectMode &&
                (drawRectMode.position ? (
                  <DrawRectArea
                    x={drawRectMode.position.x}
                    y={drawRectMode.position.y}
                    width={drawRectMode.position.width}
                    height={drawRectMode.position.height}
                  />
                ) : (
                  <DrawOnCanvas />
                ))}
            </>
          }
        />
      </div>
    </div>
  )
}

function calculateMaxWidth(
  availableHeight: number,
  containerWidth: number,
  aspectRatio: number | null
): number | undefined {
  if (!aspectRatio) return

  const containerAspectRatio = containerWidth / availableHeight
  if (aspectRatio > containerAspectRatio) return

  const maxAllowedHeight = availableHeight * 3
  const maxAllowedWidth = maxAllowedHeight * aspectRatio

  return Math.min(containerWidth, maxAllowedWidth, 1600)
}
