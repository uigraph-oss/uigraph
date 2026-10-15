'use client'

import { GridScrollBody } from '@/components/grid-scroll-body'
import { DASHBOARD_SETTINGS_NAV_LINKS } from '@/constants'
import { PropsWithChildren, ReactNode } from 'react'
import { DashboardHeader } from './dashboard-header'
import { DashboardSidebar } from './dashboard-sidebar'
import { UnavailableFeature } from './unavailable-feature'

export function DashboardLayout({ children }: PropsWithChildren) {
  return (
    <main className="bg-shading-gray grid h-screen grid-cols-[5.25rem_1fr] grid-rows-[1fr] gap-2 overflow-hidden">
      <DashboardSidebar />
      {children}
    </main>
  )
}

export function DashboardSettingsLayout({ children }: PropsWithChildren) {
  return (
    <DashboardPageLayout crumbs={[{ to: '/settings', label: 'Settings' }]}>
      <div className="grid h-full grid-cols-[15rem_1fr] gap-3 p-3">
        <aside className="border-stock bg-card block rounded-[0.75rem] border">
          <label className="border-stock flex h-14 items-center border-b px-4">
            Settings
          </label>

          <ul className="flex flex-col gap-2 px-4 py-2">
            {DASHBOARD_SETTINGS_NAV_LINKS.map((item) => (
              <li key={item.id} className="relative block select-none">
                <UnavailableFeature
                  label={item.label}
                  message={
                    typeof item.disabled === 'string'
                      ? item.disabled
                      : 'Not available in the local version'
                  }
                >
                  <button
                    type="button"
                    aria-label={`${item.label}: ${item.disabled}`}
                    className="text-paragraph hover:bg-stock flex h-[2.4375rem] w-full cursor-pointer items-center rounded-[0.5rem] bg-transparent px-3 py-2"
                  >
                    <span className="block text-base">{item.icon}</span>
                    <span className="ml-2 block text-sm">{item.label}</span>
                  </button>
                </UnavailableFeature>
              </li>
            ))}
          </ul>
        </aside>

        <GridScrollBody
          className={'border-stock bg-card rounded-[0.75rem] border'}
        >
          {children}
        </GridScrollBody>
      </div>
    </DashboardPageLayout>
  )
}

export function DashboardPageLayout({
  children,
  crumbs,
}: PropsWithChildren<{ crumbs: { to: string; label: ReactNode }[] }>) {
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_1fr] gap-[0.81rem] pt-3 pr-3">
      <DashboardHeader crumbs={crumbs} />

      <GridScrollBody className="bg-shading min-h-0 rounded-t-[1.2rem]">
        {children}
      </GridScrollBody>
    </div>
  )
}
