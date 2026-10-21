import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { BsDatabase } from 'react-icons/bs'
import { LuCloudy, LuImage, LuShapes, LuWorkflow } from 'react-icons/lu'
import { MdAnimation } from 'react-icons/md'
import { RxText } from 'react-icons/rx'
import { useFlowDiagramContext } from '../context/flow-diagram-context'
import { SidebarAnimatedNodes } from './panel-animated-nodes'
import { PanelDataSourcesUnified } from './panel-data-sources-unified'
import { SidebarIcons } from './panel-icons'
import { SidebarImages } from './panel-images'
import { SidebarModeling } from './panel-modeling'
import { SidebarShapes } from './panel-shapes'
import { SidebarText } from './panel-text'
import { SidebarLayout } from './sidebar-layout'

export function FloatingLeftSidebar() {
  const { sidebarActiveTool, setSidebarActiveTool, isEmbedded, isFullscreen } =
    useFlowDiagramContext()

  const autoHideSidebar = !isEmbedded && isFullscreen && !sidebarActiveTool

  return (
    <>
      <SidebarLayout
        className={cn(
          !isEmbedded && isFullscreen && 'top-[4.25rem]',
          autoHideSidebar &&
            '-translate-x-[calc(100%_+_1rem)] transition-transform duration-200 group-hover/left-controls:translate-x-0'
        )}
      >
        <div className="flex flex-col items-center gap-1.5 p-1">
          <SidebarButton
            name="General"
            icon={<LuShapes />}
            isActive={sidebarActiveTool === 'shapes'}
            onClick={() =>
              setSidebarActiveTool((prev) =>
                prev === 'shapes' ? null : 'shapes'
              )
            }
          />
          <SidebarButton
            name="Modeling"
            icon={<LuWorkflow />}
            isActive={sidebarActiveTool === 'modeling'}
            onClick={() =>
              setSidebarActiveTool((prev) =>
                prev === 'modeling' ? null : 'modeling'
              )
            }
          />
          <SidebarButton
            name="Icons"
            icon={<LuCloudy />}
            isActive={sidebarActiveTool === 'icons'}
            onClick={() =>
              setSidebarActiveTool((prev) =>
                prev === 'icons' ? null : 'icons'
              )
            }
          />
          <SidebarButton
            name="Images"
            icon={<LuImage />}
            isActive={sidebarActiveTool === 'images'}
            onClick={() =>
              setSidebarActiveTool((prev) =>
                prev === 'images' ? null : 'images'
              )
            }
          />

          <SidebarButton
            name="Animated Nodes"
            icon={<MdAnimation />}
            isActive={sidebarActiveTool === 'animated'}
            onClick={() =>
              setSidebarActiveTool((prev) =>
                prev === 'animated' ? null : 'animated'
              )
            }
          />

          <SidebarButton
            name="Text"
            icon={<RxText />}
            isActive={sidebarActiveTool === 'text'}
            onClick={() =>
              setSidebarActiveTool((prev) => (prev === 'text' ? null : 'text'))
            }
          />

          <SidebarButton
            name="Data Sources"
            icon={<BsDatabase />}
            isActive={sidebarActiveTool === 'data-sources'}
            onClick={() => {
              setSidebarActiveTool((prev) =>
                prev === 'data-sources' ? null : 'data-sources'
              )
            }}
          />
        </div>
      </SidebarLayout>

      {sidebarActiveTool === 'shapes' && <SidebarShapes />}
      {sidebarActiveTool === 'modeling' && <SidebarModeling />}
      {sidebarActiveTool === 'icons' && <SidebarIcons />}
      {sidebarActiveTool === 'images' && <SidebarImages />}
      {sidebarActiveTool === 'animated' && <SidebarAnimatedNodes />}
      {sidebarActiveTool === 'text' && <SidebarText />}
      {sidebarActiveTool === 'data-sources' && <PanelDataSourcesUnified />}
    </>
  )
}

function SidebarButton({
  icon,
  name,
  isActive,
  onClick,
}: {
  name: string
  icon: React.ReactNode
  isActive?: boolean
  onClick?: () => void
}) {
  return (
    <TooltipProvider>
      <Tooltip open={isActive ? false : undefined}>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-[0.5rem] border border-[#2A3242] bg-transparent text-[#F4F7FC] transition-all hover:bg-[#1E2533] [&>svg]:!size-5',
              isActive && 'border-primary/30 bg-primary/10 text-primary'
            )}
          >
            {icon}
          </button>
        </TooltipTrigger>

        <TooltipContent side="right">{name}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
