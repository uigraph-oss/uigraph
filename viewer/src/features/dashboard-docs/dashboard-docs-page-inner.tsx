'use client'

import { CirclePlusIcon } from '@/assets/svgs'
import { BetterDialogProvider } from '@/components/better-dialog'
import { Button } from '@/components/ui/button'
import { DashboardPageSectionLayout } from '@/features/dashboard'
import { ConfigureServiceDocModal } from '@/features/services/components/docs/configure-service-doc-modal'
import { usePermissions } from '@/hooks/use-permissions'
import { useCurrentOrganization } from '@/store/auth-store'
import { useState } from 'react'
import { toast } from 'sonner'
import { DocsContextProvider, useDocsContext } from './contexts/docs-context'
import { DocsFolder } from './docs-folder'

export function DashboardDocsPageInner() {
  return (
    <DocsContextProvider>
      <DashboardDocsPageContent />
    </DocsContextProvider>
  )
}

function DashboardDocsPageContent() {
  const organizationId = useCurrentOrganization().id
  const { createDoc } = useDocsContext()

  const { canWrite } = usePermissions()

  const [isUploadDocOpen, setIsUploadDocOpen] = useState(false)

  return (
    <DashboardPageSectionLayout
      title="Documentation"
      description="Docs from your registered projects and ~/.uigraph."
      crumbs={[{ to: '/dashboard/docs', label: 'Docs' }]}
      headerContent={
        <Button
          preset="cta"
          disabled={!canWrite}
          onClick={() => setIsUploadDocOpen(true)}
        >
          <CirclePlusIcon />
          Upload
        </Button>
      }
    >
      <DocsFolder />

      <BetterDialogProvider
        open={isUploadDocOpen}
        onOpenChange={setIsUploadDocOpen}
      >
        <ConfigureServiceDocModal
          mode="create"
          orgId={organizationId!}
          onSubmit={async (formData) => {
            try {
              await createDoc({
                variables: {
                  orgId: organizationId!,
                  input: {
                    fileName: formData.fileName ?? '',
                    fileType: formData.fileType ?? '',
                    description: formData.description ?? '',
                    fileAssetId: formData.fileId ?? '',
                  },
                },
              })

              toast.success('Documentation uploaded successfully')
              setIsUploadDocOpen(false)
            } catch (error) {
              console.error(error)
              toast.error('Failed to upload documentation')
              throw error
            }
          }}
        />
      </BetterDialogProvider>
    </DashboardPageSectionLayout>
  )
}
