import { gql, graphql, GT } from '@/api'
import { TypedDocumentNode } from '@graphql-typed-document-node/core'

export type DashboardActor = {
  id?: string | null
  name?: string | null
  avatarUrl?: string | null
}

export type DashboardDoc = {
  id: string
  orgId?: string | null
  folderId?: string | null
  teamId?: string | null
  fileAssetId?: string | null
  fileUrl?: string | null
  fileName?: string | null
  serviceName?: string | null
  fileType?: string | null
  description?: string | null
  contentHash?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  createdByActor?: DashboardActor | null
  updatedByActor?: DashboardActor | null
}

export const DOCS: TypedDocumentNode<
  { docs: { totalCount: number; items: DashboardDoc[] } },
  GT.DocsQueryVariables
> = gql(`
  query Docs(
    $orgId: ID!
    $folderId: ID
    $teamId: ID
    $search: String
    $sortBy: String
    $sortDir: String
    $limit: Int
    $offset: Int
  ) {
    docs(
      orgId: $orgId
      folderId: $folderId
      teamId: $teamId
      search: $search
      sortBy: $sortBy
      sortDir: $sortDir
      limit: $limit
      offset: $offset
    ) {
      totalCount
      items {
        id
        orgId
        folderId
        teamId
        fileAssetId
        fileUrl
        fileName
        serviceName
        fileType
        description
        contentHash
        createdBy
        updatedBy
        createdAt
        updatedAt
        createdByActor {
          id
          type
          name
          email
          avatarUrl
        }
        updatedByActor {
          id
          type
          name
          email
          avatarUrl
        }
      }
    }
  }
`)

export const CREATE_DOC = graphql(`
  mutation CreateDoc($orgId: ID!, $input: CreateDocInput!) {
    createDoc(orgId: $orgId, input: $input) {
      id
      fileName
    }
  }
`)

export const DELETE_DOC = graphql(`
  mutation DeleteDoc($orgId: ID!, $id: ID!) {
    deleteDoc(orgId: $orgId, id: $id)
  }
`)
