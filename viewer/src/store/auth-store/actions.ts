import { graphql } from '@/api'
import { apolloClientGQL } from '@/api/client'
import { useAuthStore } from './use-auth-store'

const GET_ME_AND_ORG = graphql(`
  query MeAndOrgBootstrap {
    me {
      userId
      email
      name
      avatarUrl
      isServerAdmin
    }
    myOrgs {
      id
      name
      role
      logoUrl
      onboardingDone
    }
    features {
      github
      slack
      enterprise
    }
  }
`)

export async function bootstrapSession() {
  const { data } = await apolloClientGQL.query({ query: GET_ME_AND_ORG })

  useAuthStore.setState({
    status: 'authenticated',
    user: data.me,
    organizations: data.myOrgs,
    features: data.features,
  })
}

export async function mintSessionToken() {
  const res = await fetch('/api/v1/auth/session-token', {
    method: 'POST',
    credentials: 'include',
  })

  if (!res.ok) {
    throw new Error('Failed to mint session token')
  }

  const data = (await res.json()) as { token: string; expiresAt: string }
  return data.token
}
