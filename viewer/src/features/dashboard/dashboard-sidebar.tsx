'use client'

import { UigraphMark } from '@/components/logo'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { DASHBOARD_NAV_LINKS } from '@/constants'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth-store'
import { ReactNode } from 'react'
import { LuSparkles } from 'react-icons/lu'
import { Link, useLocation } from 'react-router-dom'

export function DashboardSidebar() {
  const pathname = useLocation().pathname
  const hasOrganization = useAuthStore(
    (state) => state.organizations.length > 0
  )
  const isServerAdmin = useAuthStore((state) => state.user?.isServerAdmin)

  const navLinks = DASHBOARD_NAV_LINKS.filter(
    (item) =>
      (hasOrganization || item.id !== '/server') &&
      (!item.serverAdminOnly || isServerAdmin)
  )

  return (
    <aside
      className={'flex h-full min-h-0 flex-col gap-[1.31rem] bg-[#141925] py-4'}
    >
      <div className={'shrink-0 px-4'}>
        <Link to="/dashboard" className={'flex items-center justify-center'}>
          <UigraphMark size={42} />
        </Link>
      </div>

      <TooltipProvider delayDuration={400}>
        <ul
          className={
            'no-scrollbar flex min-h-0 w-full flex-1 flex-col gap-3 overflow-y-auto px-2'
          }
        >
          {navLinks.map((item) => (
            <SidebarNavItem
              key={item.id}
              to={item.id}
              label={item.label}
              icon={item.icon}
              isActive={item.isActive(pathname)}
            />
          ))}
        </ul>

        <ul className="shrink-0 px-2">
          <SidebarNavItem
            to="/plans"
            label="Plans"
            icon={<LuSparkles />}
            isActive={pathname.startsWith('/plans')}
          />
        </ul>
      </TooltipProvider>
    </aside>
  )
}

function SidebarNavItem(props: {
  to: string
  label: string
  icon: ReactNode
  isActive: boolean
}) {
  return (
    <li className="relative block select-none">
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            to={props.to}
            className={cn(
              'block rounded-[0.75rem] p-1 transition-all',
              !props.isActive && 'cursor-pointer hover:bg-[#1E2533]',
              props.isActive && 'text-primary cursor-default'
            )}
          >
            <span
              className={cn(
                'relative mx-auto flex size-10 items-center justify-center bg-transparent text-2xl transition-all *:transition-all',
                props.isActive && 'bg-primary/5 rounded-[0.75rem]'
              )}
            >
              {props.icon}
            </span>

            <span className="block text-center text-[10px]">{props.label}</span>
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">{props.label}</TooltipContent>
      </Tooltip>
    </li>
  )
}
