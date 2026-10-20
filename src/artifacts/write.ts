import {
  convertReactFlowToC4UiGraph,
  convertReactFlowToSequenceUiGraph,
  convertUiGraphToMermaid,
  isC4ReactFlowDiagram,
  isSequenceDiagram,
} from '@uigraph/sdk'
import type { Edge, Node } from '@xyflow/react'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { isMap, isScalar, stringify, visit, type Node as YamlNode } from 'yaml'
import { listDiagramImages } from './diagram-images.js'
import { contentHash, loadArtifacts, ROOT_CONFIG, slugify } from './load.js'
import {
  appendItem,
  applyEdits,
  readYaml,
  removeItem,
  replaceScalar,
  type TextEdit,
} from './yaml-edit.js'

const MAX_WRITE_BYTES = 2_000_000
export const MAX_UPLOAD_BYTES = 50_000_000

export function isArtifactPath(relativePath: string) {
  return relativePath === ROOT_CONFIG || relativePath.startsWith('.uigraph/')
}

function toArtifactPath(requested: string) {
  const relativePath = path.posix
    .normalize(requested.replaceAll('\\', '/'))
    .replace(/^\.\//, '')
  if (
    path.posix.isAbsolute(relativePath) ||
    relativePath.split('/').includes('..')
  ) {
    throw new Error(`Path must be relative to the repository: ${requested}`)
  }
  if (!isArtifactPath(relativePath) || relativePath.endsWith('/')) {
    throw new Error(
      `Only ${ROOT_CONFIG} and files under .uigraph/ can be written: ${requested}`
    )
  }
  return relativePath
}

export async function deleteArtifactFile(root: string, requested: string) {
  const relativePath = toArtifactPath(requested)
  let current = root
  for (const segment of relativePath.split('/')) {
    current = path.join(current, segment)
    const stat = await fs.lstat(current)
    if (stat.isSymbolicLink()) {
      throw new Error(
        `Refusing to delete through a symbolic link: ${relativePath}`
      )
    }
  }
  await fs.rm(current)
  const artifactRoot = path.join(root, '.uigraph')
  for (
    let directory = path.dirname(current);
    directory.startsWith(`${artifactRoot}${path.sep}`);
    directory = path.dirname(directory)
  ) {
    if ((await fs.readdir(directory)).length > 0) {
      return
    }
    await fs.rmdir(directory)
  }
}

export async function writeArtifactFile(
  root: string,
  requested: string,
  content: string | Buffer
) {
  const relativePath = toArtifactPath(requested)
  const limit = typeof content === 'string' ? MAX_WRITE_BYTES : MAX_UPLOAD_BYTES
  if (Buffer.byteLength(content) > limit) {
    throw new Error(`Content is larger than ${limit} bytes`)
  }

  const segments = relativePath.split('/')
  let current = root
  for (const [index, segment] of segments.entries()) {
    current = path.join(current, segment)
    const isLast = index === segments.length - 1
    const stat = await fs
      .lstat(current)
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') {
          return null
        }
        throw error
      })
    if (stat === null) {
      if (!isLast) {
        await fs.mkdir(current)
      }
      continue
    }
    if (stat.isSymbolicLink()) {
      throw new Error(
        `Refusing to write through a symbolic link: ${relativePath}`
      )
    }
    if (!isLast && !stat.isDirectory()) {
      throw new Error(
        `Not a directory: ${segments.slice(0, index + 1).join('/')}`
      )
    }
    if (isLast && !stat.isFile()) {
      throw new Error(`Not a file: ${relativePath}`)
    }
  }

  const temporary = path.join(
    path.dirname(current),
    `.${path.basename(current)}.${randomUUID()}.tmp`
  )
  await fs.writeFile(temporary, content, { flag: 'wx' })
  await fs.rename(temporary, current)
  return relativePath
}

function exportDiagram(nodes: Node[], edges: Edge[]) {
  if (isC4ReactFlowDiagram(nodes)) {
    return convertReactFlowToC4UiGraph(nodes, edges)
  }
  if (isSequenceDiagram(nodes)) {
    return convertReactFlowToSequenceUiGraph(nodes, edges)
  }
  return convertUiGraphToMermaid({ nodes, edges })
}

export async function saveDiagram(
  root: string,
  configFile: string,
  diagramId: string,
  input: { name?: string | null; content?: string | null }
) {
  const { db, errors } = await loadArtifacts(root, configFile)
  if (errors.length > 0) {
    throw new Error(`The .uigraph artifacts are invalid:\n${errors.join('\n')}`)
  }
  const diagram = db.diagrams.find((d) => d.entity.id === diagramId)
  if (diagram === undefined) {
    throw new Error(`Diagram ${diagramId} not found`)
  }

  const name =
    input.name === undefined || input.name === null || input.name.trim() === ''
      ? diagram.entry.name
      : input.name.trim()
  if (
    db.diagrams.some(
      (d) =>
        d.file === diagram.file &&
        d.entity.id !== diagramId &&
        d.entry.name === name
    )
  ) {
    throw new Error(`Another diagram in ${diagram.file} is named "${name}"`)
  }

  let contextPath = diagram.entry.contextPath
  if (input.content !== undefined && input.content !== null) {
    const parsed = JSON.parse(input.content) as {
      nodes?: Node[]
      edges?: Edge[]
    }
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
      throw new Error('Diagram content must have nodes and edges arrays')
    }
    const next = exportDiagram(parsed.nodes, parsed.edges)
    const previous = exportDiagram(diagram.flow.nodes, diagram.flow.edges)
    if (JSON.stringify(next) !== JSON.stringify(previous)) {
      contextPath ??= path.posix.join(
        path.posix.dirname(diagram.entry.path),
        'context.json'
      )
      await writeArtifactFile(root, diagram.entry.path, next.mermaid)
      await writeArtifactFile(
        root,
        contextPath,
        `${JSON.stringify(next.context, null, 2)}\n`
      )
    }
  }

  if (
    name !== diagram.entry.name ||
    contextPath !== diagram.entry.contextPath
  ) {
    const { source, document } = await readYaml(root, diagram.file)
    const entry = document.getIn(['architectureDiagrams', diagram.index], true)
    if (!isMap(entry) || entry.flow === true) {
      throw new Error(
        `${diagram.file}: architectureDiagrams[${diagram.index}] must be a block mapping`
      )
    }
    const edits: TextEdit[] = []
    if (name !== diagram.entry.name) {
      edits.push(replaceScalar(entry.get('name', true), name))
    }
    if (contextPath !== diagram.entry.contextPath) {
      const pathPair = entry.items.find(
        (pair) => isScalar(pair.key) && pair.key.value === 'path'
      )
      const key = pathPair?.key as YamlNode | undefined
      const value = pathPair?.value as YamlNode | undefined
      if (!key?.range || !value?.range) {
        throw new Error(
          `${diagram.file}: architectureDiagrams[${diagram.index}] has no path`
        )
      }
      const indent = key.range[0] - source.lastIndexOf('\n', key.range[0]) - 1
      edits.push({
        start: value.range[1],
        end: value.range[1],
        text: `\n${' '.repeat(indent)}contextPath: ${stringify(contextPath, { lineWidth: 0 }).trimEnd()}`,
      })
    }
    await writeArtifactFile(root, diagram.file, applyEdits(source, edits))
  }

  const mermaid = await fs.readFile(path.join(root, diagram.entry.path), 'utf8')
  const context =
    contextPath === undefined
      ? ''
      : await fs.readFile(path.join(root, contextPath), 'utf8')
  return {
    id: diagramId,
    name,
    updatedAt: new Date().toISOString(),
    contentHash: contentHash(mermaid, context),
  }
}

export async function createDiagram(
  root: string,
  configFile: string,
  file: string,
  name: string
) {
  const { db, errors } = await loadArtifacts(root, configFile)
  if (errors.length > 0) {
    throw new Error(`The .uigraph artifacts are invalid:\n${errors.join('\n')}`)
  }
  if (db.diagrams.some((d) => d.file === file && d.entry.name === name)) {
    throw new Error(`Another diagram in ${file} is named "${name}"`)
  }
  const base = slugify(name)
  if (base === '') {
    throw new Error('The diagram name must contain a letter or digit')
  }
  let folder = base
  for (
    let suffix = 2;
    await fs.lstat(path.join(root, '.uigraph/diagrams', folder)).then(
      () => true,
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') {
          return false
        }
        throw error
      }
    );
    suffix++
  ) {
    folder = `${base}-${suffix}`
  }

  const entry = {
    name,
    path: `.uigraph/diagrams/${folder}/${folder}.mmd`,
    contextPath: `.uigraph/diagrams/${folder}/context.json`,
  }
  const empty = convertUiGraphToMermaid({ nodes: [], edges: [] })
  await writeArtifactFile(root, entry.path, empty.mermaid)
  await writeArtifactFile(
    root,
    entry.contextPath,
    `${JSON.stringify(empty.context, null, 2)}\n`
  )

  const { source, document } = await readYaml(root, file)
  await writeArtifactFile(
    root,
    file,
    applyEdits(source, [
      appendItem(source, document, ['architectureDiagrams'], entry),
    ])
  )
  return slugify(entry.path)
}

export async function deleteDiagram(
  root: string,
  configFile: string,
  diagramId: string
) {
  const { db, errors } = await loadArtifacts(root, configFile)
  if (errors.length > 0) {
    throw new Error(`The .uigraph artifacts are invalid:\n${errors.join('\n')}`)
  }
  const diagram = db.diagrams.find((d) => d.entity.id === diagramId)
  if (diagram === undefined) {
    throw new Error(`Diagram ${diagramId} not found`)
  }
  const images = await listDiagramImages(root, diagram.entry.path)
  const { source, document } = await readYaml(root, diagram.file)
  await writeArtifactFile(
    root,
    diagram.file,
    applyEdits(source, [
      removeItem(source, document, ['architectureDiagrams'], diagram.index),
    ])
  )
  for (const file of [
    diagram.entry.path,
    diagram.entry.contextPath,
    ...images.map((image) => image.imagePath),
  ]) {
    if (file !== undefined && isArtifactPath(file)) {
      await deleteArtifactFile(root, file)
    }
  }
}

export async function renameDiagramReferences(
  root: string,
  files: string[],
  serviceName: string,
  oldName: string,
  newName: string
) {
  for (const file of files) {
    const { source, document } = await readYaml(root, file)
    const edits: TextEdit[] = []
    visit(document, {
      Map(_, map) {
        if (
          map.get('serviceName') === serviceName &&
          map.get('architectureDiagramName') === oldName
        ) {
          edits.push(
            replaceScalar(map.get('architectureDiagramName', true), newName)
          )
        }
      },
    })
    if (edits.length > 0) {
      await writeArtifactFile(root, file, applyEdits(source, edits))
    }
  }
}
