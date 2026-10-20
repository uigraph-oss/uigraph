import http from 'node:http'
import net from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startServer } from './server.js'
import {
  createRepo,
  ORDERS_CONFIG,
  ORDERS_FILES,
  readRepoFile,
} from './test-repo.js'
import { registerProject } from './workspace.js'

let root: string
let origin: string
let server: Awaited<ReturnType<typeof startServer>>
const originalHome = process.env.HOME

async function findFreePort() {
  const probe = net.createServer()
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve))
  const address = probe.address()
  if (address === null || typeof address === 'string') {
    throw new Error('Could not find a free port')
  }
  await new Promise((resolve) => probe.close(resolve))
  return address.port
}

async function graphql(query: string, variables: object = {}) {
  const response = await fetch(`${origin}/graphql`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  expect(response.status).toBe(200)
  return (await response.json()) as {
    data?: Record<string, unknown>
    errors?: { message: string }[]
  }
}

beforeAll(async () => {
  process.env.HOME = await createRepo({})
  root = await createRepo({
    ...ORDERS_FILES,
    '.uigraph.yaml': `${ORDERS_CONFIG}docs:
  - name: Guide
    path: docs/guide.html
`,
    'docs/guide.html': '<h1>Guide</h1>',
  })
  await registerProject(root)
  const port = await findFreePort()
  origin = `http://127.0.0.1:${port}`
  server = await startServer(port)
})

afterAll(async () => {
  await server.close()
  process.env.HOME = originalHome
})

describe('request checks', () => {
  it('answers the health check', async () => {
    const response = await fetch(`${origin}/__uigraph`)
    expect(await response.text()).toBe('uigraph')
  })

  it('refuses an unknown Host header', async () => {
    const status = await new Promise((resolve, reject) => {
      http
        .get(
          `${origin}/__uigraph`,
          { headers: { host: 'evil.example' } },
          (response) => {
            response.resume()
            resolve(response.statusCode)
          }
        )
        .on('error', reject)
    })
    expect(status).toBe(403)
  })

  it('refuses GraphQL from another origin', async () => {
    const response = await fetch(`${origin}/graphql`, {
      method: 'POST',
      headers: {
        origin: 'http://evil.example',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ query: '{ __typename }' }),
    })
    expect(response.status).toBe(403)
  })

  it('refuses GraphQL that is not JSON', async () => {
    const response = await fetch(`${origin}/graphql`, {
      method: 'POST',
      headers: { origin, 'content-type': 'text/plain' },
      body: '{ __typename }',
    })
    expect(response.status).toBe(415)
  })

  it('refuses malformed JSON', async () => {
    const response = await fetch(`${origin}/graphql`, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: '{',
    })
    expect(response.status).toBe(400)
  })

  it('blocks introspection', async () => {
    const result = await graphql('{ __schema { types { name } } }')
    expect(result.errors?.[0].message).toMatch(/introspection/i)
  })

  it('blocks mutations the local server does not support', async () => {
    const result = await graphql(
      'mutation { deleteAPIGroup(orgId: "local", serviceId: "x", id: "y") }'
    )
    expect(result.errors).toEqual([
      expect.objectContaining({ message: 'Not supported in uigraph' }),
    ])
  })
})

describe('GraphQL', () => {
  it('lists the services and diagrams of registered projects', async () => {
    const result = await graphql(`
      {
        services(orgId: "local") {
          totalCount
          items {
            id
            name
          }
        }
        diagrams(orgId: "local") {
          items {
            id
            name
          }
        }
        apiEndpoints(
          orgId: "local"
          serviceId: "orders-api"
          apiGroupId: "orders-api-rest"
        ) {
          operationId
        }
      }
    `)
    expect(result.errors).toBeUndefined()
    expect(result.data).toEqual({
      services: {
        totalCount: 1,
        items: [{ id: 'orders-api', name: 'Orders API' }],
      },
      diagrams: {
        items: [
          {
            id: expect.stringMatching(
              /--uigraph-diagrams-checkout-checkout-mmd$/
            ),
            name: 'Checkout flow',
          },
        ],
      },
      apiEndpoints: [
        { operationId: 'listOrders' },
        { operationId: 'createOrder' },
      ],
    })
  })

  it('renames a diagram in the repository files', async () => {
    const listed = await graphql(
      '{ diagrams(orgId: "local") { items { id } } }'
    )
    const id = (listed.data?.diagrams as { items: { id: string }[] }).items[0]
      .id
    const result = await graphql(
      `
        mutation ($id: ID!) {
          updateDiagram(
            orgId: "local"
            id: $id
            input: { name: "Checkout v2" }
          ) {
            id
            name
          }
        }
      `,
      { id }
    )
    expect(result.errors).toBeUndefined()
    expect(result.data).toEqual({ updateDiagram: { id, name: 'Checkout v2' } })
    expect(await readRepoFile(root, '.uigraph.yaml')).toContain(
      '  - name: Checkout v2 # main flow\n'
    )
  })

  it('returns a readable error for an unknown diagram', async () => {
    const result = await graphql(
      '{ diagram(orgId: "local", id: "nope") { id } }'
    )
    expect(result.errors?.[0].message).toBe('Diagram nope not found')
  })
})

describe('files', () => {
  async function readGuideUrl() {
    const result = await graphql(
      '{ serviceDocs(orgId: "local", serviceId: "orders-api") { doc { fileUrl } } }'
    )
    return (result.data?.serviceDocs as { doc: { fileUrl: string } }[])[0].doc
      .fileUrl
  }

  it('serves registered docs in a sandbox', async () => {
    const response = await fetch(`${origin}${await readGuideUrl()}`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-security-policy')).toBe('sandbox')
    expect(await response.text()).toBe('<h1>Guide</h1>')
  })

  it('does not serve repository files that are not registered', async () => {
    const guideUrl = await readGuideUrl()
    const response = await fetch(
      `${origin}${guideUrl.replace('docs/guide.html', '.uigraph.yaml')}`
    )
    expect(response.status).toBe(404)
  })
})
