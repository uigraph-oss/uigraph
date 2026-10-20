import {
  AstToUiConverter,
  contextSchema,
  convertDynamoSchemaToAst,
  convertMermaidToReactFlow,
  convertMermaidToReactFlowWithContext,
  convertMongoSchemaToAst,
  DynamoEditorSchema,
  MongoEditorSchema,
  SqlToAstParser,
  type SchemaAST,
} from '@uigraph/sdk'
import type { Edge, Node } from '@xyflow/react'
import { Kind, parse as parseGraphQL, print } from 'graphql'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { glob } from 'tinyglobby'
import { parse as parseYaml } from 'yaml'
import { z } from 'zod'
import { resolveRepositoryFile } from '../analysis/repo-access.js'

export const ROOT_CONFIG = '.uigraph.yaml'
export const ORG_ID = 'local'
export const ACTOR_ID = 'uigraph'
const MAX_FILE_BYTES = 2_000_000
const HTTP_METHODS = [
  'get',
  'put',
  'post',
  'delete',
  'patch',
  'options',
  'head',
  'trace',
]

const DOC_FILE_TYPES = [
  'pdf',
  'html',
  'markdown',
  'doc',
  'txt',
  'image',
  'video',
  'audio',
  'other',
] as const
const DOC_EXTENSIONS: Record<string, (typeof DOC_FILE_TYPES)[number]> = {
  '.pdf': 'pdf',
  '.html': 'html',
  '.htm': 'html',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.doc': 'doc',
  '.docx': 'doc',
  '.txt': 'txt',
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.gif': 'image',
  '.webp': 'image',
  '.svg': 'image',
  '.mp4': 'video',
  '.mov': 'video',
  '.webm': 'video',
  '.mp3': 'audio',
  '.wav': 'audio',
  '.ogg': 'audio',
  '.m4a': 'audio',
}

export const DATABASE_DIALECTS = [
  'postgres',
  'mysql',
  'sqlite',
  'other',
  'dynamodb',
  'mongodb',
] as const
type DatabaseDialect = (typeof DATABASE_DIALECTS)[number]

const queryEntrySchema = z.looseObject({
  name: z.string().min(1),
  database: z.string().min(1),
  path: z.string().min(1).optional(),
  queryText: z.string().min(1).optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
})

const queryFileSchema = z.looseObject({
  queries: z.array(queryEntrySchema).default([]),
})

const componentRefSchema = z.looseObject({
  componentId: z.string().min(1),
  componentLinkId: z.string().optional(),
  serviceName: z.string().optional(),
  apiGroupName: z.string().optional(),
  operationId: z.string().optional(),
  testPackName: z.string().optional(),
  docName: z.string().optional(),
  architectureDiagramName: z.string().optional(),
  modalFields: z
    .array(
      z.looseObject({
        componentFieldId: z.string(),
        label: z.string().optional(),
        type: z.string().optional(),
        data: z.array(z.unknown()).optional(),
      })
    )
    .optional(),
})

const mapSchema = z.looseObject({
  name: z.string().min(1),
  description: z.string().optional(),
  frames: z
    .array(
      z.looseObject({
        name: z.string().min(1),
        description: z.string().optional(),
        imagePath: z.string().min(1).optional(),
        focalPoints: z
          .array(
            z.looseObject({
              name: z.string().min(1),
              x: z.number(),
              y: z.number(),
              visibility: z.string().optional(),
              color: z.string().optional(),
              components: z.array(componentRefSchema).optional(),
            })
          )
          .optional(),
      })
    )
    .optional(),
})

export type MapEntry = z.infer<typeof mapSchema>
export type ComponentRef = z.infer<typeof componentRefSchema>

export const CANVAS_FILE = '.uigraph/maps/canvas.json'

const canvasPointSchema = z.object({ x: z.number(), y: z.number() })

export const canvasFileSchema = z.record(
  z.string(),
  z.object({
    zoom: z.number().optional(),
    navigationX: z.number().optional(),
    navigationY: z.number().optional(),
    framePositions: z.record(z.string(), canvasPointSchema).optional(),
    frames: z
      .record(
        z.string(),
        z.object({
          groups: z
            .array(
              canvasPointSchema.extend({
                name: z.string(),
                description: z.string(),
                width: z.number(),
                height: z.number(),
              })
            )
            .optional(),
          links: z
            .array(
              canvasPointSchema.extend({
                kind: z.enum(['frame', 'map']),
                map: z.string(),
                frame: z.string().optional(),
                label: z.string(),
              })
            )
            .optional(),
        })
      )
      .optional(),
  })
)

export type CanvasFile = z.infer<typeof canvasFileSchema>

const configSchema = z.looseObject({
  version: z.literal(1),
  service: z
    .looseObject({
      name: z.string().min(1),
      category: z.string().min(1),
      description: z.string().min(1),
      repository: z
        .looseObject({ provider: z.string(), url: z.string() })
        .optional(),
      ownership: z.looseObject({ team: z.string().min(1) }).optional(),
      labels: z.array(z.string()).optional(),
      integrations: z
        .looseObject({
          slack: z.looseObject({ url: z.string() }).optional(),
          jira: z.looseObject({ url: z.string() }).optional(),
        })
        .optional(),
    })
    .optional(),
  apis: z
    .array(
      z.looseObject({
        name: z.string().min(1),
        type: z.enum(['openapi', 'graphql', 'grpc']),
        path: z.string().min(1),
      })
    )
    .default([]),
  dependencies: z
    .array(
      z.looseObject({
        name: z.string().min(1),
        service: z.string().min(1),
        direction: z.enum(['upstream', 'downstream']),
        criticality: z.enum(['hard', 'soft']),
        type: z.enum(['http', 'graphql', 'grpc', 'database']).optional(),
        description: z.string().optional(),
        apiGroupName: z.string().optional(),
        apiEndpointNames: z.array(z.string().min(1)).optional(),
        databaseName: z.string().optional(),
      })
    )
    .default([]),
  architectureDiagrams: z
    .array(
      z.looseObject({
        name: z.string().min(1),
        path: z.string().min(1),
        contextPath: z.string().min(1).optional(),
      })
    )
    .default([]),
  docs: z
    .array(
      z.looseObject({
        name: z.string().min(1),
        path: z.string().min(1),
        fileType: z.enum(DOC_FILE_TYPES).optional(),
        description: z.string().optional(),
      })
    )
    .default([]),
  databases: z
    .array(
      z.looseObject({
        name: z.string().min(1),
        dialect: z.enum(DATABASE_DIALECTS),
        dbType: z.string().optional(),
        schemaPath: z.string().min(1),
      })
    )
    .default([]),
  queries: z.array(queryEntrySchema).default([]),
  queryFiles: z.array(z.string().min(1)).default([]),
  maps: z.array(mapSchema).default([]),
})

type Config = z.infer<typeof configSchema>
type ConfigService = NonNullable<Config['service']>

type ParsedEndpoint = {
  method: string
  path: string
  operationId: string
  summary: string
  description: string
  parameters: string
}

const PROTOCOL_LABELS = {
  openapi: 'REST',
  graphql: 'GraphQL',
  grpc: 'gRPC',
} as const

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function describe(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function contentHash(...parts: string[]) {
  const hash = createHash('sha256')
  for (const part of parts) {
    hash.update(part)
  }
  return hash.digest('hex')
}

async function readArtifactFile(root: string, relativePath: string) {
  const { realPath, stat } = await resolveRepositoryFile(root, relativePath)
  if (!stat.isFile()) {
    throw new Error(`Not a file: ${relativePath}`)
  }
  if (stat.size > MAX_FILE_BYTES) {
    throw new Error(
      `File is larger than ${MAX_FILE_BYTES} bytes: ${relativePath}`
    )
  }
  return {
    text: await fs.readFile(realPath, 'utf8'),
    updatedAt: stat.mtime.toISOString(),
  }
}

function parseOpenApi(text: string): ParsedEndpoint[] {
  const spec = parseYaml(text) as {
    paths?: Record<string, Record<string, Record<string, unknown>>>
  } | null
  if (spec === null || typeof spec !== 'object') {
    throw new Error('not an OpenAPI document')
  }
  return Object.entries(spec.paths ?? {}).flatMap(([route, operations]) =>
    HTTP_METHODS.filter((method) => operations[method] !== undefined).map(
      (method) => {
        const operation = operations[method]
        return {
          method: method.toUpperCase(),
          path: route,
          operationId:
            typeof operation.operationId === 'string'
              ? operation.operationId
              : `${method.toUpperCase()} ${route}`,
          summary:
            typeof operation.summary === 'string' ? operation.summary : '',
          description:
            typeof operation.description === 'string'
              ? operation.description
              : '',
          parameters: '[]',
        }
      }
    )
  )
}

function parseGraphQLSchema(text: string): ParsedEndpoint[] {
  const document = parseGraphQL(text)
  return document.definitions.flatMap((definition) => {
    if (
      (definition.kind !== Kind.OBJECT_TYPE_DEFINITION &&
        definition.kind !== Kind.OBJECT_TYPE_EXTENSION) ||
      !['Query', 'Mutation', 'Subscription'].includes(definition.name.value)
    ) {
      return []
    }
    return (definition.fields ?? []).map((field) => {
      const args =
        field.arguments === undefined || field.arguments.length === 0
          ? ''
          : `(${field.arguments.map((arg) => `${arg.name.value}: ${print(arg.type)}`).join(', ')})`
      return {
        method: definition.name.value,
        path: `${field.name.value}${args}: ${print(field.type)}`,
        operationId: field.name.value,
        summary: '',
        description: field.description?.value ?? '',
        parameters: '[]',
      }
    })
  })
}

function parseProto(text: string): ParsedEndpoint[] {
  const packageName = /^\s*package\s+([\w.]+)\s*;/m.exec(text)?.[1] ?? ''
  const services = [...text.matchAll(/\bservice\s+(\w+)\s*\{/g)]
  const rpcs = text.matchAll(
    /\brpc\s+(\w+)\s*\(\s*(stream\s+)?[\w.]+\s*\)\s*returns\s*\(\s*(stream\s+)?[\w.]+\s*\)/g
  )
  return [...rpcs].map((rpc) => {
    const service = services.filter((match) => match.index < rpc.index).pop()
    if (service === undefined) {
      throw new Error(`rpc ${rpc[1]} is outside a service`)
    }
    const clientStream = rpc[2] !== undefined
    const serverStream = rpc[3] !== undefined
    const qualifiedService =
      packageName === '' ? service[1] : `${packageName}.${service[1]}`
    return {
      method:
        clientStream && serverStream
          ? 'bidirectional'
          : clientStream
            ? 'client_streaming'
            : serverStream
              ? 'server_streaming'
              : 'unary',
      path: `${qualifiedService}/${rpc[1]}`,
      operationId: rpc[1],
      summary: '',
      description: '',
      parameters: JSON.stringify({ packageName, serviceName: service[1] }),
    }
  })
}

function parseApiSpec(type: Config['apis'][number]['type'], text: string) {
  if (type === 'openapi') {
    return parseOpenApi(text)
  }
  if (type === 'graphql') {
    return parseGraphQLSchema(text)
  }
  if (type === 'grpc') {
    return parseProto(text)
  }
  throw new Error(`Unknown API type: ${String(type)}`)
}

async function convertDiagram(mermaid: string, context: unknown) {
  if (context === undefined) {
    return convertMermaidToReactFlow(mermaid)
  }
  return convertMermaidToReactFlowWithContext(
    mermaid,
    contextSchema.parse(context),
    { repositionNodes: true }
  )
}

export function parseDatabaseSchema(dialect: DatabaseDialect, text: string) {
  if (dialect === 'dynamodb') {
    const table = DynamoEditorSchema.parse(JSON.parse(text))
    return {
      sdkDialect: dialect,
      ast: convertDynamoSchemaToAst(table),
      sourceContent: table,
      noSQLSchema: { dynamo: { table } },
    }
  }
  if (dialect === 'mongodb') {
    const schema = MongoEditorSchema.parse(JSON.parse(text))
    return {
      sdkDialect: dialect,
      ast: convertMongoSchemaToAst(schema),
      sourceContent: schema,
      noSQLSchema: { mongo: { collections: schema.collections } },
    }
  }
  const sdkDialect =
    dialect === 'postgres'
      ? 'postgresql'
      : dialect === 'other'
        ? SqlToAstParser.detectDialect(text)
        : dialect
  return {
    sdkDialect,
    ast: new SqlToAstParser(sdkDialect).parse(text),
    sourceContent: undefined,
    noSQLSchema: null,
  }
}

function toTables(ast: SchemaAST) {
  return ast.tables.map((table) => ({
    name: table.name,
    columns: table.columns.map((column) => ({
      name: column.name,
      type: column.dataType.name,
      nullable: column.nullable,
      description: column.comment || null,
      isPrimaryKey: table.constraints.some(
        (c) => c.type === 'primary_key' && c.columns.includes(column.name)
      ),
    })),
    indexes: [],
  }))
}

function toServiceEntity(
  id: string,
  service: ConfigService,
  updatedAt: string
) {
  return {
    id,
    orgId: ORG_ID,
    folderId: null,
    teamId: null,
    name: service.name,
    description: service.description,
    status: 'active',
    tier: 'tier3',
    category: service.category,
    language: '',
    gitRepoUrl: service.repository?.url ?? null,
    jiraProjectUrl: service.integrations?.jira?.url ?? null,
    slackChannelUrl: service.integrations?.slack?.url ?? null,
    lastCommitSha: null,
    labels: service.labels ?? [],
    metadata: '{}',
    docLinks: null,
    createdBy: ACTOR_ID,
    updatedBy: null,
    stats: {
      serviceId: id,
      endpointCount: 0,
      diagramCount: 0,
      dbTableCount: 0,
      docCount: 0,
      testCaseCount: 0,
    },
    createdAt: updatedAt,
    updatedAt,
  }
}

export async function loadArtifacts(root: string, configFile = ROOT_CONFIG) {
  const errors: string[] = []
  const configFiles = [configFile]
  if (configFile === ROOT_CONFIG) {
    configFiles.push(
      ...(
        await glob('.uigraph/services/*.yaml', {
          cwd: root,
          dot: true,
          onlyFiles: true,
          followSymbolicLinks: false,
        })
      ).sort()
    )
  }

  const configs: { file: string; config: Config; updatedAt: string }[] = []
  for (const file of configFiles) {
    try {
      const { text, updatedAt } = await readArtifactFile(root, file)
      const parsed = configSchema.safeParse(parseYaml(text))
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          errors.push(
            `${file}: ${issue.path.join('.') || 'root'}: ${issue.message}`
          )
        }
        continue
      }
      configs.push({ file, config: parsed.data, updatedAt })
    } catch (error) {
      errors.push(`${file}: ${describe(error)}`)
    }
  }

  for (const { file, config } of configs) {
    if (config.service === undefined) {
      if (
        config.apis.length > 0 ||
        config.dependencies.length > 0 ||
        config.databases.length > 0 ||
        config.queries.length > 0 ||
        config.queryFiles.length > 0
      ) {
        errors.push(
          `${file}: apis, dependencies, databases and queries require a service block`
        )
      }
    }
  }

  const services: ReturnType<typeof toServiceEntity>[] = []
  const serviceFiles: { serviceId: string; file: string }[] = []
  const serviceIdByName = new Map<string, string>()
  for (const { file, config, updatedAt } of configs) {
    if (config.service === undefined) {
      continue
    }
    const id = slugify(config.service.name)
    if (
      serviceIdByName.has(config.service.name) ||
      services.some((s) => s.id === id)
    ) {
      errors.push(`${file}: duplicate service "${config.service.name}"`)
      continue
    }
    serviceIdByName.set(config.service.name, id)
    services.push(toServiceEntity(id, config.service, updatedAt))
    serviceFiles.push({ serviceId: id, file })
  }

  const apiGroups = []
  for (const { file, config, updatedAt } of configs) {
    if (config.service === undefined) {
      continue
    }
    const serviceId = serviceIdByName.get(config.service.name)
    if (serviceId === undefined) {
      continue
    }
    for (const api of config.apis) {
      let text: string
      let endpoints: ParsedEndpoint[]
      try {
        text = (await readArtifactFile(root, api.path)).text
        endpoints = parseApiSpec(api.type, text)
      } catch (error) {
        errors.push(`${file}: apis[${api.name}]: ${describe(error)}`)
        continue
      }
      const id = slugify(`${serviceId}-${api.name}`)
      const hash = contentHash(text)
      const fileName = path.posix.basename(api.path)
      apiGroups.push({
        group: {
          id,
          serviceId,
          orgId: ORG_ID,
          name: api.name,
          version: '1',
          label: null,
          protocol: PROTOCOL_LABELS[api.type],
          specKey: fileName,
          specHash: hash,
          createdBy: ACTOR_ID,
          updatedBy: null,
          createdAt: updatedAt,
          updatedAt,
        },
        version: {
          id: `${id}-v1`,
          orgId: ORG_ID,
          apiGroupId: id,
          versionNumber: 1,
          label: null,
          specKey: fileName,
          specHash: hash,
          isAutoVersion: false,
          createdBy: ACTOR_ID,
          createdAt: updatedAt,
        },
        spec: api.type === 'openapi' ? { fileName, content: text } : null,
        endpoints: endpoints.map((endpoint, index) => ({
          id: slugify(`${id}-${endpoint.method}-${endpoint.path}`),
          apiGroupId: id,
          serviceId,
          orgId: ORG_ID,
          operationId: endpoint.operationId,
          method: endpoint.method,
          path: endpoint.path,
          summary: endpoint.summary,
          description: endpoint.description,
          tags: [],
          parameters: endpoint.parameters,
          requestBody: '{}',
          responses: '{}',
          exampleRequests: '[]',
          exampleResponses: '[]',
          order: index,
          sla: null,
          createdBy: ACTOR_ID,
          updatedBy: null,
          createdAt: updatedAt,
          updatedAt,
        })),
      })
    }
  }

  const diagrams = []
  const diagramIds = new Set<string>()
  const serviceDiagrams = []
  for (const { file, config } of configs) {
    const serviceId =
      config.service === undefined
        ? undefined
        : serviceIdByName.get(config.service.name)
    for (const [index, entry] of config.architectureDiagrams.entries()) {
      const where = `${file}: architectureDiagrams[${entry.name}]`
      const id = slugify(entry.path)
      if (diagramIds.has(id)) {
        errors.push(
          `${where}: another diagram already uses the path "${entry.path}"`
        )
        continue
      }
      let mermaid: string
      let contextText: string | undefined
      let updatedAt: string
      let flow: { nodes: Node[]; edges: Edge[] }
      try {
        const mermaidFile = await readArtifactFile(root, entry.path)
        mermaid = mermaidFile.text
        updatedAt = mermaidFile.updatedAt
        contextText =
          entry.contextPath === undefined
            ? undefined
            : (await readArtifactFile(root, entry.contextPath)).text
        const context =
          contextText === undefined
            ? undefined
            : (JSON.parse(contextText) as unknown)
        flow = (await convertDiagram(mermaid, context)) as {
          nodes: Node[]
          edges: Edge[]
        }
      } catch (error) {
        errors.push(`${where}: ${describe(error)}`)
        continue
      }
      if (
        flow.nodes.length === 0 &&
        !/^flowchart (TB|TD|BT|RL|LR)$/.test(mermaid.trim())
      ) {
        errors.push(
          `${where}: the Mermaid source could not be converted; check its syntax`
        )
        continue
      }
      const hash = contentHash(mermaid, contextText ?? '')
      const entity = {
        id,
        orgId: ORG_ID,
        folderId: null,
        teamId: null,
        name: entry.name,
        description: null,
        contentKey: entry.path,
        contentHash: hash,
        content: JSON.stringify({
          nodes: flow.nodes,
          edges: flow.edges,
          dataSources: [],
          components: [],
          viewport: null,
        }),
        previewAssetId: null,
        previewImageUrl: null,
        previewContentHash: null,
        previewStatus: 'none',
        createdBy: ACTOR_ID,
        updatedBy: null,
        createdByCommitHash: null,
        updatedByCommitHash: null,
        createdByActor: null,
        updatedByActor: null,
        createdAt: updatedAt,
        updatedAt,
      }
      diagramIds.add(id)
      diagrams.push({ entity, file, index, entry, flow, mermaid })
      if (serviceId !== undefined) {
        serviceDiagrams.push({
          serviceId,
          diagramId: id,
          orgId: ORG_ID,
          createdBy: ACTOR_ID,
          updatedBy: null,
          createdAt: updatedAt,
          updatedAt,
          diagram: entity,
        })
      }
    }
  }

  const docs = []
  const standaloneDocs = []
  const docIds = new Set<string>()
  for (const { file, config } of configs) {
    const serviceId =
      config.service === undefined
        ? null
        : serviceIdByName.get(config.service.name)
    if (serviceId === undefined) {
      continue
    }
    const names = new Set<string>()
    for (const [index, entry] of config.docs.entries()) {
      const where = `${file}: docs[${entry.name}]`
      if (names.has(entry.name)) {
        errors.push(`${where}: duplicate doc name`)
        continue
      }
      names.add(entry.name)
      let stat: Awaited<ReturnType<typeof resolveRepositoryFile>>['stat']
      try {
        stat = (await resolveRepositoryFile(root, entry.path)).stat
      } catch (error) {
        errors.push(`${where}: ${describe(error)}`)
        continue
      }
      if (!stat.isFile()) {
        errors.push(`${where}: not a file: ${entry.path}`)
        continue
      }
      const updatedAt = stat.mtime.toISOString()
      const base = slugify(`${serviceId ?? 'doc'}-${entry.name}`)
      let id = base
      for (let suffix = 2; docIds.has(id); suffix++) {
        id = `${base}-${suffix}`
      }
      docIds.add(id)
      const doc = {
        id,
        orgId: ORG_ID,
        folderId: null,
        teamId: null,
        fileAssetId: entry.path,
        fileUrl: null as string | null,
        fileName: entry.name,
        serviceName: config.service?.name ?? null,
        fileType:
          entry.fileType ??
          DOC_EXTENSIONS[path.posix.extname(entry.path).toLowerCase()] ??
          'other',
        description: entry.description ?? '',
        contentHash: `${stat.size}-${stat.mtimeMs}`,
        createdBy: ACTOR_ID,
        updatedBy: null,
        createdAt: updatedAt,
        updatedAt,
      }
      if (serviceId === null) {
        standaloneDocs.push({ file, index, entry, doc })
        continue
      }
      docs.push({
        file,
        index,
        entry,
        serviceDoc: {
          serviceId,
          docId: doc.id,
          orgId: ORG_ID,
          createdBy: ACTOR_ID,
          updatedBy: null,
          createdAt: updatedAt,
          updatedAt,
          doc,
        },
      })
    }
  }

  const databases = []
  const queries = []
  for (const { file, config, updatedAt: configUpdatedAt } of configs) {
    if (config.service === undefined) {
      continue
    }
    const serviceId = serviceIdByName.get(config.service.name)
    if (serviceId === undefined) {
      continue
    }
    const databaseIds = new Map<string, string>()
    for (const [index, entry] of config.databases.entries()) {
      const where = `${file}: databases[${entry.name}]`
      if (databaseIds.has(entry.name)) {
        errors.push(`${where}: duplicate database name`)
        continue
      }
      let text: string
      let updatedAt: string
      let parsed: ReturnType<typeof parseDatabaseSchema>
      try {
        ;({ text, updatedAt } = await readArtifactFile(root, entry.schemaPath))
        parsed = parseDatabaseSchema(entry.dialect, text)
      } catch (error) {
        errors.push(`${where}: ${describe(error)}`)
        continue
      }
      const id = slugify(`${serviceId}-${entry.name}`)
      databaseIds.set(entry.name, id)
      const diagramId = `db-${id}`
      const flow = AstToUiConverter.toReactFlow(parsed.ast, entry.name)
      const hash = contentHash(text)
      const diagram = {
        id: diagramId,
        orgId: ORG_ID,
        folderId: null,
        teamId: null,
        name: `${entry.name} Schema Diagram`,
        description: null,
        contentKey: entry.schemaPath,
        contentHash: hash,
        content: JSON.stringify({
          nodes: flow.nodes,
          edges: flow.edges,
          dataSources: [
            {
              id,
              name: entry.name,
              dialect: parsed.sdkDialect,
              schemaAst: parsed.ast,
              sourceType: 'file',
              sourceContent: parsed.sourceContent,
              createdAt: Date.parse(updatedAt),
              modifiedAt: null,
            },
          ],
          components: [],
          viewport: null,
        }),
        previewAssetId: null,
        previewImageUrl: null,
        previewContentHash: null,
        previewStatus: 'none',
        createdBy: ACTOR_ID,
        updatedBy: null,
        createdByCommitHash: null,
        updatedByCommitHash: null,
        createdByActor: null,
        updatedByActor: null,
        createdAt: updatedAt,
        updatedAt,
      }
      databases.push({
        file,
        index,
        entry,
        diagram,
        serviceDb: {
          id,
          serviceId,
          orgId: ORG_ID,
          dbName: entry.name,
          dbType: entry.dbType ?? entry.dialect,
          dialect: entry.dialect,
          schemaJson: '{}',
          tables: parsed.noSQLSchema === null ? toTables(parsed.ast) : [],
          noSQLSchema: parsed.noSQLSchema,
          dbDiagramId: diagramId,
          pgDumpFileId: null,
          source: 'cli',
          sourceTs: null,
          createdBy: ACTOR_ID,
          updatedBy: null,
          createdByCommitHash: null,
          updatedByCommitHash: null,
          createdByActor: null,
          updatedByActor: null,
          createdAt: updatedAt,
          updatedAt,
        },
      })
    }

    const entries = config.queries.map((entry, index) => ({
      source: file,
      index,
      entry,
    }))
    for (const queryFile of config.queryFiles) {
      try {
        const { text } = await readArtifactFile(root, queryFile)
        const parsed = queryFileSchema.safeParse(parseYaml(text))
        if (!parsed.success) {
          for (const issue of parsed.error.issues) {
            errors.push(
              `${queryFile}: ${issue.path.join('.') || 'root'}: ${issue.message}`
            )
          }
          continue
        }
        entries.push(
          ...parsed.data.queries.map((entry, index) => ({
            source: queryFile,
            index,
            entry,
          }))
        )
      } catch (error) {
        errors.push(`${file}: queryFiles[${queryFile}]: ${describe(error)}`)
      }
    }
    const queryIds = new Set<string>()
    for (const { source, index, entry } of entries) {
      const where = `${source}: queries[${entry.name}]`
      const serviceDbId = databaseIds.get(entry.database)
      if (serviceDbId === undefined) {
        errors.push(`${where}: unknown database "${entry.database}"`)
        continue
      }
      const id = slugify(`${serviceDbId}-${entry.name}`)
      if (queryIds.has(id)) {
        errors.push(`${where}: duplicate query name`)
        continue
      }
      let queryText: string
      let updatedAt: string
      try {
        if (entry.path !== undefined && entry.queryText === undefined) {
          ;({ text: queryText, updatedAt } = await readArtifactFile(
            root,
            entry.path
          ))
        } else if (entry.path === undefined && entry.queryText !== undefined) {
          queryText = entry.queryText
          updatedAt = configUpdatedAt
        } else {
          throw new Error('set exactly one of path or queryText')
        }
      } catch (error) {
        errors.push(`${where}: ${describe(error)}`)
        continue
      }
      queryIds.add(id)
      queries.push({
        file: source,
        index,
        entry,
        savedQuery: {
          id,
          orgId: ORG_ID,
          serviceDbId,
          folderId: null,
          scope: 'TEAM',
          ownerUserId: null,
          teamId: null,
          title: entry.name,
          description: entry.description ?? '',
          queryText,
          tags: entry.tags ?? [],
          source: 'cli',
          createdBy: ACTOR_ID,
          updatedBy: null,
          createdByCommitHash: null,
          updatedByCommitHash: null,
          createdByActor: null,
          updatedByActor: null,
          createdAt: updatedAt,
          updatedAt,
        },
      })
    }
  }

  let canvas: CanvasFile = {}
  try {
    const parsed = canvasFileSchema.safeParse(
      JSON.parse((await readArtifactFile(root, CANVAS_FILE)).text)
    )
    if (parsed.success) {
      canvas = parsed.data
    } else {
      for (const issue of parsed.error.issues) {
        errors.push(
          `${CANVAS_FILE}: ${issue.path.join('.') || 'root'}: ${issue.message}`
        )
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      errors.push(`${CANVAS_FILE}: ${describe(error)}`)
    }
  }

  const maps = []
  const mapIds = new Set<string>()
  for (const { file, config, updatedAt } of configs) {
    for (const [index, entry] of config.maps.entries()) {
      const where = `${file}: maps[${entry.name}]`
      const id = slugify(entry.name)
      if (mapIds.has(id)) {
        errors.push(`${where}: another map has the same name`)
        continue
      }
      mapIds.add(id)
      const mapCanvas = canvas[entry.name] ?? {}
      const frames = []
      const frameIds = new Set<string>()
      for (const [frameIndex, frameEntry] of (entry.frames ?? []).entries()) {
        const frameWhere = `${where}: frames[${frameEntry.name}]`
        const frameId = `${id}--${slugify(frameEntry.name)}`
        if (frameIds.has(frameId)) {
          errors.push(`${frameWhere}: another frame has the same name`)
          continue
        }
        frameIds.add(frameId)
        let imageHash: string | null = null
        if (frameEntry.imagePath !== undefined) {
          try {
            const { stat } = await resolveRepositoryFile(
              root,
              frameEntry.imagePath
            )
            if (!stat.isFile()) {
              throw new Error(`Not a file: ${frameEntry.imagePath}`)
            }
            imageHash = `${stat.size}-${stat.mtimeMs}`
          } catch (error) {
            errors.push(`${frameWhere}: ${describe(error)}`)
            continue
          }
        }
        const pointNames = new Set<string>()
        const focalPoints = []
        for (const [pointIndex, point] of (
          frameEntry.focalPoints ?? []
        ).entries()) {
          if (pointNames.has(point.name)) {
            errors.push(
              `${frameWhere}: focalPoints[${point.name}]: another focal point has the same name`
            )
            continue
          }
          pointNames.add(point.name)
          const pointId = `${frameId}--p${pointIndex}`
          focalPoints.push({
            point: {
              id: pointId,
              frameId,
              orgId: ORG_ID,
              name: point.name,
              locationX: point.x,
              locationY: point.y,
              visibility: point.visibility ?? 'public',
              color: point.color ?? null,
              isActive: true,
              createdBy: ACTOR_ID,
              updatedBy: null,
              createdByCommitHash: null,
              updatedByCommitHash: null,
              createdAt: updatedAt,
              updatedAt,
            },
            components: (point.components ?? []).map((ref, refIndex) => ({
              ref,
              meta: {
                id: `${pointId}--c${refIndex}`,
                focalPointId: pointId,
                orgId: ORG_ID,
                frameId,
                componentId: ref.componentId,
                componentLinkDiagramId: null as string | null,
                componentLinkApiEndpointId: null as string | null,
                componentLinkTestPackId: null,
                componentLinkServiceDocId: null as string | null,
                componentModalFields: (ref.modalFields ?? []).map(
                  (field, order) => ({
                    componentFieldId: field.componentFieldId,
                    label: field.label ?? null,
                    type: field.type ?? null,
                    required: null,
                    isReadonly: null,
                    data: field.data ?? null,
                    options: null,
                    order,
                  })
                ),
                createdBy: ACTOR_ID,
                updatedBy: null,
                createdByCommitHash: null,
                updatedByCommitHash: null,
                createdAt: updatedAt,
                updatedAt,
              },
            })),
          })
        }
        const frameCanvas = mapCanvas.frames?.[frameEntry.name] ?? {}
        frames.push({
          name: frameEntry.name,
          frame: {
            id: frameId,
            mapId: id,
            orgId: ORG_ID,
            parentFrameId: null,
            name: frameEntry.name,
            description: frameEntry.description ?? '',
            templateType: 'default',
            screenshotAssetId: frameEntry.imagePath ?? null,
            screenshotImageUrl: null as string | null,
            screenshotContentHash: imageHash,
            status: 'active',
            order: frameIndex,
            source: 'cli',
            focalPointCount: focalPoints.length,
            createdBy: ACTOR_ID,
            updatedBy: null,
            createdByCommitHash: null,
            updatedByCommitHash: null,
            createdByActor: null,
            updatedByActor: null,
            createdAt: updatedAt,
            updatedAt,
          },
          focalPoints,
          groups: (frameCanvas.groups ?? []).map((group, groupIndex) => ({
            id: `${frameId}--g${groupIndex}`,
            frameId,
            orgId: ORG_ID,
            name: group.name,
            description: group.description,
            locationX: group.x,
            locationY: group.y,
            width: group.width,
            height: group.height,
            order: groupIndex,
            isActive: true,
            createdBy: ACTOR_ID,
            updatedBy: null,
            createdAt: updatedAt,
            updatedAt,
          })),
          links: (frameCanvas.links ?? []).map((link, linkIndex) => ({
            target: { map: link.map, frame: link.frame },
            link: {
              id: `${frameId}--l${linkIndex}`,
              frameId,
              orgId: ORG_ID,
              kind: link.kind,
              targetFrameId: null as string | null,
              targetMapId: null as string | null,
              label: link.label,
              locationX: link.x,
              locationY: link.y,
              isActive: true,
              createdBy: ACTOR_ID,
              updatedBy: null,
              createdAt: updatedAt,
              updatedAt,
            },
          })),
        })
      }
      maps.push({
        file,
        index,
        entry,
        canvas: mapCanvas,
        frames,
        map: {
          id,
          orgId: ORG_ID,
          folderId: null,
          teamId: null,
          name: entry.name,
          description: entry.description ?? '',
          status: 'active',
          createdBy: ACTOR_ID,
          updatedBy: null,
          createdByCommitHash: null,
          updatedByCommitHash: null,
          createdAt: updatedAt,
          updatedAt,
          previewImgUrls: [] as string[],
        },
      })
    }
  }

  const dependencies = []
  for (const { file, config } of configs) {
    if (config.service === undefined) {
      continue
    }
    const service = services.find(
      (s) => s.id === serviceIdByName.get(config.service!.name)
    )
    if (service === undefined) {
      continue
    }
    const names = new Set<string>()
    for (const dependency of config.dependencies) {
      const where = `${file}: dependencies[${dependency.name}]`
      if (names.has(dependency.name)) {
        errors.push(`${where}: duplicate dependency name`)
      }
      names.add(dependency.name)
      if (dependency.service === config.service.name) {
        errors.push(`${where}: a service cannot depend on itself`)
      }
      const endpointNames = dependency.apiEndpointNames ?? []
      if (new Set(endpointNames).size !== endpointNames.length) {
        errors.push(`${where}: apiEndpointNames must be unique`)
      }
      const target = services.find((s) => s.id === slugify(dependency.service))
      dependencies.push({
        id: slugify(`${service.id}-${dependency.name}`),
        name: dependency.name,
        service: toDependencyService(service),
        dependency: target === undefined ? null : toDependencyService(target),
        dependencyName: dependency.service,
        direction: dependency.direction,
        type: dependency.type ?? null,
        criticality: dependency.criticality,
        description: dependency.description ?? null,
        apiGroupName: dependency.apiGroupName ?? null,
        apiEndpointNames: endpointNames,
        databaseName: dependency.databaseName ?? null,
      })
    }
  }

  for (const service of services) {
    service.stats.endpointCount = apiGroups
      .filter(({ group }) => group.serviceId === service.id)
      .reduce((count, { endpoints }) => count + endpoints.length, 0)
    service.stats.diagramCount = serviceDiagrams.filter(
      (link) => link.serviceId === service.id
    ).length
    service.stats.docCount = docs.filter(
      ({ serviceDoc }) => serviceDoc.serviceId === service.id
    ).length
    service.stats.dbTableCount = databases
      .filter(({ serviceDb }) => serviceDb.serviceId === service.id)
      .reduce((count, { serviceDb }) => count + serviceDb.tables.length, 0)
  }

  return {
    errors,
    db: {
      configFiles: configs.map(({ file }) => file),
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
      dependencies,
    },
  }
}

export function toDependencyService(
  service: ReturnType<typeof toServiceEntity>
) {
  return {
    id: service.id,
    name: service.name,
    description: service.description,
    status: service.status,
    tier: service.tier,
    category: service.category,
    language: service.language,
    gitRepoUrl: service.gitRepoUrl,
    updatedAt: service.updatedAt,
    metadata: null,
  }
}

export type ArtifactDb = Awaited<ReturnType<typeof loadArtifacts>>['db']
