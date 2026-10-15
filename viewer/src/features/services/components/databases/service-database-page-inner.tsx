'use client'

import { Button } from '@/components/ui/button'
import {
  DashboardSectionContent,
  DashboardSectionHeader,
} from '@/features/dashboard'
import { BetterTabController, useBetterTabs } from '@/hooks/use-better-tabs'
import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  ServiceDbContextProvider,
  useServiceDbContext,
} from '../../contexts/service-db-context'
import { SelectedDatabaseQueriesSection } from './queries/selected-database-queries-section'
import { SelectedDatabaseDiagramSection } from './selected-database-diagram-section'
import { SelectedDatabaseSchemaSection } from './selected-database-schema-section'

export function ServiceDatabasePageInner() {
  return (
    <ServiceDbContextProvider>
      <ServiceDatabasePageContent />
    </ServiceDbContextProvider>
  )
}

function ServiceDatabasePageContent() {
  const navigate = useNavigate()
  const { serviceId, serviceDb } = useServiceDbContext()

  const [control] = useBetterTabs([
    { id: 'schema', label: 'Schema' },
    { id: 'diagrams', label: 'Data model' },
    { id: 'queries', label: 'Queries' },
  ])

  return (
    <div className="flex h-full flex-col">
      <DashboardSectionHeader
        title="Database Schema"
        description="Manage database schema, data model."
      >
        <Button
          preset="outline"
          onClick={() => navigate(`/services/${serviceId}/data`)}
        >
          <ArrowLeft />
          Go to All Data
        </Button>
      </DashboardSectionHeader>

      <DashboardSectionContent>
        <BetterTabController control={control} />

        {control.activeTab === 'schema' && (
          <SelectedDatabaseSchemaSection db={serviceDb} />
        )}

        {control.activeTab === 'diagrams' && (
          <SelectedDatabaseDiagramSection db={serviceDb} />
        )}

        {control.activeTab === 'queries' && (
          <SelectedDatabaseQueriesSection db={serviceDb} />
        )}
      </DashboardSectionContent>
    </div>
  )
}
