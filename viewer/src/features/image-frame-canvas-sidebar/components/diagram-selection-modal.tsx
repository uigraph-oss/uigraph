import { BetterDialogContent } from '@/components/better-dialog'
import { SectionLoader } from '@/components/section-loader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SelectSearch } from '@/components/ui/select-search'
import { DIAGRAMS } from '@/features/dashboard-diagrams/api/diagrams'
import { SERVICES } from '@/features/services/api/services'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useCurrentOrganization } from '@/store/auth-store'
import { useQuery } from '@apollo/client'
import { arrayNonNullable } from 'daily-code'
import { Link2, Loader2 } from 'lucide-react'
import { useState } from 'react'

const PAGE_SIZE = 12
const ALL = '__all__'

const filterClassName = '!h-11 rounded-[16px] text-sm'

type DiagramSelectionModalProps = {
  onSelect: (diagramId: string) => Promise<void>
}

export function DiagramSelectionModal({
  onSelect,
}: DiagramSelectionModalProps) {
  const organizationId = useCurrentOrganization()?.id

  const [connectingId, setConnectingId] = useState<string | null>(null)

  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(
    null
  )
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)

  const debouncedSearch = useDebouncedValue(search)

  const servicesQuery = useQuery(SERVICES, {
    variables: { orgId: organizationId! },
    skip: !organizationId,
    fetchPolicy: 'cache-first',
  })

  const { data: diagramsData, loading: diagramsLoading } = useQuery(DIAGRAMS, {
    variables: {
      orgId: organizationId!,
      serviceId: selectedServiceId,
      search: debouncedSearch || null,
      sortBy: 'created',
      sortDir: 'desc',
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    },
    skip: !organizationId,
    fetchPolicy: 'cache-and-network',
  })

  const services = arrayNonNullable(servicesQuery.data?.services.items)

  const diagrams = arrayNonNullable(diagramsData?.diagrams.items)
  const totalCount = diagramsData?.diagrams.totalCount ?? 0
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  const hasFilters = Boolean(selectedServiceId || debouncedSearch)

  function resetPage() {
    setPage(0)
  }

  function handleServiceChange(value: string) {
    setSelectedServiceId(value === ALL ? null : value)
    resetPage()
  }

  function handleSearchChange(value: string) {
    setSearch(value)
    resetPage()
  }

  async function handleSelect(diagramId: string) {
    if (connectingId) return

    try {
      setConnectingId(diagramId)
      await onSelect(diagramId)
    } finally {
      setConnectingId(null)
    }
  }

  return (
    <BetterDialogContent
      title="Select Diagram"
      description="Select a diagram to link to this focal point"
      className="flex min-h-0 flex-col !overflow-hidden"
    >
      <div className="flex h-full flex-col gap-4">
        <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search diagrams"
            className="border-stock bg-input h-11 flex-1 rounded-[16px] px-4 text-sm"
          />

          <SelectSearch
            value={selectedServiceId ?? ALL}
            onChange={handleServiceChange}
            placeholder="All Services"
            className={`${filterClassName} sm:w-44`}
            options={[
              { value: ALL, label: 'All Services' },
              ...services.map((service) => ({
                value: service.id ?? '',
                label: service.name ?? '',
              })),
            ]}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {diagramsLoading && diagrams.length === 0 ? (
            <SectionLoader label="Loading diagrams..." />
          ) : diagrams.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-muted-foreground text-sm">
                {hasFilters
                  ? 'No diagrams match your filters.'
                  : 'No diagrams available'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 content-start gap-4">
              {diagrams.map((diagram) => (
                <div
                  key={diagram.id}
                  className="group bg-card border-stock hover:border-primary/50 relative rounded-lg border-2 p-3 transition-all"
                >
                  <div className="relative overflow-hidden rounded-md">
                    <img
                      alt={diagram.name ?? 'Blank Diagram'}
                      src={diagram.previewImageUrl ?? '/placeholder.svg'}
                      className="aspect-square w-full object-cover object-top"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        preset="primary"
                        disabled={connectingId !== null}
                        onClick={() => handleSelect(diagram.id ?? '')}
                      >
                        {connectingId === diagram.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Link2 className="size-4" />
                        )}
                        Link Diagram
                      </Button>
                    </div>
                  </div>
                  <div className="mt-2">
                    <h4 className="text-foreground line-clamp-1 text-sm font-medium">
                      {diagram.name ?? 'Blank Diagram'}
                    </h4>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex shrink-0 items-center justify-center gap-3 pt-1">
            <Button
              preset="outline"
              className="h-8 px-3 text-sm"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <span className="text-muted-foreground text-sm">
              Page {page + 1} of {totalPages}
            </span>
            <Button
              preset="outline"
              className="h-8 px-3 text-sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </BetterDialogContent>
  )
}
