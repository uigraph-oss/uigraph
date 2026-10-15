import { UIGraphLogo } from '@/components/logo'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useFlowDiagramContext } from './context/flow-diagram-context'

export function FullscreenLogo() {
  const [isLogoHovered, setIsLogoHovered] = useState(false)
  const [isNameFocused, setIsNameFocused] = useState(false)

  const {
    isEmbedded,
    isFullscreen,
    sidebarActiveTool,
    diagramName,
    setDiagramName,
  } = useFlowDiagramContext()

  if (isEmbedded || !isFullscreen) return null

  return (
    <div
      className={cn(
        'pointer-events-auto absolute top-4 left-[1.1875rem] flex items-center',
        '-translate-x-[calc(100%_+_1.1875rem)] transition-transform duration-200 group-hover/left-controls:translate-x-0',
        (isNameFocused || sidebarActiveTool) && 'translate-x-0'
      )}
      onMouseEnter={() => setIsLogoHovered(true)}
      onMouseLeave={() => setIsLogoHovered(false)}
    >
      <Link to="/dashboard" className="rounded-full">
        <UIGraphLogo className="size-11 max-w-none" />
      </Link>

      <AnimatePresence initial={false}>
        {(isLogoHovered || isNameFocused) && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 'auto', opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="-m-1 overflow-hidden p-1"
          >
            <div className="ml-4">
              <Input
                value={diagramName}
                placeholder="Enter diagram name"
                onChange={(e) => setDiagramName(e.target.value)}
                onFocus={() => setIsNameFocused(true)}
                onBlur={() => setIsNameFocused(false)}
                className="placeholder:text-foreground/20 h-auto rounded-[0.5rem] px-2.5 py-1.5 !text-[1.1rem] font-medium shadow-none placeholder:text-lg placeholder:font-medium"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
