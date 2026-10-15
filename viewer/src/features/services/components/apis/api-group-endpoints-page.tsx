'use client'

import { SectionLoader } from '@/components/section-loader'
import { Button } from '@/components/ui/button'
import {
  DashboardSectionContent,
  DashboardSectionHeader,
} from '@/features/dashboard'
import { ArrowLeft } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ServiceApiEndpointsContextProvider,
  useServiceApiEndpointsContext,
} from '../../contexts/service-api-endpoints'
import { useServiceContext } from '../../contexts/service-context'
import { ApiSpecDownload } from './api-spec-download'
import { ServiceApiEndpoints } from './service-apis'

export function ApiGroupEndpointsPage() {
  const { serviceId } = useServiceContext()
  const { apiGroupId } = useParams() as { apiGroupId: string }

  return (
    <ServiceApiEndpointsContextProvider
      serviceId={serviceId}
      serviceApiGroupId={apiGroupId}
    >
      <ApiGroupEndpointsPageContent />
    </ServiceApiEndpointsContextProvider>
  )
}

function ApiGroupEndpointsPageContent() {
  const navigate = useNavigate()

  const { apiGroup, serviceId, selectedVersionId, isApiEndpointsLoading } =
    useServiceApiEndpointsContext()

  const specFileId = useMemo(() => {
    return (
      apiGroup?.openApiSpecFileId ??
      apiGroup?.swaggerSpecFileId ??
      apiGroup?.graphqlSpecFileIds?.[0] ??
      apiGroup?.grpcSpecFileIds?.[0] ??
      null
    )
  }, [apiGroup])

  const hasSpec = specFileId !== null
  const activeGroupId = apiGroup.serviceApiGroupId ?? ''

  return (
    <div className="flex h-full flex-col">
      <DashboardSectionHeader
        title="API & Behavior"
        description="Endpoints found in this service, with the files they were found in."
      >
        <div className="flex items-center gap-2">
          {hasSpec && (
            <ApiSpecDownload
              serviceId={serviceId}
              apiGroupId={activeGroupId}
              versionId={selectedVersionId}
            />
          )}

          <Button
            preset="outline"
            onClick={() => navigate(`/services/${serviceId}/apis`)}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to APIs
          </Button>
        </div>
      </DashboardSectionHeader>

      <DashboardSectionContent noPadding>
        {isApiEndpointsLoading ? (
          <SectionLoader label="Loading API endpoints..." />
        ) : (
          <ServiceApiEndpoints />
        )}
      </DashboardSectionContent>
    </div>
  )
}
