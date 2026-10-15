'use client'

import { ServiceGitHubRepositoryStatus } from '@/api/.gql/graphql'
import {
  BetterDialogContent,
  BetterDialogProvider,
} from '@/components/better-dialog'
import { Button } from '@/components/ui/button'
import {
  RepositoryPicker,
  type SelectedRepository,
} from '@/features/github-import/repository-picker'
import { useGitHubConnection } from '@/features/github-import/use-github-connection'
import { usePermissions } from '@/hooks/use-permissions'
import { useMutation, useQuery } from '@apollo/client'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { FaGithub } from 'react-icons/fa'
import { toast } from 'sonner'
import {
  CONNECT_SERVICE_GITHUB_REPOSITORY,
  DISCONNECT_SERVICE_GITHUB_REPOSITORY,
  SERVICE_GITHUB_REPOSITORY,
} from '../api/github-repository'

export function ServiceGitHubCard({
  orgId,
  serviceId,
}: {
  orgId: string
  serviceId: string
}) {
  const { isAdmin } = usePermissions()
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [selected, setSelected] = useState<SelectedRepository | null>(null)
  const github = useGitHubConnection(orgId)

  const repositoryQuery = useQuery(SERVICE_GITHUB_REPOSITORY, {
    variables: { orgId, serviceId },
    fetchPolicy: 'cache-and-network',
  })
  const [connectRepository, { loading: isConnecting }] = useMutation(
    CONNECT_SERVICE_GITHUB_REPOSITORY,
    { refetchQueries: ['Service', 'ServiceGitHubRepository'] }
  )
  const [disconnectRepository, { loading: isDisconnecting }] = useMutation(
    DISCONNECT_SERVICE_GITHUB_REPOSITORY,
    { refetchQueries: ['Service', 'ServiceGitHubRepository'] }
  )

  const repository = repositoryQuery.data?.serviceGitHubRepository ?? null

  async function handleConnect() {
    if (!selected) return

    try {
      await connectRepository({
        variables: {
          orgId,
          serviceId,
          owner: selected.owner,
          repo: selected.name,
        },
      })
      setIsPickerOpen(false)
      setSelected(null)
    } catch (caught) {
      toast.error(
        caught instanceof Error
          ? caught.message
          : 'Could not connect the repository'
      )
    }
  }

  async function handleDisconnect() {
    try {
      await disconnectRepository({ variables: { orgId, serviceId } })
    } catch (caught) {
      toast.error(
        caught instanceof Error
          ? caught.message
          : 'Could not disconnect the repository'
      )
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#2A3242] bg-[#1E2533] px-4 py-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#2A3242] shadow-sm ring-1 ring-[#3B4658]">
        <FaGithub className="size-4 text-[#F4F7FC]" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-[#F4F7FC]">Repository</p>

        {repositoryQuery.loading && !repositoryQuery.data && (
          <p className="text-[11px] text-[#828DA3]">Loading connection…</p>
        )}

        {!repository && !repositoryQuery.loading && (
          <p className="text-[11px] text-[#828DA3]">
            No repository connected. Diagrams in this service cannot open pull
            requests.
          </p>
        )}

        {repository && (
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={repository.url}
              target="_blank"
              rel="noreferrer"
              className="truncate font-mono text-[11px] text-[#5B9DF9] hover:text-[#7DB2FB]"
            >
              {repository.fullName}
            </a>
            <span className="font-mono text-[11px] text-[#828DA3]">
              {repository.defaultBranch}
            </span>
            {repository.status === ServiceGitHubRepositoryStatus.Archived && (
              <span className="rounded-md bg-[#232B3A] px-2 py-0.5 text-[11px] text-[#9AA6BC]">
                Archived
              </span>
            )}
            {repository.status ===
              ServiceGitHubRepositoryStatus.Unavailable && (
              <span className="rounded-md bg-[#3A1D1D] px-2 py-0.5 text-[11px] text-[#F29B9B]">
                Unavailable — check the GitHub App installation
              </span>
            )}
          </div>
        )}
      </div>

      {isAdmin && (
        <div className="flex shrink-0 items-center gap-2">
          <BetterDialogProvider
            open={isPickerOpen}
            onOpenChange={(open) => {
              setIsPickerOpen(open)
              if (!open) setSelected(null)
            }}
            trigger={
              <Button
                preset="outline"
                className="h-8 px-3 text-[12px]"
                onClick={() => setIsPickerOpen(true)}
              >
                {repository ? 'Change' : 'Connect'}
              </Button>
            }
          >
            <BetterDialogContent
              title="Connect a repository"
              description="Diagram pull requests for this service go to this repository."
              footerCancel
              footerSubmit="Connect"
              footerSubmitLoading={isConnecting}
              onFooterSubmitClick={() => void handleConnect()}
            >
              <RepositoryPicker
                orgID={orgId}
                github={github}
                selected={selected}
                onSelect={setSelected}
              />
            </BetterDialogContent>
          </BetterDialogProvider>

          {repository && (
            <Button
              preset="outline"
              className="h-8 px-3 text-[12px]"
              disabled={isDisconnecting}
              onClick={() => void handleDisconnect()}
            >
              {isDisconnecting && <Loader2 className="animate-spin" />}
              Disconnect
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
