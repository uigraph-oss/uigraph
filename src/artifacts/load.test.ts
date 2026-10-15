import { describe, expect, it } from 'vitest'
import { createRepo, ORDERS_CONFIG, ORDERS_FILES } from '../test-repo.js'
import { loadArtifacts, parseDatabaseSchema, slugify } from './load.js'

describe('slugify', () => {
  it('makes lowercase dash-separated ids', () => {
    expect(slugify('  Orders API / v2 ')).toBe('orders-api-v2')
    expect(slugify('***')).toBe('')
  })
})

describe('loadArtifacts', () => {
  it('loads a service with its API, diagram, database and query', async () => {
    const root = await createRepo(ORDERS_FILES)
    const { db, errors } = await loadArtifacts(root)

    expect(errors).toEqual([])
    expect(db.services.map((s) => s.id)).toEqual(['orders-api'])
    expect(db.services[0].stats).toMatchObject({
      endpointCount: 2,
      diagramCount: 1,
      dbTableCount: 1,
    })
    expect(
      db.apiGroups[0].endpoints.map((e) => [e.method, e.path, e.operationId])
    ).toEqual([
      ['GET', '/orders', 'listOrders'],
      ['POST', '/orders', 'createOrder'],
    ])
    expect(db.diagrams[0].entity.id).toBe('checkout')
    expect(db.diagrams[0].flow.nodes.length).toBeGreaterThan(0)
    expect(db.databases[0].serviceDb.tables).toEqual([
      expect.objectContaining({
        name: 'orders',
        columns: [
          expect.objectContaining({ name: 'id', isPrimaryKey: true }),
          expect.objectContaining({ name: 'total', isPrimaryKey: false }),
        ],
      }),
    ])
    expect(db.queries[0].savedQuery).toMatchObject({
      id: 'orders-api-main-recent-orders',
      queryText: 'SELECT * FROM orders',
    })
  })

  it('parses GraphQL and gRPC API files', async () => {
    const root = await createRepo({
      '.uigraph.yaml': `version: 1
service:
  name: Orders API
  category: backend
  description: Takes orders
apis:
  - name: Graph
    type: graphql
    path: schema.graphql
  - name: Rpc
    type: grpc
    path: orders.proto
`,
      'schema.graphql': `type Query {
  "One order"
  order(id: ID!): Order
}
type Mutation {
  cancelOrder(id: ID!, reason: String): Boolean!
}
type Order {
  id: ID!
}
`,
      'orders.proto': `syntax = "proto3";
package shop.v1;
service Orders {
  rpc GetOrder(GetOrderRequest) returns (Order);
  rpc WatchOrders(WatchRequest) returns (stream Order);
}
`,
    })
    const { db, errors } = await loadArtifacts(root)

    expect(errors).toEqual([])
    expect(
      db.apiGroups.flatMap((group) =>
        group.endpoints.map((e) => [e.method, e.path, e.description])
      )
    ).toEqual([
      ['Query', 'order(id: ID!): Order', 'One order'],
      ['Mutation', 'cancelOrder(id: ID!, reason: String): Boolean!', ''],
      ['unary', 'shop.v1.Orders/GetOrder', ''],
      ['server_streaming', 'shop.v1.Orders/WatchOrders', ''],
    ])
  })

  it('reports schema errors with the file and field', async () => {
    const root = await createRepo({
      '.uigraph.yaml': 'version: 2\n',
    })
    const { errors } = await loadArtifacts(root)
    expect(errors).toEqual([
      '.uigraph.yaml: version: Invalid input: expected 1',
    ])
  })

  it('requires a service block for service artifacts', async () => {
    const root = await createRepo({
      '.uigraph.yaml': `version: 1
apis:
  - name: REST
    type: openapi
    path: openapi.yaml
`,
    })
    const { errors } = await loadArtifacts(root)
    expect(errors).toEqual([
      '.uigraph.yaml: apis, dependencies, databases and queries require a service block',
    ])
  })

  it('reports missing files, bad Mermaid and broken queries', async () => {
    const root = await createRepo({
      ...ORDERS_FILES,
      '.uigraph.yaml': ORDERS_CONFIG.replace(
        '.uigraph/apis/openapi.yaml',
        '.uigraph/apis/missing.yaml'
      ).replace(
        'queryText: SELECT * FROM orders',
        `queryText: SELECT 1
    path: .uigraph/queries/one.sql
  - name: Lost
    database: Other
    queryText: SELECT 1`
      ),
      '.uigraph/diagrams/checkout/checkout.mmd': 'this is not mermaid\n',
    })
    const { errors } = await loadArtifacts(root)
    expect(errors).toHaveLength(4)
    expect(errors[0]).toMatch(/^\.uigraph\.yaml: apis\[REST\]: /)
    expect(errors.slice(1)).toEqual([
      '.uigraph.yaml: architectureDiagrams[Checkout flow]: the Mermaid source could not be converted; check its syntax',
      '.uigraph.yaml: queries[Recent orders]: set exactly one of path or queryText',
      '.uigraph.yaml: queries[Lost]: unknown database "Other"',
    ])
  })

  it('rejects a service defined twice', async () => {
    const root = await createRepo({
      ...ORDERS_FILES,
      '.uigraph/services/copy.yaml': `version: 1
service:
  name: Orders API
  category: backend
  description: Copy
`,
    })
    const { errors } = await loadArtifacts(root)
    expect(errors).toEqual([
      '.uigraph/services/copy.yaml: duplicate service "Orders API"',
    ])
  })

  it('refuses files outside the repository', async () => {
    const root = await createRepo({
      ...ORDERS_FILES,
      '.uigraph.yaml': ORDERS_CONFIG.replace(
        '.uigraph/apis/openapi.yaml',
        '../outside.yaml'
      ),
    })
    const { errors } = await loadArtifacts(root)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/^\.uigraph\.yaml: apis\[REST\]: /)
  })
})

describe('parseDatabaseSchema', () => {
  it('maps postgres to the SDK dialect', () => {
    const parsed = parseDatabaseSchema(
      'postgres',
      'CREATE TABLE users (id INTEGER PRIMARY KEY);'
    )
    expect(parsed.sdkDialect).toBe('postgresql')
    expect(parsed.ast.tables.map((t) => t.name)).toEqual(['users'])
  })
})
