import { generateNavItems } from '@/utils/nav-items'
import { ReactNode } from 'react'
import { GoGitCompare, GoProject, GoStack } from 'react-icons/go'
import { HiOutlineDocumentText } from 'react-icons/hi2'
import { LuScanSearch } from 'react-icons/lu'

type NavLinkMeta = {
  icon: ReactNode
  disabled?: boolean | string
  adminOnly?: boolean
  serverAdminOnly?: boolean
}

export const DASHBOARD_NAV_LINKS = generateNavItems<NavLinkMeta>(
  {
    id: '/dashboard/diagrams',
    label: 'Diagrams',
    icon: <GoGitCompare />,
    nested: true,
  },
  {
    id: '/dashboard/docs',
    label: 'Docs',
    icon: <HiOutlineDocumentText />,
    nested: true,
  },
  {
    id: '/services',
    label: 'Services',
    icon: <GoStack />,
    nested: true,
  },
  {
    id: '/dashboard/maps',
    label: 'Maps',
    icon: <GoProject />,
    nested: true,
  },
  {
    id: '/dashboard/lens',
    label: 'Lens',
    icon: <LuScanSearch />,
    nested: true,
  }
)
