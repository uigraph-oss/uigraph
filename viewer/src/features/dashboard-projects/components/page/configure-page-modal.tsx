'use client'

import { BasicModal } from '@/components/basic-modal'
import { SuperCircleLoader } from '@/components/loader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { zodResolver } from '@hookform/resolvers/zod'
import { Upload, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'

const inputClassName =
  'h-[56px] rounded-[16px] border border-[#2A3242] bg-transparent px-6 focus:outline-none'
const textareaClassName =
  'min-h-[80px] w-full resize-none rounded-[16px] border border-[#2A3242] bg-transparent px-6 py-4 text-sm focus:outline-none'

interface ConfigurePageModalProps {
  open: boolean
  onOpenChange: (isOpen: boolean) => void

  title: string
  description: string
  ctaLabel: string

  initialValues?: {
    name?: string
    description?: string
    profileId?: string
    imageFile?: File | null
  }

  submitForm: (data: {
    name: string
    description?: string
    profileId: string
    imageFile: File | null
  }) => Promise<void>
}

const createPageSchema = z.object({
  name: z.string().min(1, 'Page name is required'),
  description: z.string().optional(),
  profileId: z.string().optional().default('default'),
  imageFile: z.custom<File | null>(
    (val) => val instanceof File && val !== null,
    { message: 'UI screenshot/design is required' }
  ),
})

export function ConfigurePageModal({
  title,
  description,
  ctaLabel,
  open,
  onOpenChange,
  initialValues,
  submitForm,
}: ConfigurePageModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm({
    mode: 'onChange',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(createPageSchema) as any,
    values: {
      name: initialValues?.name || '',
      description: initialValues?.description || '',
      profileId: initialValues?.profileId || 'default',
      imageFile: initialValues?.imageFile || null,
    },
  })
  const imageFile = watch('imageFile')

  useEffect(() => {
    reset()
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [open, reset])

  return (
    <BasicModal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
    >
      <form
        onSubmit={handleSubmit(async (data) => {
          setIsLoading(true)
          setErrorMessage('')
          try {
            const createData = data as {
              name: string
              description?: string
              profileId: string
              imageFile: File | null
            }
            await submitForm({
              name: createData.name,
              description: createData.description,
              profileId: createData.profileId,
              imageFile: createData.imageFile ?? null,
            })
          } catch (_err) {
            setErrorMessage('Something went wrong. Please try again.')
          }
          setIsLoading(false)
        })}
        className="space-y-6"
      >
        <div className="space-y-2">
          <Label htmlFor="name" className="leding-[1.33] text-sm font-normal">
            Frame Name
          </Label>
          <Controller
            name="name"
            control={control}
            render={({ field }) => (
              <Input
                id="name"
                {...field}
                autoCorrect="off"
                autoComplete="off"
                autoCapitalize="off"
                placeholder="e.g. Checkout Flow"
                className={cn(inputClassName, errors.name && 'border-red-500')}
              />
            )}
          />
          {errors.name && (
            <p className="text-sm text-red-500">{errors.name.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label
            htmlFor="description"
            className="text-sm leading-[1.33] font-normal"
          >
            Description (Optional)
          </Label>
          <Controller
            name="description"
            control={control}
            render={({ field }) => (
              <Textarea
                id="description"
                {...field}
                autoCorrect="off"
                autoComplete="off"
                autoCapitalize="off"
                placeholder="Describe what happens in this frame"
                className={cn(
                  textareaClassName,
                  errors.description && 'border-red-500'
                )}
              />
            )}
          />
          {errors.description && (
            <p className="text-sm text-red-500">{errors.description.message}</p>
          )}
        </div>
        <>
          <div className="space-y-2">
            <Label className="text-sm font-normal">
              Upload UI Screenshot/Design
            </Label>
            <Controller
              name="imageFile"
              control={control}
              render={({ field }) =>
                !imagePreview ? (
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      preset="outline"
                      onClick={() => fileInputRef.current?.click()}
                      className="h-10 px-4 text-sm"
                    >
                      Choose File
                    </Button>
                    <span className="text-muted-foreground text-sm">
                      {imageFile ? imageFile.name : 'No file chosen'}
                    </span>
                    <Upload className="text-muted-foreground h-4 w-4" />
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          field.onChange(e.target.files[0])
                          const reader = new FileReader()
                          reader.onload = (ev) => {
                            setImagePreview(ev.target?.result as string)
                          }
                          reader.readAsDataURL(e.target.files[0])
                        }
                      }}
                      className="hidden"
                    />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Button
                        type="button"
                        preset="outline"
                        onClick={() => fileInputRef.current?.click()}
                        className="h-10 px-4 text-sm"
                      >
                        Change File
                      </Button>
                      <span className="text-sm font-medium text-[#F4F7FC]">
                        {imageFile?.name}
                      </span>
                      <Button
                        type="button"
                        preset="ghost"
                        size="icon"
                        onClick={() => {
                          field.onChange(null)
                          setImagePreview(null)
                          if (fileInputRef.current)
                            fileInputRef.current.value = ''
                        }}
                        className="text-muted-foreground h-6 w-6 hover:text-red-500"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="rounded-[16px] border border-[#2A3242] bg-transparent p-3">
                      <img
                        src={imagePreview || '/placeholder.svg'}
                        alt="Preview"
                        className="mx-auto block h-48 w-full rounded-[12px] border border-[#2A3242] object-contain"
                      />
                    </div>
                  </div>
                )
              }
            />
            <p className="text-muted-foreground text-xs">
              Tip: Use a clear, high-resolution image of the UI you want to
              document
            </p>
            {errors.imageFile && (
              <p className="text-sm text-red-500">{errors.imageFile.message}</p>
            )}
          </div>
        </>
        {errorMessage && <p className="text-sm text-red-500">{errorMessage}</p>}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            preset="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button type="submit" preset="primary" disabled={isLoading}>
            {isLoading && <SuperCircleLoader />}
            {ctaLabel}
          </Button>
        </div>
      </form>
    </BasicModal>
  )
}
