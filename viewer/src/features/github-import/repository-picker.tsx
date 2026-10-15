import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useQuery } from '@apollo/client'
import {
  ArrowUpRight,
  Check,
  ExternalLink,
  Loader2,
  Search,
} from 'lucide-react'
import { useDeferredValue, useState, type ReactNode } from 'react'
import { GITHUB_REPOSITORIES } from './api'
import { useGitHubConnection } from './use-github-connection'

export type SelectedRepository = {
  githubId: string
  owner: string
  name: string
  fullName: string
}

function installationSettingsURL(installationId: string) {
  return `https://github.com/settings/installations/${installationId}`
}

export function RepositoryPicker({
  orgID,
  github,
  selected,
  listClassName,
  searchTrailing,
  onSelect,
}: {
  orgID: string
  github: ReturnType<typeof useGitHubConnection>
  selected: SelectedRepository | null
  listClassName?: string
  searchTrailing?: ReactNode
  onSelect: (repository: SelectedRepository) => void
}) {
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)

  const repositoriesQuery = useQuery(GITHUB_REPOSITORIES, {
    variables: { orgID },
    fetchPolicy: 'network-only',
  })
  const repositories = repositoriesQuery.data?.githubRepositories ?? []
  const visibleRepositories = repositories.filter((repository) =>
    repository.fullName
      .toLowerCase()
      .includes(deferredSearch.trim().toLowerCase())
  )

  return (
    <>
      <div className="flex items-center gap-2.5">
        <div className="relative flex-1">
          <Search className="text-paragraph pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
          <Input
            aria-label="Search repositories"
            value={search}
            placeholder="Search repositories"
            className="h-10 rounded-[0.625rem] pl-10"
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {searchTrailing}
      </div>

      <div
        className={cn(
          'border-stock bg-shading/40 mt-3 flex h-[22rem] flex-col overflow-hidden rounded-xl border',
          listClassName
        )}
      >
        {repositoriesQuery.loading && !repositoriesQuery.data && (
          <div className="text-paragraph flex flex-1 items-center justify-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" /> Loading repositories
          </div>
        )}

        {!repositoriesQuery.loading &&
          visibleRepositories.length === 0 &&
          !github.connected && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
              <p className="text-paragraph text-sm">
                UIGraph reads your repositories through a GitHub App. Install it
                to pick one.
              </p>
              <Button
                preset="primary"
                className="rounded-[0.625rem]"
                disabled={github.isStarting || github.isConnecting}
                onClick={github.connect}
              >
                {(github.isStarting || github.isConnecting) && (
                  <Loader2 className="size-4 animate-spin" />
                )}
                {github.isConnecting && 'Waiting for GitHub…'}
                {!github.isConnecting && 'Install GitHub App'}
                {!github.isStarting && !github.isConnecting && (
                  <ExternalLink className="size-4" />
                )}
              </Button>
            </div>
          )}

        {!repositoriesQuery.loading &&
          visibleRepositories.length === 0 &&
          github.connected &&
          repositories.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
              <p className="text-paragraph text-sm">
                The GitHub App is installed but cannot read any repository yet.
                Grant it access on GitHub, then reopen this list.
              </p>
              {github.installation && (
                <a
                  href={installationSettingsURL(
                    github.installation.installationId
                  )}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary inline-flex items-center gap-1.5 text-sm hover:underline"
                >
                  Manage repository access
                  <ArrowUpRight className="size-3.5" />
                </a>
              )}
            </div>
          )}

        {!repositoriesQuery.loading &&
          visibleRepositories.length === 0 &&
          github.connected &&
          repositories.length > 0 && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
              <p className="text-paragraph text-sm">
                No repositories match this search.
              </p>
              {github.installation && (
                <a
                  href={installationSettingsURL(
                    github.installation.installationId
                  )}
                  target="_blank"
                  rel="noreferrer"
                  className="text-paragraph/70 hover:text-foreground inline-flex items-center gap-1.5 text-xs transition-colors"
                >
                  Missing one? Check repository access on GitHub
                  <ArrowUpRight className="size-3" />
                </a>
              )}
            </div>
          )}

        {visibleRepositories.length > 0 && (
          <div
            role="radiogroup"
            aria-label="Repositories"
            className="better-scrollbar divide-stock min-h-0 flex-1 divide-y overflow-y-auto"
          >
            {visibleRepositories.map((repository) => (
              <button
                type="button"
                key={repository.githubId}
                role="radio"
                aria-checked={selected?.fullName === repository.fullName}
                disabled={repository.archived}
                className={cn(
                  'hover:bg-stock/25 flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
                  repository.archived &&
                    'cursor-not-allowed opacity-50 hover:bg-transparent',
                  selected?.fullName === repository.fullName &&
                    'bg-primary/10 hover:bg-primary/10'
                )}
                onClick={() =>
                  onSelect({
                    githubId: repository.githubId,
                    owner: repository.owner,
                    name: repository.name,
                    fullName: repository.fullName,
                  })
                }
              >
                <span
                  className={cn(
                    'flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors',
                    selected?.fullName === repository.fullName &&
                      'border-primary bg-primary text-primary-foreground',
                    selected?.fullName !== repository.fullName && 'border-stock'
                  )}
                >
                  {selected?.fullName === repository.fullName && (
                    <Check className="size-2.5" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">
                    {repository.fullName}
                  </span>
                  <span className="text-paragraph mt-0.5 block font-mono text-[0.6875rem]">
                    {repository.defaultBranch}
                  </span>
                </span>
                {repository.private && (
                  <Badge variant="outline" className="shrink-0">
                    Private
                  </Badge>
                )}
                {repository.archived && (
                  <Badge variant="secondary" className="shrink-0">
                    Archived
                  </Badge>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
