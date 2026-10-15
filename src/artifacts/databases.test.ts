import fs from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createRepo, ORDERS_FILES, readRepoFile } from '../test-repo.js'
import { createDatabase, deleteDatabase } from './databases.js'
import { loadArtifacts } from './load.js'
import { createQuery, deleteQuery, updateQuery } from './queries.js'

const USERS_SQL = 'CREATE TABLE users (id INTEGER PRIMARY KEY);\n'

describe('databases', () => {
  it('adds a database with its schema file', async () => {
    const root = await createRepo({
      ...ORDERS_FILES,
      '.uigraph/db/users.sql': 'taken',
    })
    const schemaPath = await createDatabase(
      root,
      '.uigraph.yaml',
      '.uigraph.yaml',
      { name: 'Users', dialect: 'postgresql' },
      USERS_SQL
    )
    expect(schemaPath).toBe('.uigraph/db/users-2.sql')
    expect(await readRepoFile(root, schemaPath)).toBe(USERS_SQL)
    expect(await readRepoFile(root, '.uigraph.yaml')).toContain(`  - name: Users
    dialect: postgres
    schemaPath: .uigraph/db/users-2.sql
`)
    const { db, errors } = await loadArtifacts(root)
    expect(errors).toEqual([])
    expect(db.databases.map((d) => d.serviceDb.id)).toEqual([
      'orders-api-main',
      'orders-api-users',
    ])
  })

  it('refuses a duplicate name in any letter case', async () => {
    const root = await createRepo(ORDERS_FILES)
    await expect(
      createDatabase(
        root,
        '.uigraph.yaml',
        '.uigraph.yaml',
        { name: 'MAIN', dialect: 'mysql' },
        USERS_SQL
      )
    ).rejects.toThrow('Another database in .uigraph.yaml is named "MAIN"')
  })

  it('refuses an unsupported dialect', async () => {
    const root = await createRepo(ORDERS_FILES)
    await expect(
      createDatabase(
        root,
        '.uigraph.yaml',
        '.uigraph.yaml',
        { name: 'Users', dialect: 'oracle' },
        USERS_SQL
      )
    ).rejects.toThrow('Unsupported database type "oracle"')
  })

  it('keeps a database that queries still use', async () => {
    const root = await createRepo(ORDERS_FILES)
    await expect(
      deleteDatabase(root, '.uigraph.yaml', '.uigraph.yaml', 'Main')
    ).rejects.toThrow('Remove the queries that use "Main" first: Recent orders')

    await deleteQuery(root, '.uigraph.yaml', 'orders-api-main-recent-orders')
    await deleteDatabase(root, '.uigraph.yaml', '.uigraph.yaml', 'Main')

    const text = await readRepoFile(root, '.uigraph.yaml')
    expect(text).toContain('databases: []\n')
    expect(text).toContain('queries: []\n')
    await expect(
      fs.access(path.join(root, '.uigraph/db/main.sql'))
    ).rejects.toThrow('ENOENT')
  })
})

describe('saved queries', () => {
  const input = {
    name: 'Big orders',
    description: '',
    queryText: 'SELECT * FROM orders WHERE total > 100',
    tags: ['reports'],
  }

  it('creates, renames and loads a query', async () => {
    const root = await createRepo(ORDERS_FILES)
    expect(
      await createQuery(root, '.uigraph.yaml', 'orders-api-main', input)
    ).toBe('orders-api-main-big-orders')
    expect(await readRepoFile(root, '.uigraph.yaml'))
      .toContain(`  - name: Big orders
    database: Main
    queryText: SELECT * FROM orders WHERE total > 100
    tags:
      - reports
`)

    expect(
      await updateQuery(root, '.uigraph.yaml', 'orders-api-main-big-orders', {
        ...input,
        name: 'Large orders',
        tags: [],
      })
    ).toBe('orders-api-main-large-orders')

    const { db, errors } = await loadArtifacts(root)
    expect(errors).toEqual([])
    expect(
      db.queries.map((q) => [q.savedQuery.title, q.savedQuery.tags])
    ).toEqual([
      ['Recent orders', []],
      ['Large orders', []],
    ])
  })

  it('refuses a name that is already used on the database', async () => {
    const root = await createRepo(ORDERS_FILES)
    await expect(
      createQuery(root, '.uigraph.yaml', 'orders-api-main', {
        ...input,
        name: 'Recent Orders',
      })
    ).rejects.toThrow('Another query on this database is named "Recent Orders"')
  })

  it('writes the query file when the query lives in its own file', async () => {
    const root = await createRepo({
      ...ORDERS_FILES,
      '.uigraph.yaml': ORDERS_FILES['.uigraph.yaml'].replace(
        'queryText: SELECT * FROM orders',
        'path: .uigraph/queries/recent.sql'
      ),
      '.uigraph/queries/recent.sql': 'SELECT * FROM orders',
    })
    await updateQuery(root, '.uigraph.yaml', 'orders-api-main-recent-orders', {
      ...input,
      name: 'Recent orders',
      queryText: 'SELECT id FROM orders',
    })
    expect(await readRepoFile(root, '.uigraph/queries/recent.sql')).toBe(
      'SELECT id FROM orders'
    )
    expect(await readRepoFile(root, '.uigraph.yaml')).toContain(
      '    path: .uigraph/queries/recent.sql\n'
    )
  })
})
