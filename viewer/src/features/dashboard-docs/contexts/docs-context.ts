import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useCurrentOrganization } from '@/store/auth-store'
import { useMutation, useQuery } from '@apollo/client'
import { arrayNonNullable } from 'daily-code'
import { createContext } from 'daily-code/react'
import { useEffect, useMemo, useState } from 'react'
import { CREATE_DOC, DELETE_DOC, DOCS } from '../api/docs'

const PAGE_SIZE = 24

export const [DocsContextProvider, useDocsContext] = createContext(() => {
  const orgId = useCurrentOrganization().id

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [page, setPage] = useState(0)

  useEffect(() => {
    setPage(0)
  }, [debouncedSearch])

  const docsQuery = useQuery(DOCS, {
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

  function refetchDocs() {
    return docsQuery.refetch()
  }

  const [createDoc] = useMutation(CREATE_DOC, {
    onCompleted: refetchDocs,
  })

  const [deleteDoc] = useMutation(DELETE_DOC, {
    onCompleted: refetchDocs,
  })

  const docs = useMemo(
    () => arrayNonNullable(docsQuery.data?.docs.items ?? []),
    [docsQuery.data?.docs.items]
  )

  const totalCount = docsQuery.data?.docs.totalCount ?? 0

  const isLoading = docsQuery.loading && !docsQuery.data?.docs

  return {
    docs,
    totalCount,
    pageSize: PAGE_SIZE,
    page,
    setPage,
    isLoading,
    search,
    setSearch,
    createDoc,
    deleteDoc,
  }
})
