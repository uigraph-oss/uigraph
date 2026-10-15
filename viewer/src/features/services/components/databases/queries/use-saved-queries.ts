import { SavedQueryScope } from '@/api/.gql/graphql'
import {
  CREATE_SAVED_QUERY,
  DELETE_SAVED_QUERY,
  SAVED_QUERIES,
  UPDATE_SAVED_QUERY,
  toCreateSavedQueryInput,
  toSavedQuery,
  toUpdateSavedQueryInput,
} from '@/features/services/api/saved-queries'
import { useCurrentOrganization } from '@/store/auth-store/use-auth-store'
import { useMutation, useQuery } from '@apollo/client'
import { arrayNonNullable } from 'daily-code'
import { useCallback, useMemo } from 'react'
import { SaveQueryInput } from './types'

export function useSavedQueries({
  serviceId,
  serviceDbId,
}: {
  serviceId: string
  serviceDbId: string
}) {
  const orgId = useCurrentOrganization()?.id
  const variables = {
    orgId: orgId!,
    serviceId,
    serviceDbId,
    scope: SavedQueryScope.Team,
  }

  const { data } = useQuery(SAVED_QUERIES, {
    fetchPolicy: 'cache-first',
    variables,
    skip: !orgId || !serviceId || !serviceDbId,
  })

  const queries = useMemo(
    () => arrayNonNullable(data?.savedQueries).map(toSavedQuery),
    [data]
  )

  const refetchQueries = [{ query: SAVED_QUERIES, variables }]

  const [createSavedQueryMutation] = useMutation(CREATE_SAVED_QUERY, {
    awaitRefetchQueries: true,
    refetchQueries,
  })
  const [updateSavedQueryMutation] = useMutation(UPDATE_SAVED_QUERY, {
    awaitRefetchQueries: true,
    refetchQueries,
  })
  const [deleteSavedQueryMutation] = useMutation(DELETE_SAVED_QUERY, {
    awaitRefetchQueries: true,
    refetchQueries,
  })

  const createQuery = useCallback(
    async (input: SaveQueryInput) => {
      await createSavedQueryMutation({
        variables: {
          orgId: orgId!,
          serviceId,
          serviceDbId,
          input: toCreateSavedQueryInput(input),
        },
      })
    },
    [createSavedQueryMutation, orgId, serviceId, serviceDbId]
  )

  const updateQuery = useCallback(
    async (id: string, input: SaveQueryInput) => {
      await updateSavedQueryMutation({
        variables: {
          orgId: orgId!,
          serviceId,
          serviceDbId,
          id,
          input: toUpdateSavedQueryInput(input),
        },
      })
    },
    [updateSavedQueryMutation, orgId, serviceId, serviceDbId]
  )

  const deleteQuery = useCallback(
    async (id: string) => {
      await deleteSavedQueryMutation({
        variables: { orgId: orgId!, serviceId, serviceDbId, id },
      })
    },
    [deleteSavedQueryMutation, orgId, serviceId, serviceDbId]
  )

  return { queries, createQuery, updateQuery, deleteQuery }
}
