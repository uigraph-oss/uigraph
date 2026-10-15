'use client'

import {
  BetterDialogCloseButton,
  BetterDialogContent,
  BetterDialogProvider,
} from '@/components/better-dialog'
import { SuperCircleLoader } from '@/components/loader'
import { Button } from '@/components/ui/button'
import { DialogClose, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  FOCAL_POINTS,
  UPDATE_FOCAL_POINT,
} from '@/features/dashboard-pages/api/focal-point'
import {
  FRAME_GROUPS,
  UPDATE_FRAME_GROUP,
} from '@/features/dashboard-pages/api/frame-group'
import {
  FocalPointDot,
  FrameGroupRect,
  ImageFrameCanvas,
} from '@/features/image-frame-canvas'
import { getVirtualPointPosition } from '@/features/image-frame-canvas/helpers'
import { uploadFile } from '@/features/uploads/api/uploads'
import { cn } from '@/lib/utils'
import { useCurrentOrganization } from '@/store/auth-store'
import { useMutation, useQuery } from '@apollo/client'
import { arrayNonNullable } from 'daily-code'
import { Check, Upload, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { LuArrowLeft, LuArrowRight, LuRotateCcw } from 'react-icons/lu'
import { toast } from 'sonner'
import { DashboardFrame } from '../../api'
import { useSingleProject } from '../../contexts/project-context'

const inputClassName =
  'h-[56px] rounded-[16px] border border-[#2A3242] bg-transparent px-6 focus:outline-none'
const textareaClassName =
  'min-h-[80px] w-full resize-none rounded-[16px] border border-[#2A3242] bg-transparent px-6 py-4 text-sm focus:outline-none'

const STEPS = ['Frame details', 'Reposition points']

type PointPosition = { x: number; y: number }
type GroupPosition = { x: number; y: number; width: number; height: number }

type CanvasDrag =
  | { type: 'point'; id: string; x: number; y: number }
  | {
      type: 'group'
      id: string
      anchorX: number
      anchorY: number
      x: number
      y: number
      width: number
      height: number
    }

export function EditFrameModal({
  open,
  onOpenChange,
  frame,
}: {
  open: boolean
  onOpenChange: (isOpen: boolean) => void
  frame: DashboardFrame
}) {
  return (
    <BetterDialogProvider
      open={open}
      onOpenChange={onOpenChange}
      className="h-[100%]! min-h-[100%]! [--width:100%]"
    >
      <EditFrameModalContent frame={frame} onOpenChange={onOpenChange} />
    </BetterDialogProvider>
  )
}

function EditFrameModalContent({
  frame,
  onOpenChange,
}: {
  frame: DashboardFrame
  onOpenChange: (isOpen: boolean) => void
}) {
  const organizationId = useCurrentOrganization()?.id
  const { mapId, updateFrame } = useSingleProject()

  const [stepIndex, setStepIndex] = useState(0)
  const [name, setName] = useState(frame.name ?? '')
  const [description, setDescription] = useState(frame.description ?? '')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [aspectRatio, setAspectRatio] = useState<number | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [drag, setDrag] = useState<CanvasDrag | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [movedPoints, setMovedPoints] = useState<Record<string, PointPosition>>(
    {}
  )
  const [movedGroups, setMovedGroups] = useState<Record<string, GroupPosition>>(
    {}
  )

  const fileInputRef = useRef<HTMLInputElement>(null)

  const listVars = { orgId: organizationId!, mapId, frameId: frame.id }
  const listSkip = { skip: !organizationId || !mapId }

  const focalPointsQuery = useQuery(FOCAL_POINTS, {
    fetchPolicy: 'cache-and-network',
    variables: listVars,
    ...listSkip,
  })

  const groupsQuery = useQuery(FRAME_GROUPS, {
    fetchPolicy: 'cache-and-network',
    variables: listVars,
    ...listSkip,
  })

  const [updateFocalPoint] = useMutation(UPDATE_FOCAL_POINT)
  const [updateFrameGroup] = useMutation(UPDATE_FRAME_GROUP)

  const focalPoints = arrayNonNullable(focalPointsQuery.data?.focalPoints)
  const frameGroups = arrayNonNullable(groupsQuery.data?.frameGroups)

  const overlayCount = focalPoints.length + frameGroups.length
  const canReposition = !!imagePreview && overlayCount > 0
  const movedCount =
    Object.keys(movedPoints).length + Object.keys(movedGroups).length

  function resetPositions() {
    setMovedPoints({})
    setMovedGroups({})
    setSelectedGroupId(null)
  }

  function clearImage() {
    setImageFile(null)
    setImagePreview(null)
    setAspectRatio(null)
    resetPositions()
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function pointPosition(id: string, fallback: PointPosition): PointPosition {
    if (drag?.type === 'point' && drag.id === id) {
      return { x: drag.x, y: drag.y }
    }
    return movedPoints[id] ?? fallback
  }

  function groupPosition(id: string, fallback: GroupPosition): GroupPosition {
    if (drag?.type === 'group' && drag.id === id) {
      return { x: drag.x, y: drag.y, width: drag.width, height: drag.height }
    }
    return movedGroups[id] ?? fallback
  }

  function handleDragMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag) return

    const rect = event.currentTarget.getBoundingClientRect()
    const position = getVirtualPointPosition(rect.width, {
      x: event.clientX - rect.left,
      y: Math.min(event.clientY - rect.top, rect.height),
    })

    if (drag.type === 'point') {
      setDrag({ ...drag, x: position.x, y: position.y })
      return
    }

    setDrag({
      ...drag,
      x: Math.min(drag.anchorX, position.x),
      y: Math.min(drag.anchorY, position.y),
      width: Math.abs(position.x - drag.anchorX),
      height: Math.abs(position.y - drag.anchorY),
    })
  }

  function handleDragEnd() {
    if (!drag) return

    if (drag.type === 'point') {
      setMovedPoints((current) => ({
        ...current,
        [drag.id]: { x: drag.x, y: drag.y },
      }))
    } else if (drag.width > 0 && drag.height > 0) {
      setMovedGroups((current) => ({
        ...current,
        [drag.id]: {
          x: drag.x,
          y: drag.y,
          width: drag.width,
          height: drag.height,
        },
      }))
    }

    setDrag(null)
  }

  async function handleSave() {
    setIsSaving(true)

    try {
      const screenshotAssetId = imageFile
        ? await uploadFile(organizationId!, imageFile)
        : undefined

      for (const [id, position] of Object.entries(movedPoints)) {
        await updateFocalPoint({
          variables: {
            ...listVars,
            id,
            input: { locationX: position.x, locationY: position.y },
          },
        })
      }

      for (const [id, position] of Object.entries(movedGroups)) {
        await updateFrameGroup({
          variables: {
            ...listVars,
            id,
            input: {
              locationX: position.x,
              locationY: position.y,
              width: position.width,
              height: position.height,
            },
          },
        })
      }

      await updateFrame({
        variables: {
          orgId: organizationId!,
          mapId,
          id: frame.id,
          input: { name, description, screenshotAssetId },
        },
      })

      onOpenChange(false)
    } catch {
      toast.error('Failed to save the frame')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <BetterDialogContent
      _headerContent={
        <DialogHeader className="border-stock flex min-h-18 w-full shrink-0 flex-row items-center gap-6 border-b px-6">
          <DialogTitle className="shrink-0 text-left text-base font-medium">
            Edit Frame
          </DialogTitle>

          {overlayCount > 0 && (
            <ol className="hidden min-w-0 flex-1 items-center gap-2 lg:flex">
              {STEPS.map((label, index) => (
                <li
                  key={label}
                  className="flex min-w-0 items-center gap-2 last:flex-1"
                >
                  <span
                    className={cn(
                      'flex size-5 shrink-0 items-center justify-center rounded-full border text-[0.625rem] font-medium transition-colors',
                      index < stepIndex &&
                        'border-primary/40 bg-primary/10 text-primary',
                      index === stepIndex &&
                        'border-primary bg-primary text-white',
                      index > stepIndex && 'border-stock text-paragraph/60'
                    )}
                  >
                    {index < stepIndex ? (
                      <Check className="size-3" />
                    ) : (
                      index + 1
                    )}
                  </span>

                  <span
                    className={cn(
                      'truncate text-xs transition-colors',
                      index <= stepIndex
                        ? 'text-foreground'
                        : 'text-paragraph/60'
                    )}
                  >
                    {label}
                  </span>

                  {index < STEPS.length - 1 && (
                    <span
                      className={cn(
                        'h-px min-w-3 flex-1 transition-colors',
                        index < stepIndex ? 'bg-primary/30' : 'bg-stock'
                      )}
                    />
                  )}
                </li>
              ))}
            </ol>
          )}

          <BetterDialogCloseButton className="ml-auto" />
        </DialogHeader>
      }
      _footerContent={
        <footer className="border-stock flex shrink-0 items-center justify-between gap-3 border-t px-6 py-4">
          {stepIndex === 0 ? (
            <>
              <DialogClose asChild>
                <Button preset="outline" disabled={isSaving}>
                  Cancel
                </Button>
              </DialogClose>

              {canReposition ? (
                <Button
                  preset="primary"
                  disabled={!name}
                  onClick={() => setStepIndex(1)}
                >
                  Continue
                  <LuArrowRight />
                </Button>
              ) : (
                <Button
                  preset="primary"
                  disabled={isSaving || !name}
                  onClick={handleSave}
                >
                  {isSaving && <SuperCircleLoader />}
                  Save Changes
                </Button>
              )}
            </>
          ) : (
            <>
              <Button
                preset="outline"
                disabled={isSaving}
                onClick={() => setStepIndex(0)}
              >
                <LuArrowLeft />
                Back
              </Button>

              <div className="flex items-center gap-3">
                <span className="text-paragraph/60 text-xs">
                  {movedCount === 0
                    ? 'Nothing repositioned yet'
                    : `${movedCount} repositioned`}
                </span>

                <Button
                  preset="ghost"
                  disabled={isSaving || movedCount === 0}
                  onClick={resetPositions}
                >
                  <LuRotateCcw />
                  Reset
                </Button>

                <Button
                  preset="primary"
                  disabled={isSaving}
                  onClick={handleSave}
                >
                  {isSaving && <SuperCircleLoader />}
                  Save Changes
                </Button>
              </div>
            </>
          )}
        </footer>
      }
    >
      {stepIndex === 0 ? (
        <div className="mx-auto w-full max-w-xl space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm font-normal">
              Frame Name
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoCorrect="off"
              autoComplete="off"
              autoCapitalize="off"
              placeholder="e.g. Checkout Flow"
              className={cn(inputClassName, !name && 'border-red-500')}
            />
            {!name && (
              <p className="text-sm text-red-500">Frame name is required</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-sm font-normal">
              Description (Optional)
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              autoCorrect="off"
              autoComplete="off"
              autoCapitalize="off"
              placeholder="Describe what happens in this frame"
              className={textareaClassName}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-normal">
              Replace UI Screenshot/Design (Optional)
            </Label>

            <div className="flex items-center gap-3">
              <Button
                preset="outline"
                onClick={() => fileInputRef.current?.click()}
                className="h-10 px-4 text-sm"
              >
                {imageFile ? 'Change File' : 'Choose File'}
              </Button>

              <span className="text-paragraph/60 min-w-0 flex-1 truncate text-sm">
                {imageFile ? imageFile.name : 'No file chosen'}
              </span>

              {imageFile ? (
                <Button
                  preset="ghost"
                  size="icon"
                  onClick={clearImage}
                  className="text-paragraph/60 h-6 w-6 hover:text-red-500"
                >
                  <X className="h-4 w-4" />
                </Button>
              ) : (
                <Upload className="text-paragraph/60 h-4 w-4" />
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (!file) return

                  setImageFile(file)
                  setAspectRatio(null)
                  resetPositions()

                  const reader = new FileReader()
                  reader.onload = (loaded) => {
                    setImagePreview(loaded.target?.result as string)
                  }
                  reader.readAsDataURL(file)
                }}
                className="hidden"
              />
            </div>

            {imagePreview && (
              <div className="border-stock rounded-[16px] border p-3">
                <img
                  src={imagePreview}
                  alt="New frame preview"
                  className="mx-auto block h-48 w-full rounded-[12px] object-contain"
                />
              </div>
            )}

            {canReposition && (
              <p className="text-paragraph/60 text-xs">
                This frame has {overlayCount} focal points and groups. Continue
                to line them up with the new image.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex h-full items-center justify-center select-none">
          <div
            className="h-full max-w-full"
            style={{ aspectRatio: aspectRatio ?? undefined }}
          >
            <ImageFrameCanvas
              frame={{ ...frame, screenshotImageUrl: imagePreview }}
              setCanvasSize={({ width, height }) =>
                setAspectRatio(width / height)
              }
              onEmptyClick={() => setSelectedGroupId(null)}
              content={
                <>
                  {frameGroups.map((frameGroup) => {
                    const position = groupPosition(frameGroup.id, {
                      x: frameGroup.locationX!,
                      y: frameGroup.locationY!,
                      width: frameGroup.width!,
                      height: frameGroup.height!,
                    })

                    return (
                      <FrameGroupRect
                        key={frameGroup.id}
                        frame={frame}
                        frameGroup={{
                          ...frameGroup,
                          locationX: position.x,
                          locationY: position.y,
                          width: position.width,
                          height: position.height,
                        }}
                        isSelected={selectedGroupId === frameGroup.id}
                        contentSize="md"
                        onClick={() => setSelectedGroupId(frameGroup.id)}
                        onResizePointerDown={(corner) => {
                          const right = position.x + position.width
                          const bottom = position.y + position.height

                          setDrag({
                            type: 'group',
                            id: frameGroup.id,
                            anchorX: corner.endsWith('-left')
                              ? right
                              : position.x,
                            anchorY: corner.startsWith('top-')
                              ? bottom
                              : position.y,
                            x: position.x,
                            y: position.y,
                            width: position.width,
                            height: position.height,
                          })
                        }}
                      />
                    )
                  })}

                  {focalPoints.map((focalPoint) => {
                    const position = pointPosition(focalPoint.id, {
                      x: focalPoint.locationX!,
                      y: focalPoint.locationY!,
                    })

                    return (
                      <FocalPointDot
                        key={focalPoint.id}
                        focalPoint={{
                          ...focalPoint,
                          locationX: position.x,
                          locationY: position.y,
                        }}
                        contentSize="md"
                        onPointerDown={() =>
                          setDrag({
                            type: 'point',
                            id: focalPoint.id,
                            x: position.x,
                            y: position.y,
                          })
                        }
                      />
                    )
                  })}

                  {drag && (
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
                </>
              }
            />
          </div>
        </div>
      )}
    </BetterDialogContent>
  )
}
