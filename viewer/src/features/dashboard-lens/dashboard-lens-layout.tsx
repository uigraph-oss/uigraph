import { Paths } from '@/constants/paths'
import { DashboardPageLayout } from '@/features/dashboard'
import { Outlet } from 'react-router-dom'

export function DashboardLensLayout() {
  return (
    <DashboardPageLayout crumbs={[{ to: Paths.lens.dashboard, label: 'Lens' }]}>
      <div className="flex h-full min-h-0 flex-col">
        <Outlet />
      </div>
    </DashboardPageLayout>
  )
}
