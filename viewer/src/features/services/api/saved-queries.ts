import { graphql } from '@/api'
import { SavedQueryScope as GqlSavedQueryScope } from '@/api/.gql/graphql'
import { arrayNonNullable } from 'daily-code'
import {
  SavedQuery,
  SaveQueryInput,
} from '../components/databases/queries/types'

export const SAVED_QUERIES = graphql(`
  query SavedQueries(
    $orgId: ID!
    $serviceId: ID!
    $serviceDbId: ID!
    $scope: SavedQueryScope!
  ) {
    savedQueries(
      orgId: $orgId
      serviceId: $serviceId
      serviceDbId: $serviceDbId
      scope: $scope
    ) {
      id
      folderId
      scope
      title
      description
      queryText
      tags
      createdBy
      createdAt
      updatedAt
      createdByActor {
        id
        name
        avatarUrl
      }
    }
  }
`)

export const CREATE_SAVED_QUERY = graphql(`
  mutation CreateSavedQuery(
    $orgId: ID!
    $serviceId: ID!
    $serviceDbId: ID!
    $input: CreateSavedQueryInput!
  ) {
    createSavedQuery(
      orgId: $orgId
      serviceId: $serviceId
      serviceDbId: $serviceDbId
      input: $input
    ) {
      id
    }
  }
`)

export const UPDATE_SAVED_QUERY = graphql(`
  mutation UpdateSavedQuery(
    $orgId: ID!
    $serviceId: ID!
    $serviceDbId: ID!
    $id: ID!
    $input: UpdateSavedQueryInput!
  ) {
    updateSavedQuery(
      orgId: $orgId
      serviceId: $serviceId
      serviceDbId: $serviceDbId
      id: $id
      input: $input
    ) {
      id
    }
  }
`)

export const DELETE_SAVED_QUERY = graphql(`
  mutation DeleteSavedQuery(
    $orgId: ID!
    $serviceId: ID!
    $serviceDbId: ID!
    $id: ID!
  ) {
    deleteSavedQuery(
      orgId: $orgId
      serviceId: $serviceId
      serviceDbId: $serviceDbId
      id: $id
    )
  }
`)

export function toSavedQuery(q: {
  id: string
  title: string
  description?: string | null
  queryText: string
  tags?: string[] | null
  createdAt: string
  updatedAt: string
}): SavedQuery {
  return {
    id: q.id,
    title: q.title,
    description: q.description ?? undefined,
    queryText: q.queryText,
    tags: arrayNonNullable(q.tags),
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
  }
}

export function toCreateSavedQueryInput(input: SaveQueryInput) {
  return {
    title: input.title,
    description: input.description,
    queryText: input.queryText,
    tags: input.tags,
    scope: GqlSavedQueryScope.Team,
  }
}

export function toUpdateSavedQueryInput(input: SaveQueryInput) {
  return {
    title: input.title,
    description: input.description,
    queryText: input.queryText,
    tags: input.tags,
  }
}
