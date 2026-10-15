import { CrossButton } from '@/components/cross-button'
import { UIGraphLogo } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { DASHBOARD_NAV_LINKS } from '@/constants'
import { env } from '@/env'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth-store'
import { PropsWithChildren, useEffect, useRef } from 'react'
import { LuChevronRight, LuMenu } from 'react-icons/lu'
import { Link } from 'react-router-dom'
import { UserBadge } from '../dashboard'
import { CommandPalette } from './command-palette'
import { DiagramTestingOptions } from './components/diagram-testing-options'
import { SubDiagramDialog } from './components/sub-diagram-dialog'
import { useFlowDiagramContext } from './context/flow-diagram-context'
import { FloatingCanvasToolbar } from './floating-canvas-toolbar'
import { FloatingSelectionToolbar } from './floating-selection-toolbar'
import { FloatingZoomedOutBar } from './floating-zoomed-out-bar'
import { FullscreenLogo } from './fullscreen-logo'
import { getZoomCounterScale } from './helpers/camera'
import { FloatingLeftSidebar } from './left-sidebar/left-sidebar'
import { FloatingProperties } from './properties'

export function FlowDiagramLayout({ children }: PropsWithChildren) {
  const {
    viewport,
    diagramName,
    setDiagramName,
    isPreviewing,
    isEmbedded,
    isFullscreen,
    triggerMetaUpdate,
  } = useFlowDiagramContext()

  const isServerAdmin = useAuthStore((state) => state.user?.isServerAdmin)

  useEffect(() => {
    if (!isEmbedded) return

    window.__uigraphEmbedSave = async () => {
      await triggerMetaUpdate(true)
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key !== 'Escape') return

      window.parent.__uigraphEmbedClose?.()
    }

    window.addEventListener('keydown', handleEscape, { capture: true })

    return () => {
      delete window.__uigraphEmbedSave
      window.removeEventListener('keydown', handleEscape, { capture: true })
    }
  }, [isEmbedded, triggerMetaUpdate])

  const zoom = viewport?.zoom ?? 1

  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return

      const target = e.target as HTMLElement | null
      if (
        target?.closest(
          '[role="dialog"],[role="menu"],[role="listbox"],[data-radix-popper-content-wrapper]'
        )
      ) {
        return
      }

      if (document.querySelector('[role="dialog"][data-state="open"]')) return

      e.stopPropagation()
      e.stopImmediatePropagation()
    }

    document.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true })
    }
  }, [containerRef])

  return (
    <section
      ref={containerRef}
      className="bg-shading flex h-screen flex-1 flex-col select-none"
    >
      <style>{`:root { --react-flow-scale: ${zoom}; --react-flow-counter-scale: ${getZoomCounterScale(zoom)} }`}</style>

      {!isEmbedded && !isFullscreen && (
        <header className="bg-shading flex h-[5rem] items-center justify-between rounded-[1.2rem] px-6 py-4">
          <div className="flex items-center gap-4">
            <Sheet>
              <SheetTrigger hidden asChild>
                <Button size="icon" variant="ghost">
                  <LuMenu className="text-foreground/40 size-8" />
                </Button>
              </SheetTrigger>

              <SheetContent
                side="left"
                className="!max-w-xs gap-0"
                showCloseButton={false}
              >
                <SheetTitle className="hidden">Navigation</SheetTitle>
                <SheetDescription className="hidden">
                  Select an action to perform
                </SheetDescription>

                <SheetHeader className="flex flex-row items-start justify-between">
                  <Link to="/dashboard">
                    <UIGraphLogo />
                  </Link>

                  <SheetClose asChild>
                    <CrossButton />
                  </SheetClose>
                </SheetHeader>

                <div className="p-3">
                  {DASHBOARD_NAV_LINKS.filter(
                    (item) => !item.serverAdminOnly || isServerAdmin
                  ).map((item) => {
                    const link = (
                      <Link
                        to={item.disabled ? '' : item.id}
                        className={cn(
                          'flex items-center justify-start gap-2 rounded-[0.75rem] p-1 px-2 transition-all',
                          item.disabled
                            ? 'text-paragraph cursor-not-allowed'
                            : 'hover:bg-accent cursor-pointer'
                        )}
                      >
                        <span
                          className={cn(
                            'flex size-10 items-center justify-center bg-transparent text-2xl transition-all *:transition-all'
                          )}
                        >
                          {item.icon}
                        </span>

                        <span className="block text-center text-sm">
                          {item.label}
                        </span>
                      </Link>
                    )

                    return (
                      <li key={item.id} className="relative block select-none">
                        {link}

                        {typeof item.disabled === 'string' && (
                          <p className="absolute inset-0 flex cursor-not-allowed items-center justify-center rounded-[0.75rem] bg-black/10 text-center text-sm opacity-0 backdrop-blur-xs transition-all hover:opacity-100">
                            {item.disabled}
                          </p>
                        )}
                      </li>
                    )
                  })}
                </div>
              </SheetContent>
            </Sheet>

            <Link to="/dashboard" className="rounded-full">
              <UIGraphLogo className="size-11 max-w-none" />
            </Link>

            <Input
              value={diagramName}
              placeholder="Enter diagram name"
              onChange={(e) => setDiagramName(e.target.value)}
              className="placeholder:text-foreground/20 h-auto rounded-[0.5rem] px-2.5 py-1.5 !text-[1.25rem] font-medium shadow-none placeholder:text-lg placeholder:font-medium"
            />
          </div>

          {env.VITE_FEATURE_DIAGRAM_IMPORT_EXPORT && <DiagramTestingOptions />}

          <UserBadge />
        </header>
      )}

      <div className={'relative isolate h-full flex-1'}>
        <div
          className={cn(
            'absolute isolate overflow-hidden',
            'inset-4 top-2 rounded-[0.75rem] border border-[#2A3242]',
            isEmbedded && 'inset-0 rounded-none border-none',
            isFullscreen && 'inset-0 rounded-none border-none'
          )}
        >
          {children}
          <FloatingCanvasToolbar />
          <FloatingZoomedOutBar />

          <div className="group/left-controls pointer-events-none absolute inset-0">
            {!isEmbedded && isFullscreen && (
              <div className="pointer-events-auto absolute top-4 bottom-0 left-0 w-10">
                <div className="pointer-events-none absolute top-1/2 left-0 flex h-14 w-5 -translate-y-1/2 items-center justify-center rounded-r-[0.375rem] border border-l-0 border-[#2A3242] bg-[#141925] transition-opacity duration-200 group-hover/left-controls:opacity-0">
                  <LuChevronRight className="size-3.5 text-[#828DA3]" />
                </div>
              </div>
            )}

            <FullscreenLogo />
            {!isPreviewing && <FloatingLeftSidebar />}
          </div>

          {!isPreviewing && <FloatingProperties />}
          {!isPreviewing && <FloatingSelectionToolbar />}
          <SubDiagramDialog />
          <CommandPalette />
        </div>
      </div>
    </section>
  )
}
