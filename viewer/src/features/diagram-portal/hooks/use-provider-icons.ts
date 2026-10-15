import { useQueries } from '@tanstack/react-query'
import {
  ProviderIcon,
  ProviderIconSection,
} from '../types/provider-icons.types'

const ICON_PROVIDERS = [
  { cloud: 'AWS', title: 'AWS', manifestUrl: '/aws-icons.json' },
  { cloud: 'Azure', title: 'Azure', manifestUrl: '/azure-icons.json' },
  { cloud: 'GCP', title: 'Google Cloud', manifestUrl: '/gcp-icons.json' },
  {
    cloud: 'Kubernetes',
    title: 'Kubernetes',
    manifestUrl: '/kubernetes-icons.json',
  },
] as const

async function fetchIconManifest(url: string): Promise<ProviderIcon[]> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to load icons from ${url}`)
  return response.json() as Promise<ProviderIcon[]>
}

export function useProviderIcons() {
  return useQueries({
    queries: ICON_PROVIDERS.map((provider) => ({
      queryKey: ['icon-manifest', provider.cloud],
      queryFn: () => fetchIconManifest(provider.manifestUrl),
      staleTime: Infinity,
      gcTime: Infinity,
    })),
    combine: (results) => {
      const sections: ProviderIconSection[] = []

      ICON_PROVIDERS.forEach((provider, index) => {
        const icons = results[index].data
        if (!icons?.length) return

        const categories: { [category: string]: ProviderIcon[] } = {}
        for (const icon of icons) {
          ;(categories[icon.category] ??= []).push(icon)
        }

        sections.push({
          title: provider.title,
          cloud: provider.cloud,
          categories,
        })
      })

      return {
        sections,
        isLoading: results.some((result) => result.isPending),
        error: results.every((result) => result.isError)
          ? (results[0].error?.message ?? 'Failed to load icons')
          : null,
      }
    },
  })
}
