'use client'

import {
  DashboardSectionContent,
  DashboardSectionHeader,
} from '@/features/dashboard'
import { ServiceOverview } from './components/service-overview'

export function DashboardServiceOverview() {
  return (
    <div className="flex h-full flex-col">
      <DashboardSectionHeader
        title="Overview"
        description="Service summary, technologies and dependencies from the .uigraph artifacts."
      />

      <DashboardSectionContent>
        <ServiceOverview />
      </DashboardSectionContent>
    </div>
  )
}
