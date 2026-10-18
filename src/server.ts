import {
  AGENT_NAMES,
  fileIconPath,
  lensSettingsSchema,
} from '@uigraph/lens/agents'
import {
  buildSchema,
  execute,
  getOperationAST,
  GraphQLError,
  Kind,
  NoSchemaIntrospectionCustomRule,
  parse,
  specifiedRules,
  validate,
  type ExecutionResult,
} from 'graphql'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pc from 'picocolors'
import { z } from 'zod'
import { resolveRepositoryFile } from './analysis/repo-access.js'
import { MAX_UPLOAD_BYTES } from './artifacts/write.js'
import { createRootValue } from './graphql/resolvers.js'
import {
  answerLensTicket,
  getLensRun,
  getLensSettings,
  LensRequestError,
  listLensRuns,
  saveLensSettings,
  startLensRun,
  stopAllLensRuns,
  stopLensRun,
  subscribeToLensRun,
} from './lens.js'
import { isPendingUpload, storeUpload } from './uploads.js'
import { BUILD_ID, VERSION } from './version.js'
import { listRegisteredProjects, loadWorkspace } from './workspace.js'

function resolveAssetRoot(bundled: string, source: string) {
  const bundledRoot = fileURLToPath(new URL(bundled, import.meta.url))
  return existsSync(bundledRoot)
    ? bundledRoot
    : fileURLToPath(new URL(source, import.meta.url))
}

const VIEWER_ROOT = resolveAssetRoot('./viewer/', '../dist/viewer/')
const SCHEMA_ROOT = resolveAssetRoot('./schema/', './graphql/schema/')
const MAX_BODY_BYTES = 10_000_000
const SUPPORTED_MUTATIONS = [
  'updateDiagram',
  'createDiagram',
  'createServiceDiagram',
  'deleteDiagram',
  'deleteService',
  'createAssetUpload',
  'createDiagramImage',
  'createDoc',
  'deleteDoc',
  'createServiceDoc',
  'deleteServiceDoc',
  'createServiceDB',
  'deleteServiceDB',
  'createSavedQuery',
  'updateSavedQuery',
  'deleteSavedQuery',
  'createMap',
  'updateMap',
  'deleteMap',
  'createFrame',
  'updateFrame',
  'deleteFrame',
  'createFocalPoint',
  'updateFocalPoint',
  'deleteFocalPoint',
  'upsertCanvas',
  'createFrameGroup',
  'updateFrameGroup',
  'deleteFrameGroup',
  'createFrameLink',
  'updateFrameLink',
  'deleteFrameLink',
  'createFocalPointMeta',
  'updateFocalPointMeta',
  'deleteFocalPointMeta',
]
export const DEFAULT_PORT = 8447
const HEALTH_PATH = '/__uigraph'
const INFO_PATH = '/__uigraph/info'
const HEALTH_BODY = 'uigraph'
const HEALTH_TIMEOUT_MS = 1500
const LENS_RUN_PATH = /^\/api\/lens\/runs\/([\w-]+)(\/events|\/stop|\/ticket)?$/
const lensStartSchema = z.object({
  request: z.discriminatedUnion('type', [
    z.object({ type: z.literal('github'), pullRequest: z.string().min(1) }),
    z.object({
      type: z.literal('local'),
      directory: z.string().min(1),
      base: z.string().min(1),
      target: z.string().min(1),
    }),
  ]),
  regenerate: z.boolean(),
  agent: z.enum(AGENT_NAMES).optional(),
  model: z.string().trim().min(1).max(200).optional(),
})
const lensTicketSchema = z.object({ keys: z.array(z.string().min(1)) })

export function serverUrl(port: number) {
  return `http://127.0.0.1:${port}/`
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
  }
}

const schema = buildSchema(
  readdirSync(SCHEMA_ROOT)
    .filter((file) => file.endsWith('.graphqls'))
    .map((file) => readFileSync(path.join(SCHEMA_ROOT, file), 'utf8'))
    .join('\n')
)

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.markdown': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
  '.htm': 'text/html; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
}

async function listViewerAssets() {
  const entries = await fs.readdir(VIEWER_ROOT, {
    recursive: true,
    withFileTypes: true,
  })
  const assets = new Map<string, string>()
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue
    }
    const absolutePath = path.join(entry.parentPath, entry.name)
    const urlPath =
      '/' + path.relative(VIEWER_ROOT, absolutePath).split(path.sep).join('/')
    assets.set(urlPath, absolutePath)
  }
  if (!assets.has('/index.html')) {
    throw new Error(
      `The prebuilt viewer is missing from ${VIEWER_ROOT}. Reinstall uigraph.`
    )
  }
  return assets
}

function contentType(file: string) {
  return (
    CONTENT_TYPES[path.extname(file).toLowerCase()] ??
    'application/octet-stream'
  )
}

async function readBody(request: http.IncomingMessage, limit: number) {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    size += (chunk as Buffer).length
    if (size > limit) {
      throw new HttpError(413, 'Request body is too large')
    }
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks)
}

const reportedWarnings = new Set<string>()

async function runGraphQL(body: string): Promise<ExecutionResult> {
  const request = JSON.parse(body) as {
    query: string
    variables?: Record<string, unknown>
    operationName?: string
  }
  const document = parse(request.query)
  const validationErrors = validate(schema, document, [
    ...specifiedRules,
    NoSchemaIntrospectionCustomRule,
  ])
  if (validationErrors.length > 0) {
    return { errors: validationErrors }
  }
  const operation = getOperationAST(document, request.operationName)
  if (operation === null || operation === undefined) {
    return { errors: [new GraphQLError('No operation to execute')] }
  }
  if (operation.operation === 'subscription') {
    return { errors: [new GraphQLError('Not supported in uigraph')] }
  }
  if (
    operation.operation === 'mutation' &&
    !operation.selectionSet.selections.every(
      (selection) =>
        selection.kind === Kind.FIELD &&
        SUPPORTED_MUTATIONS.includes(selection.name.value)
    )
  ) {
    return { errors: [new GraphQLError('Not supported in uigraph')] }
  }
  const { workspace, warnings } = await loadWorkspace()
  for (const warning of warnings) {
    if (!reportedWarnings.has(warning)) {
      reportedWarnings.add(warning)
      console.log(pc.yellow(`⚠ ${warning}`))
    }
  }
  return execute({
    schema,
    document,
    rootValue: createRootValue(workspace),
    variableValues: request.variables,
    operationName: request.operationName,
  })
}

function respondWithError(
  response: http.ServerResponse,
  status: number,
  message: string
) {
  if (response.headersSent) {
    response.destroy()
    return
  }
  response
    .writeHead(status, {
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    })
    .end(message)
}

export type ViewerInfo = { version: string; build: string; pid: number }

export async function getViewerInfo(
  port: number
): Promise<ViewerInfo | 'legacy' | null> {
  if (!(await isServerRunning(port))) {
    return null
  }
  try {
    const response = await fetch(new URL(INFO_PATH, serverUrl(port)), {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    })
    if (!response.ok) {
      return 'legacy'
    }
    const body = (await response.json()) as Partial<ViewerInfo>
    return typeof body.version === 'string' &&
      typeof body.build === 'string' &&
      typeof body.pid === 'number'
      ? { version: body.version, build: body.build, pid: body.pid }
      : 'legacy'
  } catch {
    return 'legacy'
  }
}

export async function isServerRunning(port: number) {
  try {
    const response = await fetch(new URL(HEALTH_PATH, serverUrl(port)), {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    })
    return response.ok && (await response.text()) === HEALTH_BODY
  } catch {
    return false
  }
}

export async function startServer(port: number) {
  const assets = await listViewerAssets()
  const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`]

  const server = http.createServer((request, response) => {
    void (async () => {
      const securityHeaders = {
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'X-Frame-Options': 'DENY',
        'Content-Security-Policy': "frame-ancestors 'none'",
        'Cache-Control': 'no-store',
      }
      if (!allowedHosts.includes(request.headers.host ?? '')) {
        response.writeHead(403, securityHeaders).end('Forbidden')
        return
      }
      const url = new URL(request.url ?? '/', 'http://localhost')
      const pathname = decodeURIComponent(url.pathname)
      if (pathname === INFO_PATH) {
        response
          .writeHead(200, {
            ...securityHeaders,
            'Content-Type': 'application/json',
          })
          .end(
            JSON.stringify({
              version: VERSION,
              build: BUILD_ID,
              pid: process.pid,
            })
          )
        return
      }
      if (pathname === HEALTH_PATH) {
        response.writeHead(200, securityHeaders).end(HEALTH_BODY)
        return
      }
      if (pathname === '/graphql') {
        if (request.method !== 'POST') {
          response.writeHead(405, securityHeaders).end('Method Not Allowed')
          return
        }
        if (request.headers.origin !== `http://${request.headers.host}`) {
          response.writeHead(403, securityHeaders).end('Forbidden')
          return
        }
        if (
          !(request.headers['content-type'] ?? '').startsWith(
            'application/json'
          )
        ) {
          response.writeHead(415, securityHeaders).end('Unsupported Media Type')
          return
        }
        const result = await runGraphQL(
          (await readBody(request, MAX_BODY_BYTES)).toString('utf8')
        )
        response
          .writeHead(200, {
            ...securityHeaders,
            'Content-Type': CONTENT_TYPES['.json'],
          })
          .end(JSON.stringify(result))
        return
      }
      if (pathname.startsWith('/api/lens/')) {
        if (
          request.headers.origin !== undefined &&
          request.headers.origin !== `http://${request.headers.host}`
        ) {
          response.writeHead(403, securityHeaders).end('Forbidden')
          return
        }
        await handleLensRequest(request, response, pathname, securityHeaders)
        return
      }
      if (pathname === '/api/projects') {
        if (request.method !== 'GET') {
          response.writeHead(405, securityHeaders).end('Method Not Allowed')
          return
        }
        if (
          request.headers.origin !== undefined &&
          request.headers.origin !== `http://${request.headers.host}`
        ) {
          response.writeHead(403, securityHeaders).end('Forbidden')
          return
        }
        response
          .writeHead(200, {
            ...securityHeaders,
            'Content-Type': CONTENT_TYPES['.json'],
          })
          .end(JSON.stringify(await listRegisteredProjects()))
        return
      }
      if (pathname.startsWith('/uploads/')) {
        const assetId = pathname.slice('/uploads/'.length)
        if (request.method !== 'PUT') {
          response.writeHead(405, securityHeaders).end('Method Not Allowed')
          return
        }
        if (request.headers.origin !== `http://${request.headers.host}`) {
          response.writeHead(403, securityHeaders).end('Forbidden')
          return
        }
        if (!isPendingUpload(assetId)) {
          response.writeHead(404, securityHeaders).end('Not Found')
          return
        }
        storeUpload(
          assetId,
          await readBody(request, MAX_UPLOAD_BYTES),
          request.headers['content-type'] ?? ''
        )
        response.writeHead(200, securityHeaders).end()
        return
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, securityHeaders).end('Method Not Allowed')
        return
      }
      if (pathname.startsWith('/files/')) {
        const { workspace } = await loadWorkspace()
        const served = workspace.files.get(pathname)
        if (served === undefined) {
          response.writeHead(404, securityHeaders).end('Not Found')
          return
        }
        const { realPath } = await resolveRepositoryFile(
          served.root,
          served.path
        )
        const body = await fs.readFile(realPath)
        const scriptable = ['.html', '.htm', '.svg'].includes(
          path.extname(realPath).toLowerCase()
        )
        response
          .writeHead(200, {
            ...securityHeaders,
            'Content-Type': contentType(realPath),
            ...(scriptable ? { 'Content-Security-Policy': 'sandbox' } : {}),
          })
          .end(request.method === 'HEAD' ? undefined : body)
        return
      }
      const file = assets.get(pathname) ?? assets.get('/index.html')!
      const body = await fs.readFile(file)
      response
        .writeHead(200, {
          ...securityHeaders,
          'Content-Type': contentType(file),
        })
        .end(request.method === 'HEAD' ? undefined : body)
    })().catch((error: unknown) => {
      const status = error instanceof HttpError ? error.status : 500
      if (error instanceof SyntaxError) {
        respondWithError(response, 400, 'Bad Request')
        return
      }
      if (status === 500) {
        console.error(
          `[uigraph] ${request.method} ${request.url}: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`
        )
      }
      respondWithError(
        response,
        status,
        status === 413 ? 'Payload Too Large' : 'Internal Server Error'
      )
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        reject(
          new Error(
            `Port ${port} is in use by another program. Choose another with --port.`
          )
        )
        return
      }
      reject(error)
    })
    server.listen(port, '127.0.0.1', () => resolve())
  })

  return {
    async close() {
      await stopAllLensRuns()
      await new Promise<void>((resolve) => {
        server.close(() => resolve())
        server.closeAllConnections()
      })
    },
  }
}

async function handleLensRequest(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  pathname: string,
  securityHeaders: Record<string, string>
) {
  function sendJson(status: number, value: unknown) {
    response
      .writeHead(status, {
        ...securityHeaders,
        'Content-Type': CONTENT_TYPES['.json'],
      })
      .end(JSON.stringify(value))
  }

  if (pathname === '/api/lens/file-icon') {
    if (request.method !== 'GET') {
      response.writeHead(405, securityHeaders).end('Method Not Allowed')
      return
    }
    const query = new URL(request.url ?? '/', 'http://localhost').searchParams
    const name = query.get('name')
    const kind = query.get('kind')
    if (
      name === null ||
      (kind !== 'file' && kind !== 'folder' && kind !== 'folder-open')
    ) {
      sendJson(400, { error: 'name and kind are required' })
      return
    }
    response
      .writeHead(200, {
        ...securityHeaders,
        'Content-Type': CONTENT_TYPES['.svg'],
        'Content-Security-Policy': 'sandbox',
        'Cache-Control': 'max-age=86400',
      })
      .end(await fs.readFile(fileIconPath(name, kind)))
    return
  }

  if (pathname === '/api/lens/settings') {
    if (request.method === 'GET') {
      sendJson(200, await getLensSettings())
      return
    }
    if (request.method !== 'PUT') {
      response.writeHead(405, securityHeaders).end('Method Not Allowed')
      return
    }
    if (
      !(request.headers['content-type'] ?? '').startsWith('application/json')
    ) {
      response.writeHead(415, securityHeaders).end('Unsupported Media Type')
      return
    }
    const settings = lensSettingsSchema.safeParse(
      JSON.parse((await readBody(request, MAX_BODY_BYTES)).toString('utf8'))
    )
    if (!settings.success) {
      sendJson(400, { error: settings.error.message })
      return
    }
    await saveLensSettings(settings.data)
    sendJson(200, settings.data)
    return
  }

  if (pathname === '/api/lens/runs') {
    if (request.method === 'GET') {
      sendJson(200, await listLensRuns())
      return
    }
    if (request.method !== 'POST') {
      response.writeHead(405, securityHeaders).end('Method Not Allowed')
      return
    }
    if (
      !(request.headers['content-type'] ?? '').startsWith('application/json')
    ) {
      response.writeHead(415, securityHeaders).end('Unsupported Media Type')
      return
    }
    const input = lensStartSchema.safeParse(
      JSON.parse((await readBody(request, MAX_BODY_BYTES)).toString('utf8'))
    )
    if (!input.success) {
      sendJson(400, {
        error: 'Expected { request, regenerate, agent?, model? }.',
      })
      return
    }
    try {
      sendJson(200, {
        runId: await startLensRun(
          input.data.request,
          input.data.regenerate,
          input.data.agent,
          input.data.model
        ),
      })
    } catch (error) {
      if (error instanceof LensRequestError) {
        sendJson(400, { error: error.message })
        return
      }
      throw error
    }
    return
  }

  const match = LENS_RUN_PATH.exec(pathname)
  if (match === null) {
    response.writeHead(404, securityHeaders).end('Not Found')
    return
  }
  const runId = match[1]
  const action = match[2]

  if (action === '/stop') {
    if (request.method !== 'POST') {
      response.writeHead(405, securityHeaders).end('Method Not Allowed')
      return
    }
    sendJson(stopLensRun(runId) ? 200 : 404, {})
    return
  }
  if (action === '/ticket') {
    if (request.method !== 'POST') {
      response.writeHead(405, securityHeaders).end('Method Not Allowed')
      return
    }
    if (
      !(request.headers['content-type'] ?? '').startsWith('application/json')
    ) {
      response.writeHead(415, securityHeaders).end('Unsupported Media Type')
      return
    }
    const input = lensTicketSchema.safeParse(
      JSON.parse((await readBody(request, MAX_BODY_BYTES)).toString('utf8'))
    )
    if (!input.success) {
      sendJson(400, { error: 'Expected { keys }.' })
      return
    }
    sendJson(answerLensTicket(runId, input.data.keys) ? 200 : 409, {})
    return
  }
  if (request.method !== 'GET') {
    response.writeHead(405, securityHeaders).end('Method Not Allowed')
    return
  }
  const run = await getLensRun(runId)
  if (run === null) {
    response.writeHead(404, securityHeaders).end('Not Found')
    return
  }
  if (action === undefined) {
    sendJson(200, run)
    return
  }
  if (action !== '/events') {
    throw new Error(`Unknown Lens action: ${action}`)
  }

  response.writeHead(200, {
    ...securityHeaders,
    'Content-Type': 'text/event-stream; charset=utf-8',
    Connection: 'keep-alive',
  })
  response.write(`data: ${JSON.stringify(run.analysis)}\n\n`)
  const unsubscribe = subscribeToLensRun(runId, {
    update: (analysis) => {
      response.write(`data: ${JSON.stringify(analysis)}\n\n`)
    },
    end: () => response.end('event: end\ndata:\n\n'),
  })
  if (unsubscribe === null) {
    response.end('event: end\ndata:\n\n')
    return
  }
  request.on('close', unsubscribe)
}
