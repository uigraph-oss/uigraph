import { cn } from '@/lib/utils'
import { buildMetaData, C4BoundaryKind } from '@uigraph/sdk'
import { Node, NodeProps, NodeResizer, useReactFlow } from '@xyflow/react'
import { useEffectState } from 'daily-code/react'
import { useRef } from 'react'
import TextareaAutosize from 'react-textarea-autosize'
import { useFlowDiagramContext } from '../context/flow-diagram-context'
import { useComponentField } from '../hooks/use-component-field'
import { useFrameAutoLayout } from '../hooks/use-frame-auto-layout'
import { BoundaryStackIcon } from './components/boundary-stack-icon'
import { FrameHandles } from './components/frame-handles'
import { NodeDataGenerator } from './types/node.types'

export type C4BoundaryNodeData = NodeDataGenerator<{
  c4BoundaryKind: C4BoundaryKind
  boundaryType?: string
  description?: string
  backgroundColor?: string
  borderColor?: string
  fontColor?: string
  childNodes?: string[]
  autoLayout?: boolean
  collapsed?: boolean
}>

export type TC4BoundaryNode = Node<C4BoundaryNodeData, 'c4Boundary'>

const BOUNDARY_KIND_LABELS: Record<C4BoundaryKind, string> = {
  enterprise: 'ENTERPRISE',
  system: 'SYSTEM',
  container: 'CONTAINER',
  generic: 'BOUNDARY',
  node: 'NODE',
}

const DEFAULT_BACKGROUND = 'rgba(130, 141, 163, 0.06)'
const DEFAULT_BORDER = '#828DA3'

export function C4BoundaryNode({
  id,
  data,
  selected,
}: NodeProps<TC4BoundaryNode>) {
  const { updateNodeData, updateNode } = useReactFlow()
  const { boundaryDepths } = useFlowDiagramContext()

  const name = useComponentField<string>(data.componentFields, {
    componentFieldId: 'name',
  })

  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [localName, setLocalName] = useEffectState(name ?? '')

  function updateName(value: string) {
    setLocalName(value)

    if (timeoutRef.current) clearTimeout(timeoutRef.current)

    timeoutRef.current = setTimeout(() => {
      updateNodeData(id, {
        componentFields: buildMetaData(data.componentFields ?? [], {
          name: value,
        }),
      })
    }, 1000)
  }

  const autoLayout = data.autoLayout ?? false
  const collapsed = data.collapsed ?? false

  useFrameAutoLayout(id, autoLayout && !collapsed, 'bottom')

  const borderColor = data.borderColor ?? DEFAULT_BORDER
  const typeLabel =
    data.boundaryType ?? BOUNDARY_KIND_LABELS[data.c4BoundaryKind] ?? 'Boundary'

  function resolveBorderStyle() {
    if (collapsed) return 'solid'
    if (data.c4BoundaryKind === 'generic') return 'dotted'
    return 'dashed'
  }

  return (
    <div
      className="c4-boundary-box relative size-full rounded-[0.25rem]"
      style={{
        backgroundColor: data.backgroundColor ?? DEFAULT_BACKGROUND,
        border: `2px ${resolveBorderStyle()} ${borderColor}`,
      }}
    >
      <NodeResizer
        minWidth={200}
        minHeight={140}
        isVisible={selected && !autoLayout}
        onResize={(_, params) => {
          updateNode(id, { width: params.width, height: params.height })
        }}
      />

      <FrameHandles />

      <div
        className={cn(
          'c4-boundary-label absolute inset-x-0 bottom-0 flex flex-col items-start gap-0.5 px-3 pb-2',
          collapsed && 'hidden'
        )}
      >
        <TextareaAutosize
          value={localName}
          placeholder="Boundary"
          onKeyDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onChange={(e) => updateName(e.currentTarget.value)}
          className="w-full cursor-text resize-none bg-transparent text-left text-sm font-bold outline-none"
          style={{ color: data.fontColor ?? borderColor }}
        />

        <span
          className="text-[0.625rem] leading-tight"
          style={{ color: data.fontColor ?? borderColor }}
        >
          [{typeLabel}]
        </span>

        {data.description && (
          <span
            className="max-w-full text-left text-[0.625rem] leading-tight whitespace-pre-line opacity-80"
            style={{ color: data.fontColor ?? borderColor }}
          >
            {data.description}
          </span>
        )}
      </div>

      <div
        className={cn(
          'c4-boundary-collapsed-label absolute inset-0 flex-col items-center justify-center gap-[0.3em] px-[5%] text-center',
          collapsed ? 'flex' : 'hidden'
        )}
        style={{
          color: data.fontColor ?? borderColor,
          fontSize: collapsed ? 'var(--lod-font-size)' : undefined,
        }}
      >
        <span className="leading-tight font-bold wrap-anywhere">
          {localName || 'Boundary'}
        </span>

        <span className="flex items-center gap-[0.4em] text-[0.6em] leading-tight opacity-80">
          <BoundaryStackIcon
            levels={boundaryDepths.get(id) ?? 1}
            color={data.fontColor ?? borderColor}
          />
          [{typeLabel}]
        </span>

        {data.description && (
          <span className="line-clamp-2 text-[0.55em] leading-snug wrap-anywhere opacity-70">
            {data.description}
          </span>
        )}
      </div>
    </div>
  )
}
