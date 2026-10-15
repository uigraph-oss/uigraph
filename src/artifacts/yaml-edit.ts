import fs from 'node:fs/promises'
import {
  isMap,
  isScalar,
  isSeq,
  parseDocument,
  stringify,
  type Document,
} from 'yaml'
import { resolveRepositoryFile } from '../analysis/repo-access.js'

export type TextEdit = { start: number; end: number; text: string }
type Range = [number, number, number]

export function applyEdits(source: string, edits: TextEdit[]) {
  return [...edits]
    .sort((a, b) => b.start - a.start)
    .reduce(
      (text, edit) =>
        text.slice(0, edit.start) + edit.text + text.slice(edit.end),
      source
    )
}

export async function readYaml(root: string, file: string) {
  const { realPath } = await resolveRepositoryFile(root, file)
  const source = await fs.readFile(realPath, 'utf8')
  return { source, document: parseDocument(source) }
}

function nodeRange(node: unknown, what: string): Range {
  const range = (node as { range?: Range | null } | null)?.range
  if (range === undefined || range === null) {
    throw new Error(`Cannot locate ${what} in the YAML file`)
  }
  return range
}

function column(source: string, position: number) {
  return position - (source.lastIndexOf('\n', position - 1) + 1)
}

function lineStart(source: string, position: number) {
  return source.lastIndexOf('\n', position - 1) + 1
}

function renderBlock(value: unknown, indent: number) {
  const lines = stringify(value, { lineWidth: 0 }).trimEnd().split('\n')
  return lines
    .map((line, index) => (index === 0 ? line : ' '.repeat(indent) + line))
    .join('\n')
}

export function replaceScalar(node: unknown, value: string | number): TextEdit {
  if (!isScalar(node)) {
    throw new Error(`Expected a YAML scalar to replace with "${value}"`)
  }
  const [start, end] = nodeRange(node, 'a scalar')
  return {
    start,
    end,
    text: stringify(value, { lineWidth: 0 }).trimEnd(),
  }
}

export function replaceItem(
  source: string,
  node: unknown,
  value: unknown
): TextEdit {
  if (!isMap(node) || node.flow === true) {
    throw new Error('Expected a block mapping in the YAML file')
  }
  const [start, end] = nodeRange(node, 'an entry')
  const trailingNewline = source[end - 1] === '\n' ? '\n' : ''
  return {
    start,
    end,
    text: renderBlock(value, column(source, start)) + trailingNewline,
  }
}

export function setField(
  source: string,
  map: unknown,
  key: string,
  value: unknown
): TextEdit {
  if (!isMap(map) || map.flow === true) {
    throw new Error(`Expected a block mapping to set "${key}"`)
  }
  const existing = map.get(key, true)
  if (
    isScalar(existing) &&
    (typeof value === 'string' || typeof value === 'number')
  ) {
    return replaceScalar(existing, value)
  }
  if (existing !== undefined) {
    throw new Error(`Cannot replace the "${key}" field in place`)
  }
  const first = map.items[0]?.key
  if (first === undefined) {
    throw new Error(`Cannot add "${key}" to an empty mapping`)
  }
  const indent = column(source, nodeRange(first, 'a key')[0])
  const end = nodeRange(map, 'a mapping')[1]
  const needsNewline = source[end - 1] === '\n' ? '' : '\n'
  return {
    start: end,
    end,
    text: `${needsNewline}${' '.repeat(indent)}${renderBlock({ [key]: value }, indent)}\n`,
  }
}

export function appendItem(
  source: string,
  document: Document,
  path: (string | number)[],
  value: unknown
): TextEdit {
  const sequence = document.getIn(path, true)
  if (isSeq(sequence) && sequence.flow !== true) {
    const range = nodeRange(sequence, path.join('.'))
    const indent = column(source, range[0])
    const needsNewline = source[range[1] - 1] === '\n' ? '' : '\n'
    return {
      start: range[1],
      end: range[1],
      text: `${needsNewline}${' '.repeat(indent)}- ${renderBlock(value, indent + 2)}\n`,
    }
  }
  const key = path.at(-1)
  if (typeof key !== 'string') {
    throw new Error(`Cannot add an item to ${path.join('.')}`)
  }
  const parent =
    path.length === 1
      ? document.contents
      : document.getIn(path.slice(0, -1), true)
  if (!isMap(parent) || parent.flow === true) {
    throw new Error(`Cannot add an item to ${path.join('.')}`)
  }
  const pair = parent.items.find(
    (item) => isScalar(item.key) && item.key.value === key
  )
  if (pair !== undefined) {
    if (!isSeq(pair.value) || pair.value.items.length > 0) {
      throw new Error(`${path.join('.')} must be a list`)
    }
    const keyColumn = column(source, nodeRange(pair.key, key)[0])
    const [valueStart, end] = nodeRange(pair.value, key)
    return {
      start: source.lastIndexOf(':', valueStart) + 1,
      end,
      text: `\n${' '.repeat(keyColumn + 2)}- ${renderBlock(value, keyColumn + 4)}`,
    }
  }
  return setField(source, parent, key, [value])
}

export function removeItem(
  source: string,
  document: Document,
  path: (string | number)[],
  index: number
): TextEdit {
  const sequence = document.getIn(path, true)
  if (!isSeq(sequence) || sequence.flow === true) {
    throw new Error(`${path.join('.')} must be a block list`)
  }
  const item = sequence.items[index]
  if (item === undefined) {
    throw new Error(`${path.join('.')} has no item ${index}`)
  }
  if (sequence.items.length > 1) {
    const [start, , end] = nodeRange(item, 'an item')
    return { start: lineStart(source, start), end, text: '' }
  }
  const [start, , end] = nodeRange(sequence, path.join('.'))
  const colon = source.lastIndexOf(':', start)
  return { start: colon + 1, end, text: ' []\n' }
}

export function findItemIndex(
  document: Document,
  path: (string | number)[],
  name: string
) {
  const sequence = document.getIn(path, true)
  if (!isSeq(sequence)) {
    throw new Error(`${path.join('.')} must be a list`)
  }
  const index = sequence.items.findIndex(
    (item) => isMap(item) && item.get('name') === name
  )
  if (index === -1) {
    throw new Error(`${path.join('.')} has no entry named "${name}"`)
  }
  return index
}
