import { GraphQLError } from 'graphql'
import os from 'node:os'
import { createDatabase, deleteDatabase } from '../artifacts/databases.js'
import {
  listDiagramImages,
  writeDiagramImage,
} from '../artifacts/diagram-images.js'
import { createDoc, deleteDoc } from '../artifacts/docs.js'
import {
  ACTOR_ID,
  ORG_ID,
  slugify,
  type CanvasFile,
  type ComponentRef,
  type MapEntry,
} from '../artifacts/load.js'
import {
  createMap,
  deleteUnusedImages,
  editCanvas,
  editMap,
  retargetLinks,
  writeFrameImage,
} from '../artifacts/maps.js'
import { createQuery, deleteQuery, updateQuery } from '../artifacts/queries.js'
import {
  createDiagram,
  deleteDiagram,
  renameDiagramReferences,
  saveDiagram,
} from '../artifacts/write.js'
import { createUpload, takeUpload } from '../uploads.js'
import {
  COMPONENT_API_CONTRACT_ID,
  COMPONENT_FLOW_DIAGRAM_ID,
  COMPONENT_SUPPORT_KB_ID,
  ensureWorkspaceConfig,
  loadWorkspace,
  unregisterProject,
  WORKSPACE_CONFIG,
  type Workspace,
} from '../workspace.js'

const MAX_DEPENDENCY_DEPTH = 10

function toDiagramImage(
  projectId: string,
  diagramId: string,
  imagePath: string,
  createdAt: string,
  order: number
) {
  return {
    diagramImageId: imagePath,
    diagramId,
    orgId: ORG_ID,
    assetId: imagePath,
    imageUrl: `/files/${projectId}/${imagePath}`,
    fileName: imagePath.split('/').at(-1)!,
    order,
    createdBy: ACTOR_ID,
    createdAt,
  }
}

function notFound(kind: string, id: string): never {
  throw new GraphQLError(`${kind} ${id} not found`)
}

function findApiGroup(db: Workspace, serviceId: string, apiGroupId: string) {
  return (
    db.apiGroups.find(
      ({ group }) => group.id === apiGroupId && group.serviceId === serviceId
    ) ?? notFound('API group', apiGroupId)
  )
}

function sortItems<T extends { name: string }>(
  items: T[],
  sortBy: string | null | undefined,
  sortDir: string | null | undefined
) {
  if (sortBy === 'name') {
    const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name))
    if (sortDir === 'desc') {
      return sorted.reverse()
    }
    return sorted
  }
  if (
    sortBy === null ||
    sortBy === undefined ||
    sortBy === 'created' ||
    sortBy === 'updated'
  ) {
    return items
  }
  throw new GraphQLError(`Unsupported sort: ${sortBy}`)
}

function page<T extends { name: string }>(
  items: T[],
  args: {
    search?: string | null
    sortBy?: string | null
    sortDir?: string | null
    limit?: number | null
    offset?: number | null
  }
) {
  const search = args.search?.trim().toLowerCase() ?? ''
  const matching =
    search === ''
      ? items
      : items.filter((item) => item.name.toLowerCase().includes(search))
  const sorted = sortItems(matching, args.sortBy, args.sortDir)
  const offset = args.offset ?? 0
  const limited =
    args.limit === null || args.limit === undefined
      ? sorted.slice(offset)
      : sorted.slice(offset, offset + args.limit)
  return { items: limited, totalCount: matching.length }
}

function walkDependencies(
  db: Workspace,
  serviceId: string,
  direction: 'upstream' | 'downstream'
) {
  const { dependencies } = db
  const ownSide = direction === 'upstream' ? 'downstream' : 'upstream'
  const otherSide = direction === 'upstream' ? 'upstream' : 'downstream'
  const visited = new Set([serviceId])
  let frontier = [serviceId]
  for (
    let depth = 0;
    depth < MAX_DEPENDENCY_DEPTH && frontier.length > 0;
    depth++
  ) {
    const next: string[] = []
    for (const current of frontier) {
      for (const row of dependencies) {
        if (row.dependency === null) {
          continue
        }
        const neighbour =
          row.service.id === current && row.direction === ownSide
            ? row.dependency.id
            : row.dependency.id === current && row.direction === otherSide
              ? row.service.id
              : null
        if (neighbour !== null && !visited.has(neighbour)) {
          visited.add(neighbour)
          next.push(neighbour)
        }
      }
    }
    frontier = next
  }
  return dependencies.filter(
    (row) =>
      visited.has(row.service.id) &&
      (row.dependency === null || visited.has(row.dependency.id))
  )
}

async function findCreatedDiagram(projectRoot: string, localId: string) {
  const { workspace } = await loadWorkspace()
  const diagram = workspace.diagrams.find(
    (d) => d.project.root === projectRoot && d.localId === localId
  )
  if (diagram === undefined) {
    throw new GraphQLError(`The new diagram ${localId} could not be loaded`)
  }
  return diagram
}

function requireName(name: string | null | undefined) {
  if (name === null || name === undefined || name.trim() === '') {
    throw new GraphQLError('A name is required')
  }
  return name.trim()
}

function findServiceFile(db: Workspace, serviceId: string) {
  return (
    db.serviceFiles.find((s) => s.serviceId === serviceId) ??
    notFound('Service', serviceId)
  )
}

function findDatabase(db: Workspace, serviceId: string, id: string) {
  return (
    db.databases.find(
      (d) => d.serviceDb.serviceId === serviceId && d.serviceDb.id === id
    ) ?? notFound('Database', id)
  )
}

type SavedQueryInput = {
  title?: string | null
  description?: string | null
  queryText?: string | null
  tags?: string[] | null
}

function toQueryInput(input: SavedQueryInput) {
  const queryText = input.queryText?.trim() ?? ''
  if (queryText === '') {
    throw new GraphQLError('The query text is required')
  }
  return {
    name: requireName(input.title),
    description: input.description?.trim() ?? '',
    queryText,
    tags: input.tags ?? [],
  }
}

async function findSavedQuery(id: string) {
  const { workspace } = await loadWorkspace()
  return (
    workspace.queries.find((q) => q.savedQuery.id === id)?.savedQuery ??
    notFound('Query', id)
  )
}

const COMPONENTS = [
  {
    componentId: COMPONENT_API_CONTRACT_ID,
    name: 'API Contract',
    description: 'Link an API operation of a service',
  },
  {
    componentId: COMPONENT_FLOW_DIAGRAM_ID,
    name: 'Flow Diagram',
    description: 'Link an architecture diagram of a service',
  },
  {
    componentId: COMPONENT_SUPPORT_KB_ID,
    name: 'Documentation',
    description: 'Link a doc of a service',
  },
].map((component, order) => ({
  ...component,
  type: 'link',
  category: 'Links',
  tags: [],
  slug: component.componentId,
  previewImageJpg: '',
  isActive: true,
  order,
  componentFields: [],
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
}))

type MapRow = Workspace['maps'][number]
type FrameCanvas = NonNullable<CanvasFile[string]['frames']>[string]

type FrameInput = {
  name?: string | null
  description?: string | null
  order?: number | null
  screenshot?: string | null
  screenshotAssetId?: string | null
}

type FocalPointInput = {
  name?: string | null
  locationX?: number | null
  locationY?: number | null
  visibility?: string | null
  color?: string | null
}

type FrameGroupInput = {
  name?: string | null
  description?: string | null
  locationX?: number | null
  locationY?: number | null
  width?: number | null
  height?: number | null
}

type FrameLinkInput = {
  kind?: string | null
  targetFrameId?: string | null
  targetMapId?: string | null
  label?: string | null
  locationX?: number | null
  locationY?: number | null
}

type FocalPointMetaInput = {
  componentId?: string | null
  componentLinkDiagramId?: string | null
  componentLinkApiEndpointId?: string | null
  componentLinkTestPackId?: string | null
  componentLinkServiceDocId?: string | null
  componentModalFields?:
    | {
        componentFieldId?: string | null
        label?: string | null
        type?: string | null
        data?: unknown[] | null
      }[]
    | null
}

function findMap(db: Workspace, id: string) {
  return db.maps.find((m) => m.map.id === id) ?? notFound('Map', id)
}

function findFrame(db: Workspace, mapId: string, id: string) {
  const map = findMap(db, mapId)
  const frame =
    map.frames.find((f) => f.frame.id === id) ?? notFound('Frame', id)
  return { map, frame }
}

function findFocalPoint(
  db: Workspace,
  mapId: string,
  frameId: string,
  id: string
) {
  const { map, frame } = findFrame(db, mapId, frameId)
  const focalPoint =
    frame.focalPoints.find((p) => p.point.id === id) ??
    notFound('Focal point', id)
  return { map, frame, focalPoint }
}

function requireSlug(name: string) {
  if (slugify(name) === '') {
    throw new GraphQLError('The name must contain a letter or digit')
  }
  return name
}

function assertMapNameFree(db: Workspace, name: string, exceptId?: string) {
  const taken = db.maps.some(
    (m) => m.map.id !== exceptId && slugify(m.entry.name) === slugify(name)
  )
  if (taken) {
    throw new GraphQLError(`Another map is named "${name}"`)
  }
}

function frameIn(entry: MapEntry, name: string) {
  return entry.frames?.find((f) => f.name === name) ?? notFound('Frame', name)
}

function pointIn(frame: ReturnType<typeof frameIn>, name: string) {
  return (
    frame.focalPoints?.find((p) => p.name === name) ??
    notFound('Focal point', name)
  )
}

function editMapOf(map: MapRow, edit: (entry: MapEntry) => MapEntry | null) {
  return editMap(
    map.project.root,
    map.project.configFile,
    map.file,
    map.entry.name,
    edit
  )
}

function editFrameCanvas(
  map: MapRow,
  frameName: string,
  edit: (frameCanvas: FrameCanvas) => void
) {
  return editCanvas(map.project.root, (canvas) => {
    const mapCanvas = (canvas[map.entry.name] ??= {})
    const frames = (mapCanvas.frames ??= {})
    edit((frames[frameName] ??= {}))
  })
}

function itemAt<T>(items: T[] | undefined, id: string, kind: string) {
  const index = Number(id.slice(id.lastIndexOf('--') + 2).slice(1))
  const item = items?.[index]
  if (item === undefined) {
    notFound(kind, id)
  }
  return { items: items!, index }
}

function toCanvas(map: MapRow) {
  const positions = Object.fromEntries(
    map.frames.flatMap(({ name, frame }) => {
      const position = map.canvas.framePositions?.[name]
      return position === undefined ? [] : [[frame.id, position]]
    })
  )
  return {
    mapId: map.map.id,
    orgId: ORG_ID,
    zoom: map.canvas.zoom ?? 1,
    navigationX: map.canvas.navigationX ?? 0,
    navigationY: map.canvas.navigationY ?? 0,
    framePositions: JSON.stringify(positions),
    updatedAt: map.map.updatedAt,
  }
}

function serviceName(db: Workspace, serviceId: string) {
  return (
    db.services.find((s) => s.id === serviceId) ??
    notFound('Service', serviceId)
  ).name
}

function toLinkTarget(db: Workspace, input: FrameLinkInput) {
  if (input.kind === 'frame') {
    for (const map of db.maps) {
      const frame = map.frames.find((f) => f.frame.id === input.targetFrameId)
      if (frame !== undefined) {
        return { map: map.entry.name, frame: frame.name }
      }
    }
    return notFound('Frame', String(input.targetFrameId))
  }
  if (input.kind === 'map') {
    return { map: findMap(db, String(input.targetMapId)).entry.name }
  }
  throw new GraphQLError(`Unsupported link kind: ${input.kind}`)
}

function toModalFields(
  fields: NonNullable<FocalPointMetaInput['componentModalFields']>
) {
  return fields.map((field) => {
    if (!field.componentFieldId) {
      throw new GraphQLError('Every component field needs a componentFieldId')
    }
    return {
      componentFieldId: field.componentFieldId,
      ...(field.label ? { label: field.label } : {}),
      ...(field.type ? { type: field.type } : {}),
      ...(field.data ? { data: field.data } : {}),
    }
  })
}

function toComponentRef(
  db: Workspace,
  componentId: string,
  input: FocalPointMetaInput
): ComponentRef {
  if (input.componentLinkTestPackId) {
    throw new GraphQLError('Test packs are not available in uigraph')
  }
  const ref: ComponentRef = { componentId }
  if (input.componentLinkApiEndpointId) {
    const id = input.componentLinkApiEndpointId
    const group =
      db.apiGroups.find(({ endpoints }) =>
        endpoints.some((e) => e.id === id)
      ) ?? notFound('Endpoint', id)
    const endpoint =
      group.endpoints.find((e) => e.id === id) ?? notFound('Endpoint', id)
    if (endpoint.operationId === '') {
      throw new GraphQLError(
        `${endpoint.method} ${endpoint.path} has no operationId, so it cannot be linked`
      )
    }
    ref.serviceName = serviceName(db, group.group.serviceId)
    ref.apiGroupName = group.group.name
    ref.operationId = endpoint.operationId
  } else if (input.componentLinkDiagramId) {
    const link = db.serviceDiagrams.find(
      (l) => l.diagramId === input.componentLinkDiagramId
    )
    if (link === undefined) {
      throw new GraphQLError(
        'Only service diagrams can be linked to a focal point'
      )
    }
    ref.serviceName = serviceName(db, link.serviceId)
    ref.architectureDiagramName = link.diagram.name
  } else if (input.componentLinkServiceDocId) {
    const doc =
      db.docs.find(
        (d) => d.serviceDoc.docId === input.componentLinkServiceDocId
      ) ?? notFound('Doc', input.componentLinkServiceDocId)
    ref.serviceName = serviceName(db, doc.serviceDoc.serviceId)
    ref.docName = doc.entry.name
  } else {
    throw new GraphQLError('Choose the API operation, diagram or doc to link')
  }
  if (input.componentModalFields && input.componentModalFields.length > 0) {
    ref.modalFields = toModalFields(input.componentModalFields)
  }
  return ref
}

export function createRootValue(db: Workspace) {
  const diagrams = db.diagrams.map((d) => d.entity)
  return {
    me: () => ({
      userId: 'local-user',
      orgId: ORG_ID,
      email: '',
      name: os.userInfo().username,
      login: 'local',
      kind: 'user',
      isServerAdmin: false,
      authProvider: 'local',
      avatarUrl: null,
    }),
    myOrgs: () => [
      {
        id: ORG_ID,
        name: db.name,
        logoUrl: null,
        role: 'editor',
        active: true,
        onboardingDone: true,
      },
    ],
    features: () => ({
      github: false,
      slack: false,
      enterprise: false,
      billingUrl: null,
    }),
    teams: () => [],
    members: () => [],
    comments: () => [],
    serviceDBs: ({ serviceId }: { serviceId: string }) =>
      db.databases
        .filter((d) => d.serviceDb.serviceId === serviceId)
        .map((d) => d.serviceDb),
    serviceDB: ({ serviceId, id }: { serviceId: string; id: string }) =>
      findDatabase(db, serviceId, id).serviceDb,
    savedQueries: ({
      serviceDbId,
      scope,
    }: {
      serviceDbId: string
      scope: string
    }) =>
      scope === 'TEAM'
        ? db.queries
            .filter((q) => q.savedQuery.serviceDbId === serviceDbId)
            .map((q) => q.savedQuery)
        : [],
    createSavedQuery: async ({
      serviceId,
      serviceDbId,
      input,
    }: {
      serviceId: string
      serviceDbId: string
      input: SavedQueryInput
    }) => {
      const database = findDatabase(db, serviceId, serviceDbId)
      const id = await createQuery(
        database.project.root,
        database.project.configFile,
        serviceDbId,
        toQueryInput(input)
      )
      return findSavedQuery(id)
    },
    updateSavedQuery: async ({
      serviceId,
      serviceDbId,
      id,
      input,
    }: {
      serviceId: string
      serviceDbId: string
      id: string
      input: SavedQueryInput
    }) => {
      const database = findDatabase(db, serviceId, serviceDbId)
      const newId = await updateQuery(
        database.project.root,
        database.project.configFile,
        id,
        toQueryInput(input)
      )
      return findSavedQuery(newId)
    },
    deleteSavedQuery: async ({
      serviceId,
      serviceDbId,
      id,
    }: {
      serviceId: string
      serviceDbId: string
      id: string
    }) => {
      const database = findDatabase(db, serviceId, serviceDbId)
      await deleteQuery(database.project.root, database.project.configFile, id)
      return true
    },
    createServiceDB: async ({
      serviceId,
      input,
    }: {
      serviceId: string
      input: {
        dbName: string
        dialect?: string | null
        schemaContent?: string | null
      }
    }) => {
      const name = requireName(input.dbName)
      if (!input.schemaContent) {
        throw new GraphQLError('A schema file is required')
      }
      const link = findServiceFile(db, serviceId)
      const schemaPath = await createDatabase(
        link.project.root,
        link.project.configFile,
        link.file,
        { name, dialect: input.dialect ?? '' },
        input.schemaContent
      )
      const { workspace } = await loadWorkspace()
      return (
        workspace.databases.find(
          (d) =>
            d.project.root === link.project.root &&
            d.entry.schemaPath === schemaPath
        )?.serviceDb ?? notFound('Database', schemaPath)
      )
    },
    deleteServiceDB: async ({
      serviceId,
      id,
    }: {
      serviceId: string
      id: string
    }) => {
      const database = findDatabase(db, serviceId, id)
      await deleteDatabase(
        database.project.root,
        database.project.configFile,
        database.file,
        database.entry.name
      )
      return true
    },
    componentLinkUsages: () => [],
    maps: (args: {
      folderId?: string | null
      teamId?: string | null
      search?: string | null
      sortBy?: string | null
      sortDir?: string | null
      limit?: number | null
      offset?: number | null
    }) => {
      if (args.folderId || args.teamId) {
        return { items: [], totalCount: 0 }
      }
      return page(
        db.maps.map((m) => m.map),
        args
      )
    },
    map: ({ id }: { id: string }) => findMap(db, id).map,
    frames: (args: {
      mapId: string
      search?: string | null
      sortBy?: string | null
      sortDir?: string | null
      limit?: number | null
      offset?: number | null
    }) =>
      page(
        findMap(db, args.mapId).frames.map((f) => f.frame),
        args
      ),
    frame: ({ mapId, id }: { mapId: string; id: string }) =>
      findFrame(db, mapId, id).frame.frame,
    frameById: ({ id }: { id: string }) =>
      db.maps.flatMap((m) => m.frames).find((f) => f.frame.id === id)?.frame ??
      notFound('Frame', id),
    focalPoints: ({ mapId, frameId }: { mapId: string; frameId: string }) =>
      findFrame(db, mapId, frameId).frame.focalPoints.map((p) => p.point),
    focalPointMeta: (args: {
      mapId: string
      frameId: string
      focalPointId: string
    }) =>
      findFocalPoint(
        db,
        args.mapId,
        args.frameId,
        args.focalPointId
      ).focalPoint.components.map((c) => c.meta),
    frameGroups: ({ mapId, frameId }: { mapId: string; frameId: string }) =>
      findFrame(db, mapId, frameId).frame.groups,
    frameLinks: ({ mapId, frameId }: { mapId: string; frameId: string }) =>
      findFrame(db, mapId, frameId).frame.links.map((l) => l.link),
    canvas: ({ mapId }: { mapId: string }) => toCanvas(findMap(db, mapId)),
    createMap: async ({
      input,
    }: {
      input: {
        name: string
        description?: string | null
        serviceId?: string | null
      }
    }) => {
      const name = requireSlug(requireName(input.name))
      if (!input.serviceId) {
        throw new GraphQLError(
          'Choose the service whose repository stores this map'
        )
      }
      assertMapNameFree(db, name)
      const link = findServiceFile(db, input.serviceId)
      await createMap(link.project.root, link.project.configFile, link.file, {
        name,
        description: input.description?.trim() ?? '',
      })
      const { workspace } = await loadWorkspace()
      return (
        workspace.maps.find(
          (m) => m.project.root === link.project.root && m.entry.name === name
        )?.map ?? notFound('Map', name)
      )
    },
    updateMap: async ({
      id,
      input,
    }: {
      id: string
      input: { name?: string | null; description?: string | null }
    }) => {
      const map = findMap(db, id)
      const oldName = map.entry.name
      const name =
        input.name === null || input.name === undefined
          ? oldName
          : requireSlug(requireName(input.name))
      assertMapNameFree(db, name, id)
      await editMapOf(map, (entry) => {
        entry.name = name
        if (input.description !== null && input.description !== undefined) {
          const description = input.description.trim()
          if (description === '') {
            delete entry.description
          } else {
            entry.description = description
          }
        }
        return entry
      })
      if (name !== oldName) {
        await editCanvas(map.project.root, (canvas) => {
          if (canvas[oldName] !== undefined) {
            canvas[name] = canvas[oldName]
            delete canvas[oldName]
          }
        })
        for (const project of db.projects) {
          await retargetLinks(project.root, { map: oldName }, { map: name })
        }
      }
      const { workspace } = await loadWorkspace()
      return (
        workspace.maps.find(
          (m) => m.project.root === map.project.root && m.entry.name === name
        )?.map ?? notFound('Map', name)
      )
    },
    deleteMap: async ({ id }: { id: string }) => {
      const map = findMap(db, id)
      await editMapOf(map, () => null)
      await deleteUnusedImages(
        map.project.root,
        map.project.configFile,
        map.frames.flatMap((f) => f.frame.screenshotAssetId ?? [])
      )
      await editCanvas(map.project.root, (canvas) => {
        delete canvas[map.entry.name]
      })
      for (const project of db.projects) {
        await retargetLinks(project.root, { map: map.entry.name }, null)
      }
      return true
    },
    createFrame: async ({
      mapId,
      input,
    }: {
      mapId: string
      input: FrameInput
    }) => {
      const map = findMap(db, mapId)
      const name = requireSlug(requireName(input.name))
      if (map.frames.some((f) => slugify(f.name) === slugify(name))) {
        throw new GraphQLError(`Another frame in this map is named "${name}"`)
      }
      const imagePath = input.screenshotAssetId
        ? await writeFrameImage(
            map.project.root,
            map.entry.name,
            name,
            takeUpload(input.screenshotAssetId)
          )
        : undefined
      const description = input.description?.trim() ?? ''
      await editMapOf(map, (entry) => {
        entry.frames = [
          ...(entry.frames ?? []),
          {
            name,
            ...(description === '' ? {} : { description }),
            ...(imagePath === undefined ? {} : { imagePath }),
          },
        ]
        return entry
      })
      const { workspace } = await loadWorkspace()
      return (
        findMap(workspace, mapId).frames.find((f) => f.name === name)?.frame ??
        notFound('Frame', name)
      )
    },
    updateFrame: async ({
      mapId,
      id,
      input,
    }: {
      mapId: string
      id: string
      input: FrameInput
    }) => {
      if (input.order !== null && input.order !== undefined) {
        throw new GraphQLError('Reordering frames is not supported')
      }
      const { map, frame } = findFrame(db, mapId, id)
      const oldName = frame.name
      const name =
        input.name === null || input.name === undefined
          ? oldName
          : requireSlug(requireName(input.name))
      if (
        map.frames.some((f) => f !== frame && slugify(f.name) === slugify(name))
      ) {
        throw new GraphQLError(`Another frame in this map is named "${name}"`)
      }
      const oldImage = frame.frame.screenshotAssetId
      const imagePath = input.screenshotAssetId
        ? await writeFrameImage(
            map.project.root,
            map.entry.name,
            name,
            takeUpload(input.screenshotAssetId)
          )
        : undefined
      await editMapOf(map, (entry) => {
        const target = frameIn(entry, oldName)
        target.name = name
        if (input.description !== null && input.description !== undefined) {
          const description = input.description.trim()
          if (description === '') {
            delete target.description
          } else {
            target.description = description
          }
        }
        if (imagePath !== undefined) {
          target.imagePath = imagePath
        }
        return entry
      })
      if (imagePath !== undefined && oldImage !== null) {
        await deleteUnusedImages(map.project.root, map.project.configFile, [
          oldImage,
        ])
      }
      if (name !== oldName) {
        await editCanvas(map.project.root, (canvas) => {
          const mapCanvas = canvas[map.entry.name]
          for (const record of [mapCanvas?.framePositions, mapCanvas?.frames]) {
            if (record?.[oldName] !== undefined) {
              record[name] = record[oldName] as never
              delete record[oldName]
            }
          }
        })
        for (const project of db.projects) {
          await retargetLinks(
            project.root,
            { map: map.entry.name, frame: oldName },
            { map: map.entry.name, frame: name }
          )
        }
      }
      const { workspace } = await loadWorkspace()
      return (
        findMap(workspace, mapId).frames.find((f) => f.name === name)?.frame ??
        notFound('Frame', name)
      )
    },
    deleteFrame: async ({ mapId, id }: { mapId: string; id: string }) => {
      const { map, frame } = findFrame(db, mapId, id)
      await editMapOf(map, (entry) => {
        entry.frames = entry.frames?.filter((f) => f.name !== frame.name)
        return entry
      })
      if (frame.frame.screenshotAssetId !== null) {
        await deleteUnusedImages(map.project.root, map.project.configFile, [
          frame.frame.screenshotAssetId,
        ])
      }
      await editCanvas(map.project.root, (canvas) => {
        delete canvas[map.entry.name]?.framePositions?.[frame.name]
        delete canvas[map.entry.name]?.frames?.[frame.name]
      })
      for (const project of db.projects) {
        await retargetLinks(
          project.root,
          { map: map.entry.name, frame: frame.name },
          null
        )
      }
      return true
    },
    createFocalPoint: async ({
      mapId,
      frameId,
      input,
    }: {
      mapId: string
      frameId: string
      input: FocalPointInput
    }) => {
      const { map, frame } = findFrame(db, mapId, frameId)
      const name = requireName(input.name)
      if (input.locationX === null || input.locationX === undefined) {
        throw new GraphQLError('A focal point needs a location')
      }
      if (input.locationY === null || input.locationY === undefined) {
        throw new GraphQLError('A focal point needs a location')
      }
      const x = input.locationX
      const y = input.locationY
      await editMapOf(map, (entry) => {
        const target = frameIn(entry, frame.name)
        if (target.focalPoints?.some((p) => p.name === name)) {
          throw new GraphQLError(`Another focal point is named "${name}"`)
        }
        target.focalPoints = [
          ...(target.focalPoints ?? []),
          {
            name,
            x,
            y,
            visibility: input.visibility ?? 'public',
            ...(input.color ? { color: input.color } : {}),
          },
        ]
        return entry
      })
      const { workspace } = await loadWorkspace()
      return (
        findFrame(workspace, mapId, frameId).frame.focalPoints.find(
          (p) => p.point.name === name
        )?.point ?? notFound('Focal point', name)
      )
    },
    updateFocalPoint: async ({
      mapId,
      frameId,
      id,
      input,
    }: {
      mapId: string
      frameId: string
      id: string
      input: FocalPointInput
    }) => {
      const { map, frame, focalPoint } = findFocalPoint(db, mapId, frameId, id)
      const oldName = focalPoint.point.name
      const name =
        input.name === null || input.name === undefined
          ? oldName
          : requireName(input.name)
      await editMapOf(map, (entry) => {
        const target = frameIn(entry, frame.name)
        if (
          name !== oldName &&
          target.focalPoints?.some((p) => p.name === name)
        ) {
          throw new GraphQLError(`Another focal point is named "${name}"`)
        }
        const point = pointIn(target, oldName)
        point.name = name
        if (input.locationX !== null && input.locationX !== undefined) {
          point.x = input.locationX
        }
        if (input.locationY !== null && input.locationY !== undefined) {
          point.y = input.locationY
        }
        if (input.visibility) {
          point.visibility = input.visibility
        }
        if (input.color) {
          point.color = input.color
        }
        return entry
      })
      const { workspace } = await loadWorkspace()
      return findFocalPoint(workspace, mapId, frameId, id).focalPoint.point
    },
    deleteFocalPoint: async ({
      mapId,
      frameId,
      id,
    }: {
      mapId: string
      frameId: string
      id: string
    }) => {
      const { map, frame, focalPoint } = findFocalPoint(db, mapId, frameId, id)
      await editMapOf(map, (entry) => {
        const target = frameIn(entry, frame.name)
        target.focalPoints = target.focalPoints?.filter(
          (p) => p.name !== focalPoint.point.name
        )
        return entry
      })
      return true
    },
    upsertCanvas: async ({
      mapId,
      input,
    }: {
      mapId: string
      input: {
        zoom?: number | null
        navigationX?: number | null
        navigationY?: number | null
        framePositions?: string | null
      }
    }) => {
      const map = findMap(db, mapId)
      const positions =
        input.framePositions === null || input.framePositions === undefined
          ? undefined
          : Object.fromEntries(
              Object.entries(
                JSON.parse(input.framePositions) as Record<
                  string,
                  { x: number; y: number }
                >
              ).map(([frameId, position]) => [
                (
                  map.frames.find((f) => f.frame.id === frameId) ??
                  notFound('Frame', frameId)
                ).name,
                { x: position.x, y: position.y },
              ])
            )
      await editCanvas(map.project.root, (canvas) => {
        const mapCanvas = (canvas[map.entry.name] ??= {})
        if (input.zoom !== null && input.zoom !== undefined) {
          mapCanvas.zoom = input.zoom
        }
        if (input.navigationX !== null && input.navigationX !== undefined) {
          mapCanvas.navigationX = input.navigationX
        }
        if (input.navigationY !== null && input.navigationY !== undefined) {
          mapCanvas.navigationY = input.navigationY
        }
        if (positions !== undefined) {
          mapCanvas.framePositions = positions
        }
      })
      const { workspace } = await loadWorkspace()
      return toCanvas(findMap(workspace, mapId))
    },
    createFrameGroup: async ({
      mapId,
      frameId,
      input,
    }: {
      mapId: string
      frameId: string
      input: FrameGroupInput
    }) => {
      const { map, frame } = findFrame(db, mapId, frameId)
      const name = requireName(input.name)
      await editFrameCanvas(map, frame.name, (frameCanvas) => {
        frameCanvas.groups = [
          ...(frameCanvas.groups ?? []),
          {
            name,
            description: input.description?.trim() ?? '',
            x: input.locationX ?? 0,
            y: input.locationY ?? 0,
            width: input.width ?? 0,
            height: input.height ?? 0,
          },
        ]
      })
      const { workspace } = await loadWorkspace()
      return findFrame(workspace, mapId, frameId).frame.groups.at(-1)
    },
    updateFrameGroup: async ({
      mapId,
      frameId,
      id,
      input,
    }: {
      mapId: string
      frameId: string
      id: string
      input: FrameGroupInput
    }) => {
      const { map, frame } = findFrame(db, mapId, frameId)
      await editFrameCanvas(map, frame.name, (frameCanvas) => {
        const { items, index } = itemAt(frameCanvas.groups, id, 'Frame group')
        const group = items[index]!
        items[index] = {
          name:
            input.name === null || input.name === undefined
              ? group.name
              : requireName(input.name),
          description: input.description?.trim() ?? group.description,
          x: input.locationX ?? group.x,
          y: input.locationY ?? group.y,
          width: input.width ?? group.width,
          height: input.height ?? group.height,
        }
      })
      const { workspace } = await loadWorkspace()
      return (
        findFrame(workspace, mapId, frameId).frame.groups.find(
          (g) => g.id === id
        ) ?? notFound('Frame group', id)
      )
    },
    deleteFrameGroup: async ({
      mapId,
      frameId,
      id,
    }: {
      mapId: string
      frameId: string
      id: string
    }) => {
      const { map, frame } = findFrame(db, mapId, frameId)
      await editFrameCanvas(map, frame.name, (frameCanvas) => {
        const { items, index } = itemAt(frameCanvas.groups, id, 'Frame group')
        items.splice(index, 1)
      })
      return true
    },
    createFrameLink: async ({
      mapId,
      frameId,
      input,
    }: {
      mapId: string
      frameId: string
      input: FrameLinkInput
    }) => {
      const { map, frame } = findFrame(db, mapId, frameId)
      const target = toLinkTarget(db, input)
      await editFrameCanvas(map, frame.name, (frameCanvas) => {
        frameCanvas.links = [
          ...(frameCanvas.links ?? []),
          {
            kind: input.kind === 'frame' ? 'frame' : 'map',
            ...target,
            label: input.label ?? '',
            x: input.locationX ?? 0,
            y: input.locationY ?? 0,
          },
        ]
      })
      const { workspace } = await loadWorkspace()
      return findFrame(workspace, mapId, frameId).frame.links.at(-1)?.link
    },
    updateFrameLink: async ({
      mapId,
      frameId,
      id,
      input,
    }: {
      mapId: string
      frameId: string
      id: string
      input: FrameLinkInput
    }) => {
      const { map, frame } = findFrame(db, mapId, frameId)
      const target =
        input.kind === null || input.kind === undefined
          ? undefined
          : toLinkTarget(db, input)
      await editFrameCanvas(map, frame.name, (frameCanvas) => {
        const { items, index } = itemAt(frameCanvas.links, id, 'Frame link')
        const link = items[index]!
        items[index] = {
          kind:
            target === undefined
              ? link.kind
              : input.kind === 'frame'
                ? 'frame'
                : 'map',
          ...(target === undefined
            ? { map: link.map, frame: link.frame }
            : target),
          label: input.label ?? link.label,
          x: input.locationX ?? link.x,
          y: input.locationY ?? link.y,
        }
      })
      const { workspace } = await loadWorkspace()
      return (
        findFrame(workspace, mapId, frameId).frame.links.find(
          (l) => l.link.id === id
        )?.link ?? notFound('Frame link', id)
      )
    },
    deleteFrameLink: async ({
      mapId,
      frameId,
      id,
    }: {
      mapId: string
      frameId: string
      id: string
    }) => {
      const { map, frame } = findFrame(db, mapId, frameId)
      await editFrameCanvas(map, frame.name, (frameCanvas) => {
        const { items, index } = itemAt(frameCanvas.links, id, 'Frame link')
        items.splice(index, 1)
      })
      return true
    },
    createFocalPointMeta: async ({
      mapId,
      frameId,
      focalPointId,
      input,
    }: {
      mapId: string
      frameId: string
      focalPointId: string
      input: FocalPointMetaInput
    }) => {
      const { map, frame, focalPoint } = findFocalPoint(
        db,
        mapId,
        frameId,
        focalPointId
      )
      const ref = toComponentRef(db, requireName(input.componentId), input)
      await editMapOf(map, (entry) => {
        const point = pointIn(frameIn(entry, frame.name), focalPoint.point.name)
        point.components = [...(point.components ?? []), ref]
        return entry
      })
      const { workspace } = await loadWorkspace()
      return findFocalPoint(
        workspace,
        mapId,
        frameId,
        focalPointId
      ).focalPoint.components.at(-1)?.meta
    },
    updateFocalPointMeta: async ({
      mapId,
      frameId,
      focalPointId,
      id,
      input,
    }: {
      mapId: string
      frameId: string
      focalPointId: string
      id: string
      input: FocalPointMetaInput
    }) => {
      if (
        input.componentLinkDiagramId ||
        input.componentLinkApiEndpointId ||
        input.componentLinkTestPackId ||
        input.componentLinkServiceDocId
      ) {
        throw new GraphQLError('Only the fields of a component can be updated')
      }
      const { map, frame, focalPoint } = findFocalPoint(
        db,
        mapId,
        frameId,
        focalPointId
      )
      await editMapOf(map, (entry) => {
        const point = pointIn(frameIn(entry, frame.name), focalPoint.point.name)
        const { items, index } = itemAt(point.components, id, 'Component')
        const component = items[index]!
        if (input.componentId && input.componentId !== component.componentId) {
          throw new GraphQLError('The component of a link cannot be changed')
        }
        if (
          input.componentModalFields === null ||
          input.componentModalFields === undefined ||
          input.componentModalFields.length === 0
        ) {
          delete component.modalFields
        } else {
          component.modalFields = toModalFields(input.componentModalFields)
        }
        return entry
      })
      const { workspace } = await loadWorkspace()
      return (
        findFocalPoint(
          workspace,
          mapId,
          frameId,
          focalPointId
        ).focalPoint.components.find((c) => c.meta.id === id)?.meta ??
        notFound('Component', id)
      )
    },
    deleteFocalPointMeta: async ({
      mapId,
      frameId,
      focalPointId,
      id,
    }: {
      mapId: string
      frameId: string
      focalPointId: string
      id: string
    }) => {
      const { map, frame, focalPoint } = findFocalPoint(
        db,
        mapId,
        frameId,
        focalPointId
      )
      await editMapOf(map, (entry) => {
        const point = pointIn(frameIn(entry, frame.name), focalPoint.point.name)
        const { items, index } = itemAt(point.components, id, 'Component')
        items.splice(index, 1)
        if (items.length === 0) {
          delete point.components
        }
        return entry
      })
      return true
    },
    serviceGitHubRepository: () => null,
    githubApp: () => null,
    diagramImages: async ({ diagramId }: { diagramId: string }) => {
      const diagram =
        db.diagrams.find((d) => d.entity.id === diagramId) ??
        notFound('Diagram', diagramId)
      const images = await listDiagramImages(
        diagram.project.root,
        diagram.entry.path
      )
      return images.map(({ imagePath, createdAt }, order) =>
        toDiagramImage(
          diagram.project.id,
          diagramId,
          imagePath,
          createdAt,
          order
        )
      )
    },
    diagramVersions: () => [],
    diagramVersionContent: ({ versionId }: { versionId: string }) =>
      notFound('Diagram version', versionId),
    components: () => ({ components: COMPONENTS, customComponents: [] }),
    services: (args: {
      folderId?: string | null
      teamId?: string | null
      search?: string | null
      sortBy?: string | null
      sortDir?: string | null
      limit?: number | null
      offset?: number | null
    }) => {
      if (args.folderId || args.teamId) {
        return { items: [], totalCount: 0 }
      }
      return page(db.services, args)
    },
    service: ({ id }: { id: string }) =>
      db.services.find((s) => s.id === id) ?? notFound('Service', id),
    apiGroups: ({ serviceId }: { serviceId: string }) =>
      db.apiGroups
        .filter(({ group }) => group.serviceId === serviceId)
        .map(({ group }) => group),
    apiGroup: ({ serviceId, id }: { serviceId: string; id: string }) =>
      findApiGroup(db, serviceId, id).group,
    apiGroupVersions: (args: { serviceId: string; apiGroupId: string }) => [
      findApiGroup(db, args.serviceId, args.apiGroupId).version,
    ],
    apiEndpoints: (args: { serviceId: string; apiGroupId: string }) =>
      findApiGroup(db, args.serviceId, args.apiGroupId).endpoints,
    apiEndpointById: ({ id }: { id: string }) =>
      db.apiGroups
        .flatMap(({ endpoints }) => endpoints)
        .find((e) => e.id === id) ?? notFound('Endpoint', id),
    apiGroupSpec: (args: { serviceId: string; apiGroupId: string }) => {
      const { group, spec } = findApiGroup(db, args.serviceId, args.apiGroupId)
      if (spec === null) {
        throw new GraphQLError(`${group.name} has no spec file`)
      }
      return { apiGroupId: group.id, ...spec }
    },
    dependencies: (args: {
      serviceId: string
      direction?: string | null
      criticality?: string | null
    }) =>
      db.dependencies.filter(
        (row) =>
          row.service.id === args.serviceId &&
          (!args.direction ||
            args.direction === 'all' ||
            row.direction === args.direction) &&
          (!args.criticality || row.criticality === args.criticality)
      ),
    dependencyGraph: () => db.dependencies,
    serviceDependencyGraph: ({ serviceId }: { serviceId: string }) => {
      const seen = new Set<string>()
      return [
        ...walkDependencies(db, serviceId, 'upstream'),
        ...walkDependencies(db, serviceId, 'downstream'),
      ].filter((row) => {
        if (seen.has(row.id)) {
          return false
        }
        seen.add(row.id)
        return true
      })
    },
    diagrams: (args: {
      folderId?: string | null
      teamId?: string | null
      serviceId?: string | null
      search?: string | null
      sortBy?: string | null
      sortDir?: string | null
      limit?: number | null
      offset?: number | null
    }) => {
      if (args.folderId || args.teamId) {
        return { items: [], totalCount: 0 }
      }
      const { serviceDiagrams } = db
      const items = args.serviceId
        ? serviceDiagrams
            .filter((link) => link.serviceId === args.serviceId)
            .map((link) => link.diagram)
        : diagrams
      return page(items, args)
    },
    diagram: ({ id }: { id: string }) =>
      diagrams.find((d) => d.id === id) ??
      db.databases.find((d) => d.diagram.id === id)?.diagram ??
      notFound('Diagram', id),
    serviceDocs: ({ serviceId }: { serviceId: string }) =>
      db.docs
        .filter((d) => d.serviceDoc.serviceId === serviceId)
        .map((d) => d.serviceDoc),
    serviceDocById: ({ id }: { id: string }) =>
      db.docs.find((d) => d.serviceDoc.docId === id)?.serviceDoc ??
      notFound('Doc', id),
    doc: ({ id }: { id: string }) =>
      db.docs.find((d) => d.serviceDoc.docId === id)?.serviceDoc.doc ??
      db.standaloneDocs.find((d) => d.doc.id === id)?.doc ??
      notFound('Doc', id),
    docs: (args: {
      folderId?: string | null
      teamId?: string | null
      search?: string | null
      sortBy?: string | null
      sortDir?: string | null
      limit?: number | null
      offset?: number | null
    }) => {
      if (args.folderId || args.teamId) {
        return { items: [], totalCount: 0 }
      }
      const items = [
        ...db.docs.map((d) => d.serviceDoc.doc),
        ...db.standaloneDocs.map((d) => d.doc),
      ].map((doc) => ({ ...doc, name: doc.fileName }))
      return page(items, args)
    },
    createDoc: async ({
      input,
    }: {
      input: {
        fileName: string
        fileType?: string | null
        description?: string | null
        fileAssetId?: string | null
      }
    }) => {
      const name = requireName(input.fileName)
      if (!input.fileAssetId) {
        throw new GraphQLError('Upload a file first')
      }
      await ensureWorkspaceConfig(db.home)
      const docPath = await createDoc(
        db.home,
        WORKSPACE_CONFIG,
        WORKSPACE_CONFIG,
        {
          name,
          fileType: input.fileType ?? '',
          description: input.description?.trim() ?? '',
        },
        takeUpload(input.fileAssetId).data
      )
      const { workspace } = await loadWorkspace()
      return (
        workspace.standaloneDocs.find(
          (d) => d.project.root === db.home && d.entry.path === docPath
        )?.doc ?? notFound('Doc', docPath)
      )
    },
    deleteDoc: async ({ id }: { id: string }) => {
      const doc =
        db.docs.find((d) => d.serviceDoc.docId === id) ??
        db.standaloneDocs.find((d) => d.doc.id === id) ??
        notFound('Doc', id)
      await deleteDoc(
        doc.project.root,
        doc.project.configFile,
        doc.file,
        doc.entry.name
      )
      return true
    },
    createAssetUpload: () => createUpload(),
    createDiagramImage: async ({
      diagramId,
      input,
    }: {
      diagramId: string
      input: { assetId: string; fileName?: string | null }
    }) => {
      const diagram =
        db.diagrams.find((d) => d.entity.id === diagramId) ??
        notFound('Diagram', diagramId)
      const imagePath = await writeDiagramImage(
        diagram.project.root,
        diagram.entry.path,
        requireName(input.fileName),
        takeUpload(input.assetId)
      )
      const images = await listDiagramImages(
        diagram.project.root,
        diagram.entry.path
      )
      const order = images.findIndex((image) => image.imagePath === imagePath)
      return toDiagramImage(
        diagram.project.id,
        diagramId,
        imagePath,
        images[order]!.createdAt,
        order
      )
    },
    createServiceDoc: async ({
      serviceId,
      input,
    }: {
      serviceId: string
      input: {
        fileName?: string | null
        fileType?: string | null
        description?: string | null
        fileAssetId?: string | null
      }
    }) => {
      const name = requireName(input.fileName)
      if (!input.fileAssetId) {
        throw new GraphQLError('Upload a file first')
      }
      const link = findServiceFile(db, serviceId)
      const docPath = await createDoc(
        link.project.root,
        link.project.configFile,
        link.file,
        {
          name,
          fileType: input.fileType ?? '',
          description: input.description?.trim() ?? '',
        },
        takeUpload(input.fileAssetId).data
      )
      const { workspace } = await loadWorkspace()
      return (
        workspace.docs.find(
          (d) =>
            d.project.root === link.project.root && d.entry.path === docPath
        )?.serviceDoc ?? notFound('Doc', docPath)
      )
    },
    deleteServiceDoc: async ({
      serviceId,
      docId,
    }: {
      serviceId: string
      docId: string
    }) => {
      const doc =
        db.docs.find(
          (d) =>
            d.serviceDoc.serviceId === serviceId && d.serviceDoc.docId === docId
        ) ?? notFound('Doc', docId)
      await deleteDoc(
        doc.project.root,
        doc.project.configFile,
        doc.file,
        doc.entry.name
      )
      return true
    },
    serviceDiagrams: ({ serviceId }: { serviceId: string }) =>
      db.serviceDiagrams.filter((link) => link.serviceId === serviceId),
    updateDiagram: async ({
      id,
      input,
    }: {
      id: string
      input: { name?: string | null; content?: string | null }
    }) => {
      const diagram =
        db.diagrams.find((d) => d.entity.id === id) ?? notFound('Diagram', id)
      const saved = await saveDiagram(
        diagram.project.root,
        diagram.project.configFile,
        diagram.localId,
        input
      )
      const link = db.serviceDiagrams.find((l) => l.diagramId === id)
      const service = db.services.find((s) => s.id === link?.serviceId)
      const oldName = diagram.entry.name
      const newName = saved.name
      if (service !== undefined && newName !== oldName) {
        for (const project of db.projects) {
          await renameDiagramReferences(
            project.root,
            project.configFiles,
            service.name,
            oldName,
            newName
          )
        }
      }
      return { ...saved, id }
    },
    createDiagram: async ({ input }: { input: { name: string } }) => {
      const name = requireName(input.name)
      await ensureWorkspaceConfig(db.home)
      const localId = await createDiagram(
        db.home,
        WORKSPACE_CONFIG,
        WORKSPACE_CONFIG,
        name
      )
      return (await findCreatedDiagram(db.home, localId)).entity
    },
    createServiceDiagram: async ({
      serviceId,
      input,
    }: {
      serviceId: string
      input: { name?: string | null }
    }) => {
      const name = requireName(input.name)
      const link = findServiceFile(db, serviceId)
      const localId = await createDiagram(
        link.project.root,
        link.project.configFile,
        link.file,
        name
      )
      const diagram = await findCreatedDiagram(link.project.root, localId)
      return {
        serviceId,
        diagramId: diagram.entity.id,
        orgId: ORG_ID,
        createdBy: diagram.entity.createdBy,
        updatedBy: null,
        createdAt: diagram.entity.createdAt,
        updatedAt: diagram.entity.updatedAt,
        diagram: diagram.entity,
      }
    },
    deleteDiagram: async ({ id }: { id: string }) => {
      const diagram =
        db.diagrams.find((d) => d.entity.id === id) ?? notFound('Diagram', id)
      await deleteDiagram(
        diagram.project.root,
        diagram.project.configFile,
        diagram.localId
      )
      return true
    },
    deleteService: async ({ id }: { id: string }) => {
      const link = findServiceFile(db, id)
      if (link.project.configFile === WORKSPACE_CONFIG) {
        throw new GraphQLError(
          `Services defined in ${WORKSPACE_CONFIG} cannot be removed`
        )
      }
      await unregisterProject(link.project.root)
      return true
    },
  }
}
