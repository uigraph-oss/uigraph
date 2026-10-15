'use client'

import { UIGraphLogo } from '@/components/logo'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Paths } from '@/constants/paths'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useAuthStore } from '@/store/auth-store'
import { useQuery } from '@tanstack/react-query'
import { Fragment } from 'react'
import { LuUser } from 'react-icons/lu'
import { Link } from 'react-router-dom'

export type DashboardHeaderProps = {
  enableLogo?: boolean
  crumbs: { to: string; label: React.ReactNode }[]
}

export function DashboardHeader({ crumbs, enableLogo }: DashboardHeaderProps) {
  return (
    <header className="bg-shading flex h-[5rem] items-center justify-between rounded-[1.2rem] px-6 py-4">
      <div className="flex items-center gap-6">
        {enableLogo && (
          <Link to="/dashboard/maps" className="rounded-full bg-white">
            <UIGraphLogo />
          </Link>
        )}

        <Breadcrumb>
          <BreadcrumbList className={'gap-2 text-[1.375rem]'}>
            {crumbs.map((crumb, i, crumbs) => (
              <Fragment key={`${crumb.to}-${i}`}>
                {i > 0 && <BreadcrumbSeparator />}

                <BreadcrumbItem>
                  {crumbs.length - 1 === i ? (
                    <BreadcrumbPage className={'font-semibold'}>
                      {capitalizeBreadcrumbLabel(crumb.label)}
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink className={'font-semibold'} asChild>
                      <Link to={crumb.to}>
                        {capitalizeBreadcrumbLabel(crumb.label)}
                      </Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="flex items-center space-x-4">
        <UserBadge />
      </div>
    </header>
  )
}

export function UserBadge() {
  const username = useAuthStore((state) => state.user?.name)
  const projects = useQuery({
    queryKey: ['registered-projects'],
    queryFn: getRegisteredProjects,
  })

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={username}
              className="border-stock text-foreground/80 flex size-[2.7938125rem] items-center justify-center rounded-full border"
            >
              <LuUser className="text-paragraph size-[1.125rem]" />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">{username}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Projects</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {projects.isPending && (
          <DropdownMenuItem disabled>Loading projects...</DropdownMenuItem>
        )}
        {projects.isError && (
          <DropdownMenuItem disabled>{projects.error.message}</DropdownMenuItem>
        )}
        {projects.data?.length === 0 && (
          <DropdownMenuItem disabled>No projects are registered.</DropdownMenuItem>
        )}
        {projects.data?.flatMap((project) =>
          project.services.length === 0 ? (
            <DropdownMenuItem
              key={project.root}
              disabled
              className="flex-col items-start gap-0.5"
            >
              <span>{project.root.split('/').at(-1)}</span>
              <span className="text-paragraph w-full truncate text-xs">
                {project.problem ?? 'Has no services'}
              </span>
            </DropdownMenuItem>
          ) : (
            project.services.map((service) => (
              <DropdownMenuItem
                key={service.id}
                asChild
                className="flex-col items-start gap-0.5"
              >
                <Link to={Paths.services.detail(service.id)}>
                  <span>{service.name}</span>
                  <span className="text-paragraph w-full truncate text-xs">
                    {project.root}
                  </span>
                </Link>
              </DropdownMenuItem>
            ))
          )
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

async function getRegisteredProjects() {
  const response = await fetch('/api/projects')
  if (!response.ok) {
    throw new Error(`Projects could not be loaded (${response.status}).`)
  }
  return (await response.json()) as {
    root: string
    problem: string | null
    services: { id: string; name: string }[]
  }[]
}

function capitalizeFirstLetter(str: string): string {
  if (!str || typeof str !== 'string') return str
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function capitalizeBreadcrumbLabel(label: React.ReactNode): React.ReactNode {
  if (typeof label === 'string') {
    return capitalizeFirstLetter(label)
  }
  return label
}
