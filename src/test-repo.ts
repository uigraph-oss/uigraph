import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export const ORDERS_CONFIG = `version: 1
# Orders service
service:
  name: Orders API
  category: backend
  description: Takes orders
apis:
  - name: REST
    type: openapi
    path: .uigraph/apis/openapi.yaml
architectureDiagrams:
  - name: Checkout flow # main flow
    path: .uigraph/diagrams/checkout/checkout.mmd
databases:
  - name: Main
    dialect: postgres
    schemaPath: .uigraph/db/main.sql
queries:
  - name: Recent orders
    database: Main
    queryText: SELECT * FROM orders
`

export const ORDERS_FILES = {
  '.uigraph.yaml': ORDERS_CONFIG,
  '.uigraph/apis/openapi.yaml': `openapi: 3.0.0
paths:
  /orders:
    get:
      operationId: listOrders
      summary: List orders
    post:
      operationId: createOrder
`,
  '.uigraph/diagrams/checkout/checkout.mmd': `flowchart LR
  Web[Web app] --> Api[Orders API]
  Api --> Db[(Orders DB)]
`,
  '.uigraph/db/main.sql': `CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  total INTEGER NOT NULL
);
`,
}

export async function createRepo(files: Record<string, string>) {
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'uigraph-test-'))
  )
  for (const [file, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true })
    await fs.writeFile(path.join(root, file), content)
  }
  return root
}

export function readRepoFile(root: string, file: string) {
  return fs.readFile(path.join(root, file), 'utf8')
}
