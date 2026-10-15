import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { parse as parseYaml, stringify } from 'yaml'
import { z } from 'zod'
import { listDiagramImages } from './artifacts/diagram-images.js'
import {
  loadArtifacts,
  ROOT_CONFIG,
  slugify,
  toDependencyService,
  type ArtifactDb,
} from './artifacts/load.js'
import { writeArtifactFile } from './artifacts/write.js'

export const WORKSPACE_CONFIG = '.uigraph/workspace.yaml'
export const COMPONENT_API_CONTRACT_ID = 'component_api-contract'
export const COMPONENT_FLOW_DIAGRAM_ID = 'component_backend-flow-diagram'
export const COMPONENT_SUPPORT_KB_ID = 'component_support-kb-troubleshooting'
const REGISTRY = '.uigraph/registry.yaml'
const PREFERENCES = '.uigraph/preferences.yaml'
const WORKSPACE_ID = 'workspace'

const registrySchema = z.object({ projects: z.array(z.string().min(1)) })
const preferencesSchema = z.object({
  agentGuidance: z.object({ declined: z.array(z.string().min(1)) }),
})

type Project = { id: string; root: string; configFile: string }

export function homeRoot() {
  return fs.realpath(os.homedir())
}

async function readOptional(file: string) {
  return fs.readFile(file, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      return null
    }
    throw error
  })
}

async function readRegistry(home: string) {
  const text = await readOptional(path.join(home, REGISTRY))
  if (text === null) {
    return []
  }
  return registrySchema.parse(parseYaml(text)).projects
}

export async function registerProject(root: string) {
  const home = await homeRoot()
  const projects = await readRegistry(home)
  if (projects.includes(root)) {
    return
  }
  await writeArtifactFile(
    home,
    REGISTRY,
    stringify({ projects: [...projects, root] })
  )
}

export async function unregisterProject(root: string) {
  const home = await homeRoot()
  const projects = await readRegistry(home)
  if (!projects.includes(root)) {
    throw new Error(`${root} is not registered`)
  }
  await writeArtifactFile(
    home,
    REGISTRY,
    stringify({ projects: projects.filter((project) => project !== root) })
  )
}

async function readDeclinedGuidance(home: string) {
  const text = await readOptional(path.join(home, PREFERENCES))
  if (text === null) {
    return []
  }
  return preferencesSchema.parse(parseYaml(text)).agentGuidance.declined
}

export async function isGuidanceDeclined(root: string) {
  return (await readDeclinedGuidance(await homeRoot())).includes(root)
}

export async function setGuidanceDeclined(root: string, declined: boolean) {
  const home = await homeRoot()
  const others = (await readDeclinedGuidance(home)).filter(
    (project) => project !== root
  )
  await writeArtifactFile(
    home,
    PREFERENCES,
    stringify({
      agentGuidance: { declined: declined ? [...others, root] : others },
    })
  )
}

export type SyncResult =
  { synced: true; services: number } | { synced: false; reason: string }

export async function syncProject(root: string): Promise<SyncResult> {
  await registerProject(root)
  const { skipped, workspace } = await loadWorkspace()
  const problem = skipped.find((entry) => entry.root === root)
  if (problem !== undefined) {
    return { synced: false, reason: problem.reason }
  }
  const project = workspace.projects.find((entry) => entry.root === root)
  if (project === undefined) {
    return { synced: false, reason: 'is not part of the workspace' }
  }
  return { synced: true, services: workspace.services.length }
}

export async function listRegisteredProjects() {
  const home = await homeRoot()
  const { skipped, workspace } = await loadWorkspace()
  return (await readRegistry(home)).map((root) => ({
    root,
    problem: skipped.find((entry) => entry.root === root)?.reason ?? null,
    services: workspace.services
      .filter((service) =>
        workspace.projects
          .find((project) => project.root === root)
          ?.serviceIds.includes(service.id)
      )
      .map((service) => ({ id: service.id, name: service.name })),
  }))
}

export async function ensureWorkspaceConfig(home: string) {
  if ((await readOptional(path.join(home, WORKSPACE_CONFIG))) === null) {
    await writeArtifactFile(home, WORKSPACE_CONFIG, 'version: 1\n')
  }
}

function dropServices(db: ArtifactDb, ids: ReadonlySet<string>) {
  db.services = db.services.filter((service) => !ids.has(service.id))
  db.serviceFiles = db.serviceFiles.filter((link) => !ids.has(link.serviceId))
  db.apiGroups = db.apiGroups.filter(({ group }) => !ids.has(group.serviceId))
  db.serviceDiagrams = db.serviceDiagrams.filter(
    (link) => !ids.has(link.serviceId)
  )
  db.docs = db.docs.filter(({ serviceDoc }) => !ids.has(serviceDoc.serviceId))
  const droppedDatabases = new Set(
    db.databases
      .filter(({ serviceDb }) => ids.has(serviceDb.serviceId))
      .map(({ serviceDb }) => serviceDb.id)
  )
  db.databases = db.databases.filter(
    ({ serviceDb }) => !droppedDatabases.has(serviceDb.id)
  )
  db.queries = db.queries.filter(
    ({ savedQuery }) => !droppedDatabases.has(savedQuery.serviceDbId)
  )
  db.dependencies = db.dependencies.filter(
    (dependency) => !ids.has(dependency.service.id)
  )
}

export async function loadWorkspace() {
  const home = await homeRoot()
  const warnings: string[] = []
  const skipped: { root: string; reason: string }[] = []
  function skip(root: string, reason: string) {
    skipped.push({ root, reason })
    warnings.push(`${root} ${reason}`)
  }
  const projects: Project[] = []
  if ((await readOptional(path.join(home, WORKSPACE_CONFIG))) !== null) {
    projects.push({
      id: WORKSPACE_ID,
      root: home,
      configFile: WORKSPACE_CONFIG,
    })
  }
  const ids = new Set(projects.map((p) => p.id))
  for (const root of await readRegistry(home)) {
    const base = slugify(path.basename(root))
    let id = base
    for (let suffix = 2; ids.has(id); suffix++) {
      id = `${base}-${suffix}`
    }
    ids.add(id)
    if ((await readOptional(path.join(root, ROOT_CONFIG))) === null) {
      skip(root, `has no ${ROOT_CONFIG} and was skipped`)
      continue
    }
    projects.push({ id, root, configFile: ROOT_CONFIG })
  }

  const loaded: (Project & { configFiles: string[]; serviceIds: string[] })[] =
    []
  const services: ArtifactDb['services'] = []
  const serviceFiles: { serviceId: string; project: Project; file: string }[] =
    []
  const apiGroups: ArtifactDb['apiGroups'] = []
  const diagrams: (ArtifactDb['diagrams'][number] & {
    project: Project
    localId: string
  })[] = []
  const serviceDiagrams: ArtifactDb['serviceDiagrams'] = []
  const docs: (ArtifactDb['docs'][number] & { project: Project })[] = []
  const standaloneDocs: (ArtifactDb['standaloneDocs'][number] & {
    project: Project
  })[] = []
  const databases: (ArtifactDb['databases'][number] & { project: Project })[] =
    []
  const queries: (ArtifactDb['queries'][number] & { project: Project })[] = []
  const maps: (ArtifactDb['maps'][number] & { project: Project })[] = []
  const files = new Map<string, { root: string; path: string }>()
  const dependencies: ArtifactDb['dependencies'] = []

  const candidates: { project: Project; db: ArtifactDb }[] = []
  for (const project of projects) {
    const { db, errors } = await loadArtifacts(project.root, project.configFile)
    if (errors.length > 0) {
      skip(
        project.root,
        `has invalid artifacts and was skipped:\n${errors.map((error) => `  • ${error}`).join('\n')}`
      )
      continue
    }
    candidates.push({ project, db })
  }

  const owners = new Map<string, { root: string; primary: boolean }>()
  for (const { project, db } of candidates) {
    for (const service of db.services) {
      const primary =
        db.serviceFiles.find((link) => link.serviceId === service.id)?.file ===
        project.configFile
      const current = owners.get(service.id)
      if (current === undefined || (primary && !current.primary)) {
        owners.set(service.id, { root: project.root, primary })
      }
    }
  }

  for (const { project, db } of candidates) {
    const conflict = db.services.find((service) => {
      const owner = owners.get(service.id)
      const primary =
        db.serviceFiles.find((link) => link.serviceId === service.id)?.file ===
        project.configFile
      return primary && owner?.root !== project.root
    })
    if (conflict !== undefined) {
      skip(
        project.root,
        `was skipped because the service "${conflict.name}" is already defined by ${owners.get(conflict.id)?.root ?? 'another project'}. A service can only be defined in one repository.`
      )
      continue
    }
    const droppedIds = new Set(
      db.services
        .filter((service) => owners.get(service.id)?.root !== project.root)
        .map((service) => service.id)
    )
    if (droppedIds.size > 0) {
      dropServices(db, droppedIds)
    }
    loaded.push({
      ...project,
      configFiles: db.configFiles,
      serviceIds: db.services.map((service) => service.id),
    })
    services.push(...db.services)
    serviceFiles.push(...db.serviceFiles.map((link) => ({ ...link, project })))
    apiGroups.push(...db.apiGroups)
    for (const diagram of db.diagrams) {
      const localId = diagram.entity.id
      diagram.entity.id = `${project.id}--${localId}`
      diagrams.push({ ...diagram, project, localId })
      for (const { imagePath } of await listDiagramImages(
        project.root,
        diagram.entry.path
      )) {
        files.set(`/files/${project.id}/${imagePath}`, {
          root: project.root,
          path: imagePath,
        })
      }
    }
    serviceDiagrams.push(
      ...db.serviceDiagrams.map((link) => ({
        ...link,
        diagramId: link.diagram.id,
      }))
    )
    for (const doc of db.docs) {
      const url = `/files/${project.id}/${doc.entry.path}`
      doc.serviceDoc.doc.fileUrl = url
      files.set(url, { root: project.root, path: doc.entry.path })
      docs.push({ ...doc, project })
    }
    for (const doc of db.standaloneDocs) {
      const url = `/files/${project.id}/${doc.entry.path}`
      doc.doc.id = `${project.id}--${doc.doc.id}`
      doc.doc.fileUrl = url
      files.set(url, { root: project.root, path: doc.entry.path })
      standaloneDocs.push({ ...doc, project })
    }
    for (const database of db.databases) {
      database.diagram.id = `${project.id}--${database.diagram.id}`
      database.serviceDb.dbDiagramId = database.diagram.id
      databases.push({ ...database, project })
    }
    queries.push(...db.queries.map((query) => ({ ...query, project })))
    for (const map of db.maps) {
      const prefix = `${project.id}--`
      map.map.id = prefix + map.map.id
      for (const { frame, focalPoints, groups, links } of map.frames) {
        frame.id = prefix + frame.id
        frame.mapId = map.map.id
        if (frame.screenshotAssetId !== null) {
          const url = `/files/${project.id}/${frame.screenshotAssetId}`
          files.set(url, { root: project.root, path: frame.screenshotAssetId })
          frame.screenshotImageUrl = `${url}?v=${frame.screenshotContentHash}`
        }
        for (const { point, components } of focalPoints) {
          point.id = prefix + point.id
          point.frameId = frame.id
          for (const { meta } of components) {
            meta.id = prefix + meta.id
            meta.focalPointId = point.id
            meta.frameId = frame.id
          }
        }
        for (const group of groups) {
          group.id = prefix + group.id
          group.frameId = frame.id
        }
        for (const { link } of links) {
          link.id = prefix + link.id
          link.frameId = frame.id
        }
      }
      map.map.previewImgUrls = map.frames
        .flatMap(({ frame }) => frame.screenshotImageUrl ?? [])
        .slice(0, 4)
      maps.push({ ...map, project })
    }
    dependencies.push(...db.dependencies)
  }

  for (const dependency of dependencies) {
    const target = services.find(
      (s) => s.id === slugify(dependency.dependencyName)
    )
    dependency.dependency =
      target === undefined ? null : toDependencyService(target)
  }

  for (const map of maps) {
    for (const { links, focalPoints } of map.frames) {
      for (const { target, link } of links) {
        const targetMap = maps.find((m) => m.map.name === target.map)
        link.targetMapId = targetMap?.map.id ?? null
        link.targetFrameId =
          target.frame === undefined
            ? null
            : (targetMap?.frames.find((f) => f.name === target.frame)?.frame
                .id ?? null)
      }
      for (const { components } of focalPoints) {
        for (const { ref, meta } of components) {
          const service = services.find((s) => s.name === ref.serviceName)
          if (service === undefined) {
            continue
          }
          if (ref.componentId === COMPONENT_API_CONTRACT_ID) {
            meta.componentLinkApiEndpointId =
              apiGroups
                .find(
                  ({ group }) =>
                    group.serviceId === service.id &&
                    group.name === ref.apiGroupName
                )
                ?.endpoints.find(
                  (endpoint) => endpoint.operationId === ref.operationId
                )?.id ?? null
          } else if (ref.componentId === COMPONENT_FLOW_DIAGRAM_ID) {
            meta.componentLinkDiagramId =
              serviceDiagrams.find(
                (link) =>
                  link.serviceId === service.id &&
                  link.diagram.name === ref.architectureDiagramName
              )?.diagramId ?? null
          } else if (ref.componentId === COMPONENT_SUPPORT_KB_ID) {
            meta.componentLinkServiceDocId =
              docs.find(
                (doc) =>
                  doc.serviceDoc.serviceId === service.id &&
                  doc.entry.name === ref.docName
              )?.serviceDoc.docId ?? null
          }
        }
      }
    }
  }

  const projectCount = loaded.filter((p) => p.id !== WORKSPACE_ID).length
  return {
    warnings,
    skipped,
    workspace: {
      home,
      projects: loaded,
      name: `${projectCount} ${projectCount === 1 ? 'project' : 'projects'}`,
      services,
      serviceFiles,
      apiGroups,
      diagrams,
      serviceDiagrams,
      docs,
      standaloneDocs,
      databases,
      queries,
      maps,
      files,
      dependencies,
    },
  }
}

export type Workspace = Awaited<ReturnType<typeof loadWorkspace>>['workspace']
