import { SERVICES, type ServiceStats } from '@/features/services/api/services'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useCurrentOrganization } from '@/store/auth-store'
import { useQuery } from '@apollo/client'
import { arrayNonNullable } from 'daily-code'
import { useMemo, useState } from 'react'

export function useDashboardServicesList() {
  const orgId = useCurrentOrganization().id

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)

  const { data, loading } = useQuery(SERVICES, {
    variables: {
      orgId,
      teamId: null,
      search: debouncedSearch || null,
      sortBy: 'name',
      sortDir: 'asc',
    },
    fetchPolicy: 'cache-and-network',
  })

  const statsByServiceId = useMemo(() => {
    const m = new Map<string, ServiceStats>()
    for (const item of arrayNonNullable(data?.services.items)) {
      if (item?.stats?.serviceId) {
        m.set(item.stats.serviceId, item.stats)
      }
    }
    return m
  }, [data?.services.items])

  const services = useMemo(
    () => arrayNonNullable(data?.services.items),
    [data?.services.items]
  )

  return {
    isServicesLoading: loading && !data?.services,
    isStatsLoading: loading && !data?.services,
    services,
    statsByServiceId,
    search,
    setSearch,
  }
}
