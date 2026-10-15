import { SettingsIcon, UserIcon } from '@/assets/svgs'
import { generateNavItems } from '@/utils/nav-items'
import { ReactNode } from 'react'
import {
  GoGitCompare,
  GoOrganization,
  GoProject,
  GoStack,
} from 'react-icons/go'
import { HiOutlineDocumentText } from 'react-icons/hi2'
import { LuBot, LuScanSearch } from 'react-icons/lu'

const NOT_AVAILABLE = 'Not available in the local version'

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
  },
  {
    id: '/settings',
    label: 'Settings',
    icon: <SettingsIcon />,
    nested: true,
  }
)

export const DASHBOARD_SETTINGS_NAV_LINKS = generateNavItems<NavLinkMeta>(
  {
    id: '/settings/profile',
    disabled: NOT_AVAILABLE,
    label: 'Profile',
    icon: <UserIcon />,
  },
  {
    id: '/settings/organization',
    disabled: NOT_AVAILABLE,
    label: 'Organization',
    icon: <GoOrganization />,
    adminOnly: true,
  },
  {
    id: '/settings/service-accounts',
    disabled: NOT_AVAILABLE,
    label: 'Service Accounts',
    icon: <LuBot />,
    adminOnly: true,
  }
)
