import { SectionLoader } from '@/components/section-loader'
import { SectionNotFound } from '@/components/section-not-found'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Paths } from '@/constants/paths'
import {
  DashboardSectionContent,
  DashboardSectionHeader,
} from '@/features/dashboard'
import { SERVICES } from '@/features/services/api/services'
import { FilterPill } from '@/features/services/components/services-list/dashboard-services'
import { normalizeRepoUrl } from '@/lib/git'
import { useCurrentOrganization } from '@/store/auth-store'
import { useQuery as useGraphQLQuery } from '@apollo/client'
import { useQuery } from '@tanstack/react-query'
import { arrayNonNullable } from 'daily-code'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getLensRuns, type LensRunSummary } from './api'

const DESCRIPTION = 'Pull request reviews run on this machine.'

const STATUS_LABELS: Record<
  LensRunSummary['status'],
  { label: string; className: string }
> = {
  running: { label: 'Running', className: 'text-[#7BA4FF]' },
  done: { label: 'Done', className: 'text-[#5FD39A]' },
  failed: { label: 'Failed or stopped', className: 'text-[#F2777A]' },
}

export function DashboardLensRunsPage() {
  return (
    <>
      <DashboardSectionHeader
        title="Pull Request Reviews"
        description="Lens reviews run on this machine."
      />
      <DashboardSectionContent>
        <LensRunList runPath={Paths.lens.dashboardRun} />
      </DashboardSectionContent>
    </>
  )
}

export function LensRunsPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <h1 className="mb-2 text-xl font-semibold text-[#F4F7FC]">Lens</h1>
      <p className="text-paragraph mb-6 text-sm">{DESCRIPTION}</p>
      <LensRunList runPath={Paths.lens.run} />
    </main>
  )
}

function toRepository(url: string) {
  return normalizeRepoUrl(url)!
    .replace(/^https?:\/\/[^/]+\//, '')
    .replace(/\.git$/, '')
    .replace(/\/$/, '')
    .toLowerCase()
}

function LensRunList({ runPath }: { runPath: (runId: string) => string }) {
  const orgId = useCurrentOrganization().id
  const [search, setSearch] = useState('')
  const [serviceId, setServiceId] = useState('all')
  const [status, setStatus] = useState('all')
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest')

  const runs = useQuery({
    queryKey: ['lens-runs'],
    queryFn: getLensRuns,
    refetchInterval: 3000,
  })
  const servicesQuery = useGraphQLQuery(SERVICES, {
    variables: { orgId, sortBy: 'name', sortDir: 'asc' },
  })
  const services = arrayNonNullable(servicesQuery.data?.services.items).filter(
    (service) => service.gitRepoUrl
  )

  if (runs.isPending) {
    return <SectionLoader label="Loading Lens runs" />
  }
  if (runs.isError) {
    return <SectionNotFound plain label={runs.error.message} />
  }
  if (runs.data.length === 0) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 text-sm text-[#828DA3]">
        <p>No reviews yet. Start one from a terminal:</p>
        <code className="border-stock rounded-md border px-3 py-1.5 font-mono text-[#F4F7FC]">
          uigraph lens &lt;pull-request&gt;
        </code>
      </div>
    )
  }

  const serviceRepoUrl = services.find(
    (service) => service.id === serviceId
  )?.gitRepoUrl
  const query = search.trim().toLowerCase()
  const visibleRuns = runs.data
    .filter((run) => status === 'all' || run.status === status)
    .filter(
      (run) =>
        serviceId === 'all' ||
        (serviceRepoUrl !== null &&
          serviceRepoUrl !== undefined &&
          run.repository.toLowerCase() === toRepository(serviceRepoUrl))
    )
    .filter(
      (run) =>
        query === '' ||
        `${run.title} ${run.repository}#${run.number ?? ''}`
          .toLowerCase()
          .includes(query)
    )
    .sort((first, second) =>
      sort === 'newest'
        ? second.updatedAt.localeCompare(first.updatedAt)
        : first.updatedAt.localeCompare(second.updatedAt)
    )

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search reviews..."
          className="h-10 w-52 rounded-lg border-[#2A3242] bg-[#1E2533] text-[13px] shadow-none focus-visible:bg-[#1E2533]"
        />

        <Select value={serviceId} onValueChange={setServiceId}>
          <SelectTrigger className="h-10 w-40 shrink-0 rounded-lg border-[#2A3242] bg-[#1E2533] text-[13px] shadow-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Services</SelectItem>
            {services.map((service) => (
              <SelectItem key={service.id} value={service.id}>
                {service.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={sort}
          onValueChange={(value) => setSort(value as 'newest' | 'oldest')}
        >
          <SelectTrigger className="h-10 w-40 shrink-0 rounded-lg border-[#2A3242] bg-[#1E2533] text-[13px] shadow-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest</SelectItem>
            <SelectItem value="oldest">Oldest</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-0.5 rounded-lg bg-[#1E2533] p-0.5 ring-1 ring-[#2A3242]">
          <FilterPill
            label="All"
            count={runs.data.length}
            active={status === 'all'}
            onClick={() => setStatus('all')}
          />
          {Object.entries(STATUS_LABELS).map(([value, { label }]) => (
            <FilterPill
              key={value}
              label={label}
              count={runs.data.filter((run) => run.status === value).length}
              active={status === value}
              onClick={() => setStatus(status === value ? 'all' : value)}
            />
          ))}
        </div>
      </div>

      {visibleRuns.length === 0 ? (
        <SectionNotFound label="No reviews match your search." />
      ) : (
        <div className="border-stock rounded-[0.5rem] border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="h-11 px-3!">Pull request</TableHead>
                <TableHead className="h-11 w-[18%] px-3!">Status</TableHead>
                <TableHead className="h-11 w-[22%] px-3!">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRuns.map((run) => (
                <TableRow key={run.runId}>
                  <TableCell className="px-3!">
                    <Link to={runPath(run.runId)} className="block min-w-0">
                      <span className="block truncate text-[#F4F7FC] hover:underline">
                        {run.title}
                      </span>
                      <span className="text-paragraph text-xs">
                        {run.repository}
                        {run.number === null
                          ? ' · local branch'
                          : `#${run.number}`}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell
                    className={`px-3! ${STATUS_LABELS[run.status].className}`}
                  >
                    {STATUS_LABELS[run.status].label}
                  </TableCell>
                  <TableCell className="text-paragraph px-3!">
                    {new Date(run.updatedAt).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  )
}
