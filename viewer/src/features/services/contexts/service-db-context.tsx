'use client'

import { SectionLoader } from '@/components/section-loader'
import { SectionNotFound } from '@/components/section-not-found'
import { Button } from '@/components/ui/button'
import {
  DashboardSectionContent,
  DashboardSectionHeader,
} from '@/features/dashboard'
import { useCurrentOrganization } from '@/store/auth-store'
import { useQuery } from '@apollo/client'
import { createContext } from 'daily-code/react'
import { ArrowLeft } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { SERVICE_DB, serviceDBToLegacy } from '../api/service-db'
import { useServiceContext } from './service-context'

export const [ServiceDbContextProvider, useServiceDbContext] = createContext(
  () => {
    const { serviceId } = useServiceContext()
    const orgId = useCurrentOrganization().id
    const { dbId } = useParams() as { dbId: string }

    const { data, loading } = useQuery(SERVICE_DB, {
      fetchPolicy: 'cache-first',
      variables: {
        orgId: orgId!,
        serviceId,
        id: dbId,
      },
      skip: !orgId || !serviceId || !dbId,
    })

    const serviceDb = useMemo(() => {
      return data?.serviceDB ? serviceDBToLegacy(data.serviceDB) : null
    }, [data?.serviceDB])

    return {
      dbId,
      serviceId,
      serviceDb: serviceDb!,
      isServiceDbLoading: loading && !data?.serviceDB,
    }
  },

  {
    useChildrenProvider(children, value) {
      if (value.serviceDb && !value.isServiceDbLoading) return children

      return (
        <div className="flex h-full flex-col">
          <DashboardSectionHeader
            title="Database Schema"
            description="Manage database schema, data model."
          >
            <Button asChild preset="outline">
              <Link to={`/services/${value.serviceId}/data`}>
                <ArrowLeft />
                Go to All Data
              </Link>
            </Button>
          </DashboardSectionHeader>

          <DashboardSectionContent>
            {value.isServiceDbLoading ? (
              <SectionLoader label="Loading database schema..." />
            ) : (
              <SectionNotFound plain label="No database schema found" />
            )}
          </DashboardSectionContent>
        </div>
      )
    },
  }
)
