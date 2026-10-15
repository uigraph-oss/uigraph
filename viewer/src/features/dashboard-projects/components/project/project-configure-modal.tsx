'use client'

import { BasicModal } from '@/components/basic-modal'
import { SuperCircleLoader } from '@/components/loader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SERVICES } from '@/features/services/api/services'
import { cn } from '@/lib/utils'
import { useCurrentOrganization } from '@/store/auth-store'
import { useQuery } from '@apollo/client'
import { zodResolver } from '@hookform/resolvers/zod'
import { arrayNonNullable } from 'daily-code'
import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'

interface CreateProjectModalProps {
  title: string
  description: string
  ctaLabel: string

  open: boolean
  onOpenChange: (isOpen: boolean) => void
  withService?: boolean

  initialValues?: Partial<z.infer<typeof projectSchema>>
  submitForm: (data: z.infer<typeof projectSchema>) => Promise<void>
}

const projectSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  description: z.string().optional(),
  serviceId: z.string().optional(),
})

export function ConfigureProjectModal({
  submitForm,
  ctaLabel,
  withService,
  ...props
}: CreateProjectModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const organizationId = useCurrentOrganization()?.id
  const servicesRes = useQuery(SERVICES, {
    variables: { orgId: organizationId!, sortBy: 'name', sortDir: 'asc' },
    skip: !organizationId || !withService,
  })
  const services = arrayNonNullable(servicesRes.data?.services.items)

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    mode: 'onChange',
    resolver: zodResolver(projectSchema),
    values: {
      ...props.initialValues,
      name: props.initialValues?.name || '',
    },
  })

  useEffect(() => {
    reset()
  }, [props.open, reset])

  return (
    <BasicModal {...props}>
      <form
        onSubmit={handleSubmit(async (data) => {
          if (withService && !data.serviceId) {
            setErrorMessage(
              'Choose the service whose repository stores this map'
            )
            return
          }
          setIsLoading(true)
          setErrorMessage('')
          try {
            await submitForm(data)
          } catch (err) {
            setErrorMessage(
              err instanceof Error
                ? err.message
                : 'Something went wrong. Please try again.'
            )
          }
          setIsLoading(false)
        })}
        className="space-y-6"
      >
        <div className="space-y-2">
          <Label htmlFor="name" className="leding-[1.33] text-sm font-normal">
            Map Name
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
                className={cn(
                  'h-[56px] rounded-[16px] border border-[#2A3242] bg-[#1E2533] px-6 focus:outline-none',
                  errors.name && 'border-red-500'
                )}
              />
            )}
          />
          {errors.name && (
            <p className="text-sm text-red-500">{errors.name.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Controller
            name="description"
            control={control}
            render={({ field }) => (
              <Input
                id="description"
                {...field}
                autoCorrect="off"
                autoComplete="off"
                autoCapitalize="off"
                placeholder="Describe what this map represents"
                className={cn(
                  'h-[56px] rounded-[16px] border border-[#2A3242] bg-[#1E2533] px-6 focus:outline-none',
                  errors.description && 'border-red-500'
                )}
              />
            )}
          />
          {errors.description && (
            <p className="text-sm text-red-500">{errors.description.message}</p>
          )}
        </div>

        {withService && (
          <div className="space-y-2">
            <Label htmlFor="service">Service</Label>
            <Controller
              name="serviceId"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger
                    id="service"
                    className="h-[56px]! w-full rounded-[16px] border border-[#2A3242] bg-[#1E2533] px-6 focus:outline-none"
                  >
                    <SelectValue
                      className="text-sm leading-[1.33] font-normal text-[#828DA3]"
                      placeholder="Select the service that stores this map"
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {services.map((service) => (
                      <SelectItem key={service.id} value={service.id}>
                        {service.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <p className="text-muted-foreground text-xs">
              The map is saved in this service&apos;s .uigraph.yaml
            </p>
          </div>
        )}

        {errorMessage && <p className="text-sm text-red-500">{errorMessage}</p>}

        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => props.onOpenChange(false)}
            disabled={isLoading}
            className="bg-shading text-paragraph border-stock h-11 rounded-[12.85px] text-sm leading-[1.33] font-normal"
          >
            Cancel
          </Button>

          <Button
            type="submit"
            disabled={isLoading}
            className="h-11 rounded-[12.85px] bg-[#015AEB] text-sm leading-[1.33] font-normal hover:bg-blue-700"
          >
            {isLoading && <SuperCircleLoader />}
            {ctaLabel}
          </Button>
        </div>
      </form>
    </BasicModal>
  )
}
