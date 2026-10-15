'use client'

import { NosqlEditorModal } from '@/features/diagram-portal/components/nosql-editor/nosql-editor-modal'
import { DataSource } from '@/features/diagram-portal/types/db-flow'
import {
  CREATE_SERVICE_DB,
  SERVICE_DBS,
} from '@/features/services/api/service-db'
import { useServiceContext } from '@/features/services/contexts/service-context'
import { useCurrentOrganization } from '@/store/auth-store'
import { useMutation, useQuery } from '@apollo/client'
import { arrayNonNullable } from 'daily-code'
import { toast } from 'sonner'

export function NosqlBuilderModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const orgId = useCurrentOrganization().id
  const { serviceId } = useServiceContext()

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

  async function handleSchemaSubmit(dataSource: DataSource) {
    const nameTaken = arrayNonNullable(existingData?.serviceDBs).some(
      (db) =>
        db.dbName.trim().toLowerCase() === dataSource.name.trim().toLowerCase()
    )
    if (nameTaken) {
      toast.error(
        `A data source named "${dataSource.name}" already exists in this service`
      )
      return
    }
    try {
      await createServiceDb({
        variables: {
          orgId: orgId!,
          serviceId,
          input: {
            dbName: dataSource.name,
            dialect: dataSource.dialect,
            schemaContent: JSON.stringify(dataSource.sourceContent, null, 2),
          },
        },
      })

      toast.success('Database schema created successfully')
      onOpenChange(false)
    } catch (error) {
      console.error('NoSQL builder error:', error)
      toast.error(
        error instanceof Error ? error.message : 'Failed to create database'
      )
    }
  }

  return (
    <NosqlEditorModal
      open={open}
      onOpenChange={onOpenChange}
      onSchemaSubmit={handleSchemaSubmit}
    />
  )
}
