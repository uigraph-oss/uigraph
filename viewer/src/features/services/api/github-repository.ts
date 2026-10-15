import { graphql } from '@/api'

export const SERVICE_GITHUB_REPOSITORY = graphql(`
  query ServiceGitHubRepository($orgId: ID!, $serviceId: ID!) {
    serviceGitHubRepository(orgId: $orgId, serviceId: $serviceId) {
      serviceId
      githubId
      owner
      name
      fullName
      url
      defaultBranch
      status
      updatedAt
    }
  }
`)

export const CONNECT_SERVICE_GITHUB_REPOSITORY = graphql(`
  mutation ConnectServiceGitHubRepository(
    $orgId: ID!
    $serviceId: ID!
    $owner: String!
    $repo: String!
  ) {
    connectServiceGitHubRepository(
      orgId: $orgId
      serviceId: $serviceId
      owner: $owner
      repo: $repo
    ) {
      serviceId
      githubId
      owner
      name
      fullName
      url
      defaultBranch
      status
      updatedAt
    }
  }
`)

export const DISCONNECT_SERVICE_GITHUB_REPOSITORY = graphql(`
  mutation DisconnectServiceGitHubRepository($orgId: ID!, $serviceId: ID!) {
    disconnectServiceGitHubRepository(orgId: $orgId, serviceId: $serviceId)
  }
`)
