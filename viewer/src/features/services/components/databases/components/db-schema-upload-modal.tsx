'use client'

import {
  CREATE_SERVICE_DB,
  SERVICE_DBS,
} from '@/features/services/api/service-db'
import { useServiceContext } from '@/features/services/contexts/service-context'
import { useCurrentOrganization } from '@/store/auth-store'
import { useMutation, useQuery } from '@apollo/client'
import { arrayNonNullable } from 'daily-code'
import { toast } from 'sonner'
import { ConfigureDbSchemaModal } from './configure-db-schema-modal'

interface SchemaUploadModalProps {
  onOpenChange: (open: boolean) => void
}

export function DBSchemaUploadModal({ onOpenChange }: SchemaUploadModalProps) {
  const { serviceId } = useServiceContext()
  const orgId = useCurrentOrganization().id

  const listVars = { orgId: orgId!, serviceId }

  const { data: existingData } = useQuery(SERVICE_DBS, {
    variables: listVars,
    fetchPolicy: 'cache-first',
    skip: !orgId || !serviceId,
  })

  const [createServiceDb] = useMutation(CREATE_SERVICE_DB, {
    awaitRefetchQueries: true,
    refetchQueries: [{ query: SERVICE_DBS, variables: listVars }],
  })

  return (
    <ConfigureDbSchemaModal
      mode="upload"
      onSubmit={async ({ data, attachedSchema }) => {
        const nameTaken = arrayNonNullable(existingData?.serviceDBs).some(
          (db) =>
            db.dbName.trim().toLowerCase() === data.dbName.trim().toLowerCase()
        )
        if (nameTaken) {
          toast.error(
            `A data source named "${data.dbName}" already exists in this service`
          )
          return
        }
        try {
          await createServiceDb({
            variables: {
              orgId: orgId!,
              serviceId,
              input: {
                dbName: data.dbName,
                dialect: data.dbType,
                schemaContent: attachedSchema.sourceContent
                  ? JSON.stringify(attachedSchema.sourceContent, null, 2)
                  : await attachedSchema.file.text(),
              },
            },
          })

          toast.success('Database schema uploaded successfully')
          onOpenChange(false)
        } catch (error) {
          console.error('Upload error:', error)
          toast.error(
            error instanceof Error ? error.message : 'Failed to upload schema'
          )
        }
      }}
    />
  )
}
