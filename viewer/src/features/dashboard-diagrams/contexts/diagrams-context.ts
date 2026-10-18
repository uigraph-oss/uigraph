import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useCurrentOrganization } from '@/store/auth-store'
import { useQuery } from '@apollo/client'
import { arrayNonNullable } from 'daily-code'
import { createContext } from 'daily-code/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { DIAGRAMS } from '../api/diagrams'

const ROWS_PER_PAGE = 3

export const [DiagramsContextProvider, useDiagramsContext] = createContext(
  () => {
    const orgId = useCurrentOrganization().id

    const [search, setSearch] = useState('')
    const debouncedSearch = useDebouncedValue(search)
    const [page, setPage] = useState(0)
    const [columns, setColumnsState] = useState(4)
    const pageSize = columns * ROWS_PER_PAGE

    useEffect(() => {
      setPage(0)
    }, [debouncedSearch])

    // Keep the first visible diagram on screen when the column count changes.
    const setColumns = useCallback(
      (next: number) => {
        if (next === columns) return
        setPage((p) => Math.floor((p * columns) / next))
        setColumnsState(next)
      },
      [columns]
    )

    const diagramsQuery = useQuery(DIAGRAMS, {
      fetchPolicy: 'cache-and-network',
      variables: {
        orgId,
        folderId: null,
        teamId: null,
        search: debouncedSearch || null,
        sortBy: 'name',
        sortDir: 'asc',
        limit: pageSize,
        offset: page * pageSize,
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
      pageSize,
      setColumns,
      page,
      setPage,
      isLoading,
      search,
      setSearch,
    }
  }
)
