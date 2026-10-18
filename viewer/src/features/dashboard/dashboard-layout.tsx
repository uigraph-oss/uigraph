'use client'

import { GridScrollBody } from '@/components/grid-scroll-body'
import { PropsWithChildren, ReactNode } from 'react'
import { DashboardHeader } from './dashboard-header'
import { DashboardSidebar } from './dashboard-sidebar'

export function DashboardLayout({ children }: PropsWithChildren) {
  return (
    <main className="bg-shading-gray grid h-screen grid-cols-[5.25rem_1fr] grid-rows-[1fr] gap-2 overflow-hidden">
      <DashboardSidebar />
      {children}
    </main>
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
