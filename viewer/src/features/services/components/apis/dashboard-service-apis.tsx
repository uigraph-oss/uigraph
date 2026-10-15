'use client'

import { SectionLoader } from '@/components/section-loader'
import { SectionNotFound } from '@/components/section-not-found'
import { Input } from '@/components/ui/input'
import {
  DashboardSectionContent,
  DashboardSectionHeader,
} from '@/features/dashboard'
import { apiGroupToLegacy } from '@/features/services/api/api-adapters'
import { API_GROUPS } from '@/features/services/api/api-endpoints'
import { cn } from '@/lib/utils'
import { useCurrentOrganization } from '@/store/auth-store'
import { useQuery } from '@apollo/client'
import { arrayNonNullable } from 'daily-code'
import { useMemo, useState } from 'react'
import { useServiceContext } from '../../contexts/service-context'
import { ServiceApiEndpointGroupCard } from './service-api-group-card'

export function DashboardServiceApis() {
  const { serviceId } = useServiceContext()
  const orgId = useCurrentOrganization().id
  const [searchQuery, setSearchQuery] = useState('')
  const [activeProtocol, setActiveProtocol] = useState<string | null>(null)

  const { data, loading } = useQuery(API_GROUPS, {
    fetchPolicy: 'cache-first',
    skip: !orgId,
    variables: { orgId: orgId!, serviceId },
  })

  const isServiceApiGroupsLoading = loading && !data?.apiGroups
  const serviceApiGroups = useMemo(
    () => arrayNonNullable(data?.apiGroups).map(apiGroupToLegacy),
    [data?.apiGroups]
  )

  const protocols = useMemo(() => {
    const seen = new Set<string>()
    for (const g of serviceApiGroups) {
      const p = g.protocol?.toLowerCase()
      if (p) seen.add(p)
    }
    return Array.from(seen)
  }, [serviceApiGroups])

  const filtered = useMemo(() => {
    return serviceApiGroups.filter((g) => {
      const matchesSearch =
        !searchQuery ||
        (g.name ?? g.version ?? '')
          .toLowerCase()
          .includes(searchQuery.toLowerCase())
      const matchesProtocol =
        !activeProtocol || g.protocol?.toLowerCase() === activeProtocol
      return matchesSearch && matchesProtocol
    })
  }, [serviceApiGroups, searchQuery, activeProtocol])

  return (
    <div className="flex h-full flex-col">
      <DashboardSectionHeader
        title="API & Behavior"
        description="API groups and endpoints found in this service's code and specs."
      />

      <DashboardSectionContent noPadding>
        {isServiceApiGroupsLoading ? (
          <SectionLoader label="Loading API groups..." />
        ) : serviceApiGroups.length === 0 ? (
          <SectionNotFound
            plain
            label="The .uigraph artifacts have no API endpoints for this service."
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 border-b border-[#2A3242] px-6 py-3">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search groups..."
                className="h-8 w-48 rounded-lg border-[#2A3242] bg-[#141925] text-[13px] shadow-none focus-visible:bg-[#141925]"
              />
              {protocols.length > 1 && (
                <div className="flex items-center gap-0.5 rounded-lg bg-[#1E2533] p-0.5 ring-1 ring-[#2A3242]">
                  <ProtocolPill
                    label="All"
                    active={activeProtocol === null}
                    onClick={() => setActiveProtocol(null)}
                  />
                  {protocols.map((p) => (
                    <ProtocolPill
                      key={p}
                      label={
                        p === 'grpc'
                          ? 'gRPC'
                          : p === 'graphql'
                            ? 'GraphQL'
                            : p.toUpperCase()
                      }
                      active={activeProtocol === p}
                      onClick={() =>
                        setActiveProtocol(activeProtocol === p ? null : p)
                      }
                    />
                  ))}
                </div>
              )}
            </div>

            <div
              className="grid gap-4 p-6"
              style={{
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              }}
            >
              {filtered.length === 0 ? (
                <div className="col-span-full">
                  <SectionNotFound plain label="No groups match your search." />
                </div>
              ) : (
                filtered.map((group) => (
                  <ServiceApiEndpointGroupCard
                    key={group.serviceApiGroupId}
                    group={group}
                  />
                ))
              )}
            </div>
          </>
        )}
      </DashboardSectionContent>
    </div>
  )
}

function ProtocolPill({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-7 items-center rounded-md px-3 text-[12px] font-medium transition-all duration-150',
        active
          ? 'bg-[#0F172A] text-white'
          : 'text-[#828DA3] hover:bg-[#1E2533] hover:text-[#F4F7FC]'
      )}
    >
      {label}
    </button>
  )
}
