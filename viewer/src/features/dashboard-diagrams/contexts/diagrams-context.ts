import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useCurrentOrganization } from '@/store/auth-store'
import { useQuery } from '@apollo/client'
import { arrayNonNullable } from 'daily-code'
import { createContext } from 'daily-code/react'
import { useEffect, useMemo, useState } from 'react'
import { DIAGRAMS } from '../api/diagrams'

const PAGE_SIZE = 24

export const [DiagramsContextProvider, useDiagramsContext] = createContext(
  () => {
    const orgId = useCurrentOrganization().id

    const [search, setSearch] = useState('')
    const debouncedSearch = useDebouncedValue(search)
    const [page, setPage] = useState(0)

    useEffect(() => {
      setPage(0)
    }, [debouncedSearch])

    const diagramsQuery = useQuery(DIAGRAMS, {
      fetchPolicy: 'cache-and-network',
      variables: {
        orgId,
        folderId: null,
        teamId: null,
        search: debouncedSearch || null,
        sortBy: 'name',
        sortDir: 'asc',
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      },
    })

    const diagrams = useMemo(
      () => arrayNonNullable(diagramsQuery.data?.diagrams.items ?? []),
      [diagramsQuery.data?.diagrams.items]
    )

    const totalCount = diagramsQuery.data?.diagrams.totalCount ?? 0

    const isLoading = diagramsQuery.loading && !diagramsQuery.data?.diagrams

    return {
      diagrams,
      totalCount,
      pageSize: PAGE_SIZE,
      page,
      setPage,
      isLoading,
      search,
      setSearch,
    }
  }
)
