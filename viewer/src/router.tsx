import { SectionNotFound } from '@/components/section-not-found'
import { lazy } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'

const DashboardLayout = lazy(() =>
  import('@/features/dashboard').then((mod) => ({
    default: mod.DashboardLayout,
  }))
)
const ServiceLayout = lazy(() =>
  import('@/routes/service-layout').then((mod) => ({
    default: mod.ServiceLayout,
  }))
)
const DiagramPortalPage = lazy(() =>
  import('@/features/diagram-portal/diagram-portal-page').then((mod) => ({
    default: mod.DiagramPortalPage,
  }))
)
const NotFoundPage = lazy(() =>
  import('@/routes/not-found-page').then((mod) => ({
    default: mod.NotFoundPage,
  }))
)
const ServiceDependenciesRoute = lazy(() =>
  import('@/routes/service-pages').then((mod) => ({
    default: mod.ServiceDependenciesRoute,
  }))
)
const DashboardSettingsLayout = lazy(() =>
  import('@/features/dashboard').then((mod) => ({
    default: mod.DashboardSettingsLayout,
  }))
)
const DashboardDiagramsPage = lazy(() =>
  import('@/features/dashboard-diagrams/dashboard-diagrams-page').then(
    (mod) => ({ default: mod.DashboardDiagramsPage })
  )
)
const DashboardDocsPage = lazy(() =>
  import('@/features/dashboard-docs/dashboard-docs-page').then((mod) => ({
    default: mod.DashboardDocsPage,
  }))
)
const OrganizationDependencyGraphPage = lazy(() =>
  import('@/features/services/organization-dependency-graph-page').then(
    (mod) => ({ default: mod.OrganizationDependencyGraphPage })
  )
)
const DashboardServices = lazy(() =>
  import('@/features/services/components/services-list/dashboard-services').then(
    (mod) => ({ default: mod.DashboardServices })
  )
)
const DashboardServiceOverview = lazy(() =>
  import('@/features/services/dashboard-service-overview').then((mod) => ({
    default: mod.DashboardServiceOverview,
  }))
)
const DashboardServiceApis = lazy(() =>
  import('@/features/services/components/apis/dashboard-service-apis').then(
    (mod) => ({ default: mod.DashboardServiceApis })
  )
)
const ApiGroupEndpointsPage = lazy(() =>
  import('@/features/services/components/apis/api-group-endpoints-page').then(
    (mod) => ({ default: mod.ApiGroupEndpointsPage })
  )
)
const DashboardServiceDiagrams = lazy(() =>
  import('@/features/services/components/diagrams/dashboard-service-diagrams').then(
    (mod) => ({ default: mod.DashboardServiceDiagrams })
  )
)
const DashboardServiceDocs = lazy(() =>
  import('@/features/services/dashboard-service-docs').then((mod) => ({
    default: mod.DashboardServiceDocs,
  }))
)
const ServiceDatabaseListPage = lazy(() =>
  import('@/features/services/components/databases/service-database-list-page').then(
    (mod) => ({ default: mod.ServiceDatabaseListPage })
  )
)
const ServiceDatabasePage = lazy(() =>
  import('@/features/services/components/databases/service-database-page').then(
    (mod) => ({ default: mod.ServiceDatabasePage })
  )
)
const DashboardProjects = lazy(() =>
  import('@/features/dashboard-projects').then((mod) => ({
    default: mod.DashboardProjects,
  }))
)
const DashboardProjectPage = lazy(() =>
  import('@/features/dashboard-projects').then((mod) => ({
    default: mod.DashboardProjectPage,
  }))
)
const LensRunsPage = lazy(() =>
  import('@/features/lens/lens-runs-page').then((mod) => ({
    default: mod.LensRunsPage,
  }))
)
const DashboardLensRunsPage = lazy(() =>
  import('@/features/lens/lens-runs-page').then((mod) => ({
    default: mod.DashboardLensRunsPage,
  }))
)
const LensRunPage = lazy(() =>
  import('@/features/lens/lens-run-page').then((mod) => ({
    default: mod.LensRunPage,
  }))
)
const DashboardLensLayout = lazy(() =>
  import('@/features/dashboard-lens/dashboard-lens-layout').then((mod) => ({
    default: mod.DashboardLensLayout,
  }))
)
const DashboardPlansPage = lazy(() =>
  import('@/features/dashboard-plans/dashboard-plans-page').then((mod) => ({
    default: mod.DashboardPlansPage,
  }))
)
const DashboardMapFramePage = lazy(() =>
  import('@/features/dashboard-pages/dashboard-map-frame-page').then((mod) => ({
    default: mod.DashboardMapFramePage,
  }))
)

export function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/diagram/:diagramId"
        element={<DiagramPortalPage embedded={false} />}
      />
      <Route path="/lens" element={<LensRunsPage />} />
      <Route
        path="/lens/:runId"
        element={<LensRunPage inDashboard={false} />}
      />

      <Route
        element={
          <DashboardLayout>
            <Outlet />
          </DashboardLayout>
        }
      >
        <Route
          path="/"
          element={<Navigate to="/dashboard/diagrams" replace />}
        />
        <Route
          path="/dashboard"
          element={<Navigate to="/dashboard/diagrams" replace />}
        />
        <Route path="/dashboard/diagrams" element={<DashboardDiagramsPage />} />
        <Route path="/dashboard/docs" element={<DashboardDocsPage />} />
        <Route path="/dashboard/maps" element={<DashboardProjects />} />
        <Route
          path="/dashboard/maps/:mapId"
          element={<DashboardProjectPage />}
        />
        <Route
          path="/dashboard/frame/:frameId"
          element={<DashboardMapFramePage />}
        />
        <Route path="/dashboard/lens" element={<DashboardLensLayout />}>
          <Route index element={<DashboardLensRunsPage />} />
          <Route path=":runId" element={<LensRunPage inDashboard />} />
        </Route>
        <Route
          path="/settings"
          element={
            <DashboardSettingsLayout>
              <SectionNotFound
                plain
                label="Settings are not available in uigraph."
              />
            </DashboardSettingsLayout>
          }
        />
        <Route path="/plans" element={<DashboardPlansPage />} />
        <Route path="/services" element={<DashboardServices />} />
        <Route
          path="/services/dependency"
          element={<OrganizationDependencyGraphPage />}
        />
        <Route path="/services/:serviceId" element={<ServiceLayout />}>
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<DashboardServiceOverview />} />
          <Route path="apis" element={<DashboardServiceApis />} />
          <Route path="apis/:apiGroupId" element={<ApiGroupEndpointsPage />} />
          <Route path="architecture" element={<DashboardServiceDiagrams />} />
          <Route path="data" element={<ServiceDatabaseListPage />} />
          <Route path="data/:dbId" element={<ServiceDatabasePage />} />
          <Route path="dependencies" element={<ServiceDependenciesRoute />} />
          <Route path="docs" element={<DashboardServiceDocs />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
