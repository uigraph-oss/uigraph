import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useScopedStorage } from '@/hooks/use-scoped-storage'
import { useCurrentOrganization } from '@/store/auth-store'
import { useMutation, useQuery } from '@apollo/client'
import { arrayNonNullable } from 'daily-code'
import { useEffect, useState } from 'react'
import { CREATE_MAP, MAPS } from '../api'

const PAGE_SIZE = 24

export function useProjects() {
  const organizationId = useCurrentOrganization()?.id

  const [sortBy, setSortBy] = useScopedStorage('maps:sort', 'created')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [page, setPage] = useState(0)
  const sortDir = sortBy === 'name' ? 'asc' : 'desc'

  useEffect(() => {
    setPage(0)
  }, [sortBy, debouncedSearch])

  const mapsVariables = {
    orgId: organizationId!,
    search: debouncedSearch || null,
    sortBy,
    sortDir,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  }

  const { data: mapsData, loading: mapsLoading } = useQuery(MAPS, {
    fetchPolicy: 'cache-and-network',
    variables: mapsVariables,
    skip: !organizationId,
  })

  const [createProject] = useMutation(CREATE_MAP, {
    awaitRefetchQueries: true,
    refetchQueries: [MAPS],
  })

  return {
    projectsLoading: mapsLoading && !mapsData?.maps,
    projects: arrayNonNullable(mapsData?.maps.items),
    totalCount: mapsData?.maps.totalCount ?? 0,
    pageSize: PAGE_SIZE,
    page,
    setPage,
    sortBy,
    setSortBy,
    search,
    setSearch,
    createProject,
  }
}
