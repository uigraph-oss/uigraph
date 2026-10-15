import { GT } from '@/api'
import { BetterDialogProvider } from '@/components/better-dialog'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  COMPONENT_API_CONTRACT_ID,
  COMPONENT_FLOW_DIAGRAM_ID,
  COMPONENT_SUPPORT_KB_ID,
} from '@/constants/component-meta'
import { usePermissions } from '@/hooks/use-permissions'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { FiChevronDown } from 'react-icons/fi'
import { LuLink } from 'react-icons/lu'
import { toast } from 'sonner'
import { getFocalPointComponentIcon } from '../../../helpers/get-component-icon'
import { ApiContractSelectionModal } from './api-contract-selection-modal'
import { DeletePointMetaConfirmationModal } from './delete-meta-confirm-modal'
import { DiagramSelectionModal } from './diagram-selection-modal'
import {
  ApiContractLinkMetaMiniCard,
  DiagramLinkMetaMiniCard,
  FocalPointMetaMiniCard,
  FocalPointMetaMiniCardNew,
  ServiceDocLinkMetaMiniCard,
} from './meta-mini-card'
import { ServiceDocSelectionModal } from './service-doc-selection-modal'

export type FocalPointMetaSectionProps = {
  component: GT.Component
  componentPointMeta: GT.FocalPointMeta[]

  showFocalPointName?: boolean
  disableCreatePointMeta?: boolean

  createPointMeta: (
    componentId: string,
    input: {
      componentModalFields?: GT.ComponentModalFieldInput[]
      componentLinkDiagramId?: string
      componentLinkApiEndpointId?: string
      componentLinkServiceDocId?: string
    }
  ) => Promise<void>

  updatePointMeta: (
    pointMetaId: string,
    componentId: string,
    input: { componentModalFields?: GT.ComponentModalFieldInput[] }
  ) => Promise<void>

  deletePointMeta: (pointMetaId: string) => Promise<void>
}

export function FocalPointMetaSection({
  component,
  componentPointMeta,
  createPointMeta,
  updatePointMeta,
  deletePointMeta,
  showFocalPointName,
  disableCreatePointMeta: disableCreatePointMetaProp,
}: FocalPointMetaSectionProps) {
  const { canWrite } = usePermissions()
  const disableCreatePointMeta = disableCreatePointMetaProp || !canWrite

  const [deleteConfirmationPointMeta, setDeleteConfirmationPointMeta] =
    useState<string | null>(null)

  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false)
  const isFlowDiagram = component.componentId === COMPONENT_FLOW_DIAGRAM_ID
  const isApiContract = component.componentId === COMPONENT_API_CONTRACT_ID
  const isServiceDoc = component.componentId === COMPONENT_SUPPORT_KB_ID

  const linkLabel = isFlowDiagram
    ? 'Diagram'
    : isApiContract
      ? 'API Contract'
      : isServiceDoc
        ? 'Documentation'
        : undefined

  const canComponentBeLinked = !!linkLabel

  return (
    <>
      <Accordion
        type="single"
        collapsible
        className="overflow-hidden rounded-[0.8125rem] border border-[#2A3242] bg-[#1E2533]"
        value={componentPointMeta.length > 0 ? undefined : 'none'}
      >
        <AccordionItem value="item-1">
          <div
            key={component.componentId}
            className="flex w-full items-center justify-between gap-3 rounded-none px-4 py-4"
          >
            <div className="flex gap-2">
              <div className="self-start text-[2.25rem]">
                {getFocalPointComponentIcon({
                  component: component.componentId,
                  category: component.category,
                })}
              </div>

              <div className={'flex flex-col gap-1'}>
                <h4 className="text-sm font-medium">{component.name}</h4>

                <p className="text-paragraph text-xs">
                  {component.description}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start">
              {componentPointMeta.length > 0 && (
                <span className="text-primary bg-primary/20 flex h-5 items-center justify-center rounded-lg p-1 px-2 text-xs font-bold">
                  {componentPointMeta.length}
                </span>
              )}

              <div className="flex items-center">
                {componentPointMeta.length === 0 && !disableCreatePointMeta && (
                  <AccordionTrigger
                    className={cn(
                      'text-primary bg-primary/5 flex h-9 items-center justify-center rounded-full px-4 font-medium hover:no-underline [&>svg]:last:hidden',
                      canComponentBeLinked && 'rounded-r-none'
                    )}
                    onClick={(e) => {
                      e.preventDefault()
                      setIsLinkModalOpen(true)
                    }}
                  >
                    Add
                  </AccordionTrigger>
                )}

                {componentPointMeta.length > 0 && (
                  <AccordionTrigger
                    className={cn(
                      'text-primary bg-primary/5 flex h-9 items-center justify-center rounded-full px-2 font-medium hover:no-underline [&>svg]:last:hidden'
                    )}
                  >
                    <FiChevronDown className="text-lg transition-all" />
                  </AccordionTrigger>
                )}

                {canComponentBeLinked &&
                  !disableCreatePointMeta &&
                  componentPointMeta.length === 0 && (
                    <button
                      onClick={() => setIsLinkModalOpen(true)}
                      className="text-primary border-primary/10 bg-primary/5 flex size-9 items-center justify-center rounded-full rounded-l-none border-l pr-1 font-medium hover:no-underline"
                    >
                      <LuLink className="size-4 shrink-0" />
                    </button>
                  )}
              </div>
            </div>
          </div>

          <AccordionContent className="border-t border-[#2A3242] bg-[#141925] p-3">
            <div
              className={cn(
                'flex flex-col gap-2',
                !disableCreatePointMeta && 'mb-3'
              )}
            >
              {componentPointMeta.map((point, i) => {
                const cardProps = {
                  index: i,
                  pointMeta: point,
                  component,
                  showFocalPointName: showFocalPointName ?? false,
                  openDeleteConfirmationModal: () =>
                    setDeleteConfirmationPointMeta(point.id ?? null),
                }
                const key = point.id

                if (point.componentLinkDiagramId)
                  return <DiagramLinkMetaMiniCard key={key} {...cardProps} />
                if (point.componentLinkApiEndpointId)
                  return (
                    <ApiContractLinkMetaMiniCard key={key} {...cardProps} />
                  )
                if (point.componentLinkServiceDocId)
                  return <ServiceDocLinkMetaMiniCard key={key} {...cardProps} />

                return (
                  <FocalPointMetaMiniCard
                    key={key}
                    {...cardProps}
                    updatePointMeta={async ({ componentModalFields }) => {
                      await updatePointMeta(point.id, component.componentId!, {
                        componentModalFields,
                      })
                    }}
                  />
                )
              })}
            </div>

            {!disableCreatePointMeta && (
              <FocalPointMetaMiniCardNew
                setIsLinkModalOpen={setIsLinkModalOpen}
                linkLabel={linkLabel}
              />
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <DeletePointMetaConfirmationModal
        open={Boolean(deleteConfirmationPointMeta)}
        onOpenChange={() => setDeleteConfirmationPointMeta(null)}
        onConfirm={async () => {
          if (!deleteConfirmationPointMeta) return

          try {
            await deletePointMeta(deleteConfirmationPointMeta)
            toast.success('Focal point meta deleted successfully')
          } catch {
            toast.error(
              'Failed to delete focal point meta. Please try again later.'
            )
          }

          setDeleteConfirmationPointMeta(null)
        }}
      />

      <BetterDialogProvider
        open={isLinkModalOpen && isApiContract}
        onOpenChange={setIsLinkModalOpen}
      >
        <ApiContractSelectionModal
          onSelect={async (formData) => {
            try {
              await createPointMeta(component.componentId!, {
                componentLinkApiEndpointId: formData.apiEndpointId,
              })
              setIsLinkModalOpen(false)
              toast.success('Focal point meta created successfully')
            } catch {
              return void toast.error(
                'Failed to create focal point meta. Please try again.'
              )
            }
          }}
        />
      </BetterDialogProvider>

      <BetterDialogProvider
        open={isLinkModalOpen && isFlowDiagram}
        onOpenChange={setIsLinkModalOpen}
        className="[--width:52rem] sm:!h-[90vh]"
      >
        <DiagramSelectionModal
          onSelect={async (formData) => {
            try {
              await createPointMeta(component.componentId!, {
                componentLinkDiagramId: formData,
              })
              toast.success('Focal point meta created successfully')
              setIsLinkModalOpen(false)
            } catch {
              return void toast.error(
                'Failed to create focal point meta. Please try again.'
              )
            }
          }}
        />
      </BetterDialogProvider>

      <BetterDialogProvider
        open={isLinkModalOpen && isServiceDoc}
        onOpenChange={setIsLinkModalOpen}
      >
        <ServiceDocSelectionModal
          onSelect={async (formData) => {
            try {
              await createPointMeta(component.componentId!, {
                componentLinkServiceDocId: formData.serviceDocId,
              })
              setIsLinkModalOpen(false)
              toast.success('Focal point meta created successfully')
            } catch {
              return void toast.error(
                'Failed to create focal point meta. Please try again.'
              )
            }
          }}
        />
      </BetterDialogProvider>
    </>
  )
}
