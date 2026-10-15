'use client'

import { SectionLoader } from '@/components/section-loader'
import { SectionNotFound } from '@/components/section-not-found'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { DashboardDiagram } from './api/diagrams'
import { useDiagramsContext } from './contexts/diagrams-context'
import { FlowDiagramCard } from './flow-diagram-card'

export function DiagramsFolder() {
  const {
    diagrams,
    totalCount,
    pageSize,
    page,
    setPage,
    isLoading,
    search,
    setSearch,
  } = useDiagramsContext()

  return (
    <div className="space-y-6 pb-4">
      <div className="flex items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search flows"
          className="h-11 max-w-sm flex-1 rounded-[16px] border-[#2A3242] bg-transparent px-6 text-sm text-[#F4F7FC] shadow-none placeholder:text-[#586378] focus-visible:border-[#5C84FF]"
        />
      </div>

      {isLoading ? (
        <SectionLoader label="Loading flows..." />
      ) : diagrams.length > 0 ? (
        <DiagramGrid
          diagrams={diagrams}
          page={page}
          pageSize={pageSize}
          totalCount={totalCount}
          onPageChange={setPage}
        />
      ) : (
        <SectionNotFound
          label={
            search
              ? 'No flows match your search.'
              : 'The .uigraph artifacts have no diagrams.'
          }
        />
      )}
    </div>
  )
}

function getPageWindow(current: number, total: number): (number | '...')[] {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i)

  const pages: (number | '...')[] = []

  pages.push(0)

  const windowStart = Math.max(1, current - 1)
  const windowEnd = Math.min(total - 2, current + 1)

  if (windowStart > 1) pages.push('...')

  for (let i = windowStart; i <= windowEnd; i++) pages.push(i)

  if (windowEnd < total - 2) pages.push('...')

  pages.push(total - 1)

  return pages
}

function DiagramGrid({
  diagrams,
  page,
  pageSize,
  totalCount,
  onPageChange,
}: {
  diagrams: DashboardDiagram[]
  page: number
  pageSize: number
  totalCount: number
  onPageChange: (page: number) => void
}) {
  const totalPages = Math.ceil(totalCount / pageSize)

  return (
    <div className="space-y-4">
      <div
        className="grid gap-4 pb-4"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}
      >
        {diagrams.map((diagram) => (
          <FlowDiagramCard key={diagram.id} diagram={diagram} />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            preset="outline"
            className="h-8 px-3 text-sm"
            disabled={page === 0}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </Button>

          <div className="flex items-center gap-1">
            {getPageWindow(page, totalPages).map((entry, i) =>
              entry === '...' ? (
                <span
                  key={`ellipsis-${i}`}
                  className="flex h-8 w-8 items-center justify-center text-sm text-[#586378]"
                >
                  …
                </span>
              ) : (
                <button
                  key={entry}
                  onClick={() => onPageChange(entry as number)}
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-lg text-sm transition-colors',
                    entry === page
                      ? 'bg-primary text-white'
                      : 'text-[#828DA3] hover:bg-[#2A3242]'
                  )}
                >
                  {(entry as number) + 1}
                </button>
              )
            )}
          </div>

          <Button
            preset="outline"
            className="h-8 px-3 text-sm"
            disabled={page === totalPages - 1}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  )
}
