import { TextAreaInput, TextInput } from '@/features/component-meta'
import { useEffectState } from '@/hooks/use-effect-state'
import { useSingleSelectedNode } from '../hooks/use-single-selected-node'
import { TC4BoundaryNode } from '../nodes/c4-boundary-node'
import { TC4Node } from '../nodes/c4-node'
import { Field } from './field'

export function NodeC4Data() {
  const { node, data, updateData } = useSingleSelectedNode<
    TC4Node | TC4BoundaryNode
  >()

  const [localTechnology, setLocalTechnology] = useEffectState<string>(
    (data as TC4Node['data'] | null)?.technology ?? ''
  )

  const [localDescription, setLocalDescription] = useEffectState<string>(
    data?.description ?? ''
  )

  if (!data) return null

  const c4Kind = (data as TC4Node['data']).c4Kind
  const hasTechnology = c4Kind === 'container' || c4Kind === 'component'

  return (
    <>
      {node?.type === 'c4' && hasTechnology && (
        <Field label="Technology">
          <TextInput
            value={localTechnology}
            placeholder="e.g. React, Go, PostgreSQL"
            onChange={(value) => {
              setLocalTechnology(value)
              updateData({ technology: value })
            }}
          />
        </Field>
      )}

      <Field label="Description">
        <TextAreaInput
          value={localDescription}
          placeholder="What this element does"
          onChange={(value) => {
            setLocalDescription(value)
            updateData({ description: value })
          }}
        />
      </Field>
    </>
  )
}
