'use client'

import { SuperCircleLoader } from '@/components/loader'
import { SectionLoader } from '@/components/section-loader'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DashboardPageSectionLayout } from '@/features/dashboard'
import { usePermissions } from '@/hooks/use-permissions'
import { cn } from '@/lib/utils'
import { ReactNode } from 'react'
import { LuChevronDown, LuLink } from 'react-icons/lu'
import { RxGroup } from 'react-icons/rx'
import { CirclePlusIcon } from '../../assets/svgs/component-icons'
import { FocalPointEditor } from './components/focal-point-editor'
import {
  FocalPointContextProvider,
  useFocalPointContext,
} from './context/focal-point-context'
import { CanvasTool } from './types'

const CANVAS_TOOLS: { id: CanvasTool; label: string; icon: ReactNode }[] = [
  { id: 'focal', label: 'Add Focal Point', icon: <CirclePlusIcon /> },
  { id: 'link', label: 'Link Point', icon: <LuLink /> },
  { id: 'group', label: 'Add Group', icon: <RxGroup /> },
]

const activeToolClassName = 'border-primary/30 bg-primary/10 text-primary'

export function DashboardMapFramePage() {
  return (
    <FocalPointContextProvider>
      <FocalPointPageInner />
    </FocalPointContextProvider>
  )
}

function FocalPointPageInner() {
  const {
    activeTool,
    setActiveTool,

    frame,
    frameLoading,

    map,
    mapLoading,
  } = useFocalPointContext()
  const { canWrite } = usePermissions()

  const mainTool =
    CANVAS_TOOLS.find((tool) => tool.id === activeTool) ?? CANVAS_TOOLS[0]

  return (
    <DashboardPageSectionLayout
      noPadding
      title="Focal Point"
      description="Allows users to add focal points to an image and input related metadata like implementation and quality details."
      crumbs={[
        { to: `/dashboard/maps`, label: 'Maps' },
        {
          to: `/dashboard/maps/${map?.id}`,
          label: mapLoading ? (
            <SuperCircleLoader />
          ) : (
            (map?.name ?? 'Untitled Map')
          ),
        },
        {
          to: `/dashboard/frame/${frame?.id}`,
          label: frameLoading ? (
            <SuperCircleLoader />
          ) : (
            (frame?.name ?? 'Frame')
          ),
        },
      ]}
      headerContent={
        frame && (
          <div className="flex items-center gap-2">
            <div className="flex items-center">
              <Button
                preset={activeTool ? 'outline' : 'primary'}
                className={cn(
                  'rounded-r-none border-r-0',
                  activeTool && activeToolClassName
                )}
                disabled={!canWrite}
                title={activeTool ? `Exit ${mainTool.label}` : undefined}
                onClick={() => setActiveTool(activeTool ? null : mainTool.id)}
              >
                {mainTool.icon}
                {mainTool.label}
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    preset={activeTool ? 'outline' : 'primary'}
                    className={cn(
                      'rounded-l-none px-3 has-[>svg]:px-3',
                      activeTool && activeToolClassName
                    )}
                    disabled={!canWrite}
                    title="Canvas tools"
                  >
                    <LuChevronDown />
                  </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end">
                  {CANVAS_TOOLS.filter((tool) => tool.id !== mainTool.id).map(
                    (tool) => (
                      <DropdownMenuItem
                        key={tool.id}
                        onClick={() => setActiveTool(tool.id)}
                      >
                        {tool.icon}
                        {tool.label}
                      </DropdownMenuItem>
                    )
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )
      }
    >
      {frame ? (
        <FocalPointEditor />
      ) : (
        <>
          {frameLoading ? (
            <SectionLoader />
          ) : (
            <div className="text-center text-gray-500">Frame not found</div>
          )}
        </>
      )}
    </DashboardPageSectionLayout>
  )
}
