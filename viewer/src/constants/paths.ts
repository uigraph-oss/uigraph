export const Paths = {
  root: '/',
  auth: {
    signin: '/signin',
    signup: '/signup',
    emailConfirm: '/confirm-email',
    authorize: '/authorize',
  },
  workspace: {
    create: '/create-workspace',
  },
  dashboard: {
    root: '/dashboard',
  },
  services: {
    root: '/services',
    detail: (serviceId: string) => `/services/${serviceId}`,
    overview: (serviceId: string) => `/services/${serviceId}/overview`,
    apis: (serviceId: string) => `/services/${serviceId}/apis`,
    apiEndpoint: (serviceId: string, apiGroupId: string, endpointId: string) =>
      `/services/${serviceId}/apis/${apiGroupId}?endpointId=${endpointId}`,
    database: (serviceId: string, dbId: string) =>
      `/services/${serviceId}/data/${dbId}`,
    diagrams: (serviceId: string) => `/services/${serviceId}/diagrams`,
    costs: (serviceId: string) => `/services/${serviceId}/costs`,
    data: (serviceId: string) => `/services/${serviceId}/data`,
    operations: (serviceId: string) => `/services/${serviceId}/operations`,
    people: (serviceId: string) => `/services/${serviceId}/people`,
    dependencies: (serviceId: string) => `/services/${serviceId}/dependencies`,
    dependency: '/services/dependency',
    dataFlow: '/services/data-flow',
  },
  lens: {
    root: '/lens',
    run: (runId: string) => `/lens/${runId}`,
    dashboard: '/dashboard/lens',
    dashboardRun: (runId: string) => `/dashboard/lens/${runId}`,
  },
  localDashboard: {
    root: 'http://localhost:3001/dashboard',
  },
}
