import { DashboardServiceDependencies } from '@/features/services/dashboard-service-dependencies'
import { useParams } from 'react-router-dom'

export function ServiceDependenciesRoute() {
  const { serviceId } = useParams<{ serviceId: string }>()
  return <DashboardServiceDependencies serviceId={serviceId!} />
}
