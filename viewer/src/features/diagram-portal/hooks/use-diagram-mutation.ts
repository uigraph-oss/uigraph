import { useAutoRef } from '@/hooks/use-auto-ref'
import { useMutation } from '@apollo/client'
import {
  convertReactFlowToC4UiGraph,
  convertReactFlowToSequenceUiGraph,
  convertUiGraphToMermaid,
  isC4ReactFlowDiagram,
  isSequenceDiagram,
} from '@uigraph/sdk'
import { Edge, Node } from '@xyflow/react'
import { useEffectState } from 'daily-code/react'
import ms from 'ms'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { UPDATE_DIAGRAM } from '../api/diagram'
import { convertDiagramServerDataToString } from '../helpers/diagram-data'
import { ServerDiagramData } from '../types/diagram'

type TUseDiagramPortalMutationProps = ServerDiagramData & {
  diagramId: string | null
  organizationId: string | null
  folderId: string | null
  teamId: string | null
  diagramName: string
  initialLastUpdatedAt: string | undefined
  disabled: boolean
}

export function useDiagramPortalMutation({
  nodes,
  edges,

  components,
  dataSources,

  viewport,

  disabled,
  diagramId,
  diagramName,
  organizationId,
  folderId,
  teamId,
  initialLastUpdatedAt,
}: TUseDiagramPortalMutationProps) {
  const [loading, setLoading] = useState(false)
  const [updateDiagram] = useMutation(UPDATE_DIAGRAM)

  const serverLastUpdatedAt = useMemo(() => {
    return initialLastUpdatedAt ? new Date(initialLastUpdatedAt).getTime() : 0
  }, [initialLastUpdatedAt])

  const [lastUpdatedAt, setLastUpdatedAt] = useEffectState(serverLastUpdatedAt)

  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const savedExportRef = useRef<string | null>(null)
  const helpersRef = useAutoRef({
    updateDiagram,

    lastUpdatedAt,
    setLastUpdatedAt,

    nodes,
    edges,
    viewport,

    components,
    dataSources,

    disabled,
    diagramId,
    diagramName,
    organizationId,
    folderId,
    teamId,
  })

  const saveMetaData = useCallback(
    async (updateThumbnail = false) => {
      if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current)
      console.log('> Saving meta data')

      const {
        updateDiagram,

        lastUpdatedAt,
        setLastUpdatedAt,

        disabled,
        diagramId,
        diagramName,
        organizationId,
        folderId,
        teamId,
        ...data
      } = helpersRef.current

      if (!diagramId || !organizationId || disabled) return null

      const updatesInput = {
        name: diagramName,
        content: convertDiagramServerDataToString({
          nodes: data.nodes,
          edges: data.edges,
          viewport: data.viewport,
          components: data.components,
          dataSources: data.dataSources,
        }),
        ...(folderId ? { folderId } : {}),
        ...(teamId ? { teamId } : {}),
      }

      const updateInputStringified = JSON.stringify(updatesInput)
      const isDiagramCached =
        CACHED_UPDATES.has(diagramId) &&
        CACHED_UPDATES.get(diagramId) === updateInputStringified

      if (isDiagramCached && !updateThumbnail) {
        console.info('Diagram already up to date, skipping update')
        return CACHED_HASHES.get(diagramId) ?? null
      }

      let contentHash = CACHED_HASHES.get(diagramId) ?? null

      try {
        setLoading(true)

        if (!isDiagramCached) {
          const result = await updateDiagram({
            variables: {
              orgId: organizationId,
              id: diagramId,
              input: updatesInput,
            },
          })
          CACHED_UPDATES.set(diagramId, updateInputStringified)

          contentHash = result.data?.updateDiagram.contentHash ?? null
          if (contentHash) CACHED_HASHES.set(diagramId, contentHash)
        }
      } catch {
        toast.error('Failed to update diagram. Please try again.')
        return null
      } finally {
        setLoading(false)
      }

      return contentHash
    },
    [helpersRef]
  )

  useEffect(() => {
    const { disabled } = helpersRef.current
    if (disabled) return
    if (helpersRef.current.nodes.some((node) => node.data?.autoLayout)) return

    if (savedExportRef.current === null) {
      savedExportRef.current = exportForSave(
        helpersRef.current.diagramName,
        helpersRef.current.nodes,
        helpersRef.current.edges
      )
      return
    }

    updateTimeoutRef.current = setTimeout(() => {
      const { diagramName, nodes, edges } = helpersRef.current
      const exported = exportForSave(diagramName, nodes, edges)
      if (exported === savedExportRef.current) return
      savedExportRef.current = exported
      void saveMetaData()
    }, SAVE_DIAGRAM_DATA_TIMEOUT)

    return () => {
      if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current)
    }
  }, [
    nodes,
    edges,
    components,
    dataSources,
    diagramName,

    saveMetaData,
    helpersRef,
    updateTimeoutRef,
  ])

  return {
    isMetaUpdating: loading,
    triggerMetaUpdate: saveMetaData,
  }
}

function exportForSave(name: string, nodes: Node[], edges: Edge[]) {
  if (isC4ReactFlowDiagram(nodes)) {
    return JSON.stringify({
      name,
      ...convertReactFlowToC4UiGraph(nodes, edges),
    })
  }
  if (isSequenceDiagram(nodes)) {
    return JSON.stringify({
      name,
      ...convertReactFlowToSequenceUiGraph(nodes, edges),
    })
  }
  return JSON.stringify({ name, ...convertUiGraphToMermaid({ nodes, edges }) })
}

const CACHED_UPDATES = new Map<string, string>()
const CACHED_HASHES = new Map<string, string>()

const SAVE_DIAGRAM_DATA_TIMEOUT = ms('1s')
