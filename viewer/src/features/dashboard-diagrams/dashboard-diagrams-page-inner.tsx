'use client'

import { CirclePlusIcon } from '@/assets/svgs'
import {
  BetterDialogContent,
  BetterDialogProvider,
} from '@/components/better-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DashboardPageSectionLayout } from '@/features/dashboard'
import { useCurrentOrganization } from '@/store/auth-store'
import { useMutation } from '@apollo/client'
import { useState } from 'react'
import { toast } from 'sonner'
import { CREATE_DIAGRAM } from './api/diagrams'
import { DiagramsContextProvider } from './contexts/diagrams-context'
import { DiagramsFolder } from './diagrams-folder'

export function DashboardDiagramsPageInner() {
  const organizationId = useCurrentOrganization().id
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [name, setName] = useState('')

  const [createDiagram, { loading: isCreating }] = useMutation(CREATE_DIAGRAM, {
    refetchQueries: ['Diagrams'],
    awaitRefetchQueries: true,
  })

  async function handleCreate() {
    if (name.trim() === '') {
      toast.error('Name is required')
      return
    }
    try {
      const { data } = await createDiagram({
        variables: {
          orgId: organizationId!,
          input: { name: name.trim(), content: '{}' },
        },
      })
      const diagramId = data?.createDiagram?.id
      if (!diagramId) throw new Error()

      window.open(`/diagram/${diagramId}`, '_blank')
      setIsCreateOpen(false)
      setName('')
      toast.success('Diagram created')
    } catch {
      toast.error('Failed to create diagram')
    }
  }

  return (
    <DiagramsContextProvider>
      <DashboardPageSectionLayout
        title="System Flows"
        description="Diagrams from your registered projects and ~/.uigraph."
        crumbs={[{ to: '/dashboard/diagrams', label: 'Diagrams' }]}
        headerContent={
          <Button preset="cta" onClick={() => setIsCreateOpen(true)}>
            <CirclePlusIcon />
            Create Flow
          </Button>
        }
      >
        <DiagramsFolder />

        <BetterDialogProvider
          open={isCreateOpen}
          onOpenChange={setIsCreateOpen}
        >
          <BetterDialogContent
            title="Create Flow"
            description="The flow is saved in ~/.uigraph and isn't part of any service."
            footerSubmit="Create Flow"
            footerSubmitLoading={isCreating}
            onFooterSubmitClick={handleCreate}
            footerCancel
          >
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void handleCreate()
              }}
            >
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter flow name"
                className="h-[56px] rounded-[16px] border border-[#2A3242] bg-transparent px-6 focus:outline-none"
                autoComplete="off"
              />
            </form>
          </BetterDialogContent>
        </BetterDialogProvider>
      </DashboardPageSectionLayout>
    </DiagramsContextProvider>
  )
}
