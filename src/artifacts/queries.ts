import { loadValid } from './docs.js'
import { slugify } from './load.js'
import {
  deleteArtifactFile,
  isArtifactPath,
  writeArtifactFile,
} from './write.js'
import {
  appendItem,
  applyEdits,
  readYaml,
  removeItem,
  replaceItem,
} from './yaml-edit.js'

type QueryInput = {
  name: string
  description: string
  queryText: string
  tags: string[]
}

async function findDatabase(
  root: string,
  configFile: string,
  serviceDbId: string
) {
  const db = await loadValid(root, configFile)
  const database = db.databases.find((d) => d.serviceDb.id === serviceDbId)
  if (database === undefined) {
    throw new Error(`Database ${serviceDbId} not found`)
  }
  return { db, database }
}

function assertNameFree(
  db: Awaited<ReturnType<typeof loadValid>>,
  serviceDbId: string,
  name: string,
  exceptId: string | null
) {
  const id = slugify(`${serviceDbId}-${name}`)
  if (
    db.queries.some(
      (q) => q.savedQuery.id === id && q.savedQuery.id !== exceptId
    )
  ) {
    throw new Error(`Another query on this database is named "${name}"`)
  }
  return id
}

function optionalFields(input: QueryInput) {
  return {
    ...(input.description === '' ? {} : { description: input.description }),
    ...(input.tags.length === 0 ? {} : { tags: input.tags }),
  }
}

export async function createQuery(
  root: string,
  configFile: string,
  serviceDbId: string,
  input: QueryInput
) {
  const { db, database } = await findDatabase(root, configFile, serviceDbId)
  const id = assertNameFree(db, serviceDbId, input.name, null)
  const { source, document } = await readYaml(root, database.file)
  await writeArtifactFile(
    root,
    database.file,
    applyEdits(source, [
      appendItem(source, document, ['queries'], {
        name: input.name,
        database: database.entry.name,
        queryText: input.queryText,
        ...optionalFields(input),
      }),
    ])
  )
  return id
}

export async function updateQuery(
  root: string,
  configFile: string,
  queryId: string,
  input: QueryInput
) {
  const db = await loadValid(root, configFile)
  const query = db.queries.find((q) => q.savedQuery.id === queryId)
  if (query === undefined) {
    throw new Error(`Query ${queryId} not found`)
  }
  const id = assertNameFree(
    db,
    query.savedQuery.serviceDbId,
    input.name,
    queryId
  )
  const { description, tags, queryText, path, ...rest } = query.entry
  if (path !== undefined) {
    if (!isArtifactPath(path)) {
      throw new Error(
        `The query file ${path} is outside .uigraph and cannot be edited`
      )
    }
    await writeArtifactFile(root, path, input.queryText)
  }
  const { source, document } = await readYaml(root, query.file)
  await writeArtifactFile(
    root,
    query.file,
    applyEdits(source, [
      replaceItem(source, document.getIn(['queries', query.index], true), {
        ...rest,
        name: input.name,
        ...(path === undefined ? { queryText: input.queryText } : { path }),
        ...optionalFields(input),
      }),
    ])
  )
  return id
}

export async function deleteQuery(
  root: string,
  configFile: string,
  queryId: string
) {
  const db = await loadValid(root, configFile)
  const query = db.queries.find((q) => q.savedQuery.id === queryId)
  if (query === undefined) {
    throw new Error(`Query ${queryId} not found`)
  }
  const { source, document } = await readYaml(root, query.file)
  await writeArtifactFile(
    root,
    query.file,
    applyEdits(source, [removeItem(source, document, ['queries'], query.index)])
  )
  const path = query.entry.path
  const stillUsed = db.queries.some((q) => q !== query && q.entry.path === path)
  if (path !== undefined && isArtifactPath(path) && !stillUsed) {
    await deleteArtifactFile(root, path)
  }
}
