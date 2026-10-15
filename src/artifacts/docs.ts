import fs from 'node:fs/promises'
import path from 'node:path'
import { loadArtifacts, slugify } from './load.js'
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

const DOC_EXTENSIONS: Record<string, string> = {
  pdf: '.pdf',
  html: '.html',
  markdown: '.md',
  txt: '.txt',
}

export async function loadValid(root: string, configFile: string) {
  const { db, errors } = await loadArtifacts(root, configFile)
  if (errors.length > 0) {
    throw new Error(`The .uigraph artifacts are invalid:\n${errors.join('\n')}`)
  }
  return db
}

export async function exists(file: string) {
  return fs.lstat(file).then(
    () => true,
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return false
      }
      throw error
    }
  )
}

export async function createDoc(
  root: string,
  configFile: string,
  file: string,
  input: { name: string; fileType: string; description: string },
  data: Buffer
) {
  const db = await loadValid(root, configFile)
  if (
    [...db.docs, ...db.standaloneDocs].some(
      (doc) => doc.file === file && doc.entry.name === input.name
    )
  ) {
    throw new Error(`Another doc in ${file} is named "${input.name}"`)
  }
  const extension = DOC_EXTENSIONS[input.fileType]
  if (extension === undefined) {
    throw new Error(`Unsupported doc type "${input.fileType}"`)
  }
  const base = slugify(input.name)
  if (base === '') {
    throw new Error('The doc name must contain a letter or digit')
  }
  let docPath = `.uigraph/docs/${base}${extension}`
  for (let suffix = 2; await exists(path.join(root, docPath)); suffix++) {
    docPath = `.uigraph/docs/${base}-${suffix}${extension}`
  }

  await writeArtifactFile(root, docPath, data)
  const { source, document } = await readYaml(root, file)
  const entry = {
    name: input.name,
    path: docPath,
    fileType: input.fileType,
    ...(input.description === '' ? {} : { description: input.description }),
  }
  await writeArtifactFile(
    root,
    file,
    applyEdits(source, [appendItem(source, document, ['docs'], entry)])
  )
  return docPath
}

export async function deleteDoc(
  root: string,
  configFile: string,
  file: string,
  name: string
) {
  const db = await loadValid(root, configFile)
  const allDocs = [...db.docs, ...db.standaloneDocs]
  const doc = allDocs.find((d) => d.file === file && d.entry.name === name)
  if (doc === undefined) {
    throw new Error(`No doc named "${name}" in ${file}`)
  }
  const { source, document } = await readYaml(root, file)
  const index = findItemIndex(document, ['docs'], name)
  await writeArtifactFile(
    root,
    file,
    applyEdits(source, [removeItem(source, document, ['docs'], index)])
  )
  const stillUsed = allDocs.some(
    (d) => d !== doc && d.entry.path === doc.entry.path
  )
  if (isArtifactPath(doc.entry.path) && !stillUsed) {
    await deleteArtifactFile(root, doc.entry.path)
  }
}
