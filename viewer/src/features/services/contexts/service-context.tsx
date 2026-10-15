'use client'

import { useCurrentOrganization } from '@/store/auth-store'
import { useQuery } from '@apollo/client'
import { createContext } from 'daily-code/react'
import { SERVICE } from '../api/services'

export const [ServiceContextProvider, useServiceContext] = createContext(
  ({ serviceId }: { serviceId: string }) => {
    const orgId = useCurrentOrganization().id

    const { data, loading } = useQuery(SERVICE, {
      variables: { orgId, id: serviceId },
      fetchPolicy: 'cache-first',
      skip: !serviceId,
    })

    const service = data?.service

    return {
      service: service!,
      serviceId: service?.id as string,

      isServiceLoading: loading && !service,
    }
  }
)
