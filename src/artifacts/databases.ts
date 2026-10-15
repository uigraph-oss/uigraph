import path from 'node:path'
import { exists, loadValid } from './docs.js'
import { DATABASE_DIALECTS, parseDatabaseSchema, slugify } from './load.js'
import {
  deleteArtifactFile,
  isArtifactPath,
  writeArtifactFile,
} from './write.js'
import {
  appendItem,
  applyEdits,
  findItemIndex,
  readYaml,
  removeItem,
} from './yaml-edit.js'

const DIALECTS: Record<string, (typeof DATABASE_DIALECTS)[number]> = {
  postgresql: 'postgres',
  postgres: 'postgres',
  mysql: 'mysql',
  sqlite: 'sqlite',
  dynamodb: 'dynamodb',
  mongodb: 'mongodb',
}

export async function createDatabase(
  root: string,
  configFile: string,
  file: string,
  input: { name: string; dialect: string },
  content: string
) {
  const db = await loadValid(root, configFile)
  if (
    db.databases.some(
      (d) =>
        d.file === file &&
        d.entry.name.toLowerCase() === input.name.toLowerCase()
    )
  ) {
    throw new Error(`Another database in ${file} is named "${input.name}"`)
  }
  const dialect = DIALECTS[input.dialect]
  if (dialect === undefined) {
    throw new Error(`Unsupported database type "${input.dialect}"`)
  }
  parseDatabaseSchema(dialect, content)
  const base = slugify(input.name)
  if (base === '') {
    throw new Error('The database name must contain a letter or digit')
  }
  const extension =
    dialect === 'dynamodb' || dialect === 'mongodb' ? '.json' : '.sql'
  let schemaPath = `.uigraph/db/${base}${extension}`
  for (let suffix = 2; await exists(path.join(root, schemaPath)); suffix++) {
    schemaPath = `.uigraph/db/${base}-${suffix}${extension}`
  }

  await writeArtifactFile(root, schemaPath, content)
  const { source, document } = await readYaml(root, file)
  await writeArtifactFile(
    root,
    file,
    applyEdits(source, [
      appendItem(source, document, ['databases'], {
        name: input.name,
        dialect,
        schemaPath,
      }),
    ])
  )
  return schemaPath
}

export async function deleteDatabase(
  root: string,
  configFile: string,
  file: string,
  name: string
) {
  const db = await loadValid(root, configFile)
  const database = db.databases.find(
    (d) => d.file === file && d.entry.name === name
  )
  if (database === undefined) {
    throw new Error(`No database named "${name}" in ${file}`)
  }
  const usedBy = db.queries.filter(
    (q) => q.savedQuery.serviceDbId === database.serviceDb.id
  )
  if (usedBy.length > 0) {
    throw new Error(
      `Remove the queries that use "${name}" first: ${usedBy.map((q) => q.entry.name).join(', ')}`
    )
  }
  const { source, document } = await readYaml(root, file)
  const index = findItemIndex(document, ['databases'], name)
  await writeArtifactFile(
    root,
    file,
    applyEdits(source, [removeItem(source, document, ['databases'], index)])
  )
  const stillUsed = db.databases.some(
    (d) => d !== database && d.entry.schemaPath === database.entry.schemaPath
  )
  if (isArtifactPath(database.entry.schemaPath) && !stillUsed) {
    await deleteArtifactFile(root, database.entry.schemaPath)
  }
}
