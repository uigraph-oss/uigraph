'use client'

import { SectionGetStarted } from '@/components/section-get-started'
import { SectionLoader } from '@/components/section-loader'
import { SectionNotFound } from '@/components/section-not-found'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Paths } from '@/constants'
import { DashboardPageSectionLayout } from '@/features/dashboard'
import { cn } from '@/lib/utils'
import { Network } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDashboardServicesList } from '../../hooks/use-dashboard-services'
import { ServiceCard } from './service-card'

export function DashboardServices() {
  const navigate = useNavigate()
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  const {
    services,
    isServicesLoading,
    statsByServiceId,
    isStatsLoading,
    search,
    setSearch,
  } = useDashboardServicesList()

  const categories = useMemo(() => {
    const counts = new Map<string, number>()
    for (const s of services) {
      if (s.category) {
        const key = s.category.toLowerCase()
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(
        ([key, count]) =>
          [key.charAt(0).toUpperCase() + key.slice(1), count] as [
            string,
            number,
          ]
      )
  }, [services])

  const filtered = useMemo(() => {
    if (!activeCategory) return services
    return services.filter(
      (s) => s.category?.toLowerCase() === activeCategory.toLowerCase()
    )
  }, [services, activeCategory])

  return (
    <DashboardPageSectionLayout
      title="Service Catalog"
      description="Services, APIs and dependencies from your registered projects"
      crumbs={[{ to: '/services', label: 'Services' }]}
      headerContent={
        <Button
          preset="outline"
          onClick={() => navigate(Paths.services.dependency)}
        >
          <Network />
          Dependency graph
        </Button>
      }
    >
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search services..."
          className="h-10 w-52 rounded-lg border-[#2A3242] bg-[#1E2533] text-[13px] shadow-none focus-visible:bg-[#1E2533]"
        />

        <div className="flex items-center gap-0.5 rounded-lg bg-[#1E2533] p-0.5 ring-1 ring-[#2A3242]">
          <FilterPill
            label="All"
            count={services.length}
            active={activeCategory === null}
            onClick={() => setActiveCategory(null)}
          />
          {categories.map(([cat, count]) => (
            <FilterPill
              key={cat}
              label={cat}
              count={count}
              active={activeCategory === cat}
              onClick={() =>
                setActiveCategory(activeCategory === cat ? null : cat)
              }
            />
          ))}
        </div>
      </div>

      {isServicesLoading ? (
        <SectionLoader label="Loading services..." />
      ) : services.length === 0 && !search ? (
        <SectionGetStarted label="The .uigraph artifacts have no services." />
      ) : filtered.length === 0 ? (
        <SectionNotFound label="No services match your search." />
      ) : (
        <div
          className="grid grid-cols-1 gap-4 pb-6"
          style={{
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          }}
        >
          {filtered.map((service, index) => (
            <ServiceCard
              key={service.id}
              service={service}
              index={index}
              stats={statsByServiceId.get(service.id)}
              statsLoading={isStatsLoading}
            />
          ))}
        </div>
      )}
    </DashboardPageSectionLayout>
  )
}

export function FilterPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-2 rounded-lg px-3 text-[13px] font-medium transition-all duration-150',
        active
          ? 'bg-[#2A3242] text-[#F4F7FC]'
          : 'text-[#828DA3] hover:bg-[#2A3242]/50 hover:text-[#F4F7FC]'
      )}
    >
      {label}
      <span
        className={cn(
          'rounded px-1 py-px text-[10px] font-semibold tabular-nums',
          active ? 'bg-white/15 text-white' : 'bg-[#141925] text-[#828DA3]'
        )}
      >
        {count}
      </span>
    </button>
  )
}
