import { LuFocus } from 'react-icons/lu'
import { useFlowDiagramContext } from './context/flow-diagram-context'
import { ToolbarButton } from './floating-canvas-toolbar'
import {
  fitAllNodes,
  NEUTRAL_ZOOM,
  ZOOMED_OUT_THRESHOLD,
} from './helpers/camera'

export function FloatingZoomedOutBar() {
  const { nodes, viewport, reactFlowInstance } = useFlowDiagramContext()

  const zoom = viewport?.zoom ?? NEUTRAL_ZOOM

  if (nodes.length === 0) return null
  if (zoom > ZOOMED_OUT_THRESHOLD) return null

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 flex items-center justify-center">
      <ToolbarButton
        className="pointer-events-auto w-auto gap-2 rounded-[0.75rem] bg-[#141925] px-3 text-sm shadow-sm"
        onClick={() => reactFlowInstance && fitAllNodes(reactFlowInstance)}
      >
        <LuFocus className="size-4" />
        Focus on content
      </ToolbarButton>
    </div>
  )
}
