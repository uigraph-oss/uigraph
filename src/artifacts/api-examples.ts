import {
  Kind,
  print,
  type DocumentNode,
  type FieldDefinitionNode,
  type InputValueDefinitionNode,
  type TypeNode,
} from 'graphql'

type Json = Record<string, unknown>

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function seedExampleSamples(payload: string) {
  if (['', '{}', 'null', '[]'].includes(payload)) {
    return '[]'
  }
  try {
    return JSON.stringify([JSON.parse(payload)])
  } catch {
    return '[]'
  }
}

function resolveJsonPointer(doc: Json, ref: string) {
  if (!ref.startsWith('#/')) {
    return null
  }
  let current: unknown = doc
  for (const part of ref.slice(2).split('/')) {
    if (!isObject(current) || !(part in current)) {
      return null
    }
    current = current[part]
  }
  return current ?? null
}

function resolveRefsInDoc(doc: Json, value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((child) => resolveRefsInDoc(doc, child))
  }
  if (!isObject(value)) {
    return value
  }
  if (typeof value.$ref === 'string') {
    const resolved = resolveJsonPointer(doc, value.$ref)
    return resolved === null ? value : resolveRefsInDoc(doc, resolved)
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      resolveRefsInDoc(doc, child),
    ])
  )
}

function schemaToExample(schema: unknown, depth: number): unknown {
  if (schema === undefined || schema === null || depth > 6) {
    return null
  }
  if (!isObject(schema)) {
    return schema
  }
  if ('example' in schema) {
    return schema.example
  }
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum[0]
  }
  for (const combiner of ['allOf', 'anyOf', 'oneOf']) {
    const list = schema[combiner]
    if (!Array.isArray(list) || list.length === 0) {
      continue
    }
    if (combiner === 'allOf') {
      const merged: Json = {}
      for (const item of list) {
        if (isObject(item)) {
          Object.assign(merged, item)
        }
      }
      return schemaToExample(merged, depth + 1)
    }
    return schemaToExample(list[0], depth + 1)
  }
  const type = typeof schema.type === 'string' ? schema.type : ''
  if (
    type === 'object' ||
    (schema.properties !== undefined && schema.properties !== null)
  ) {
    const properties = isObject(schema.properties) ? schema.properties : {}
    return Object.fromEntries(
      Object.entries(properties).map(([key, property]) => [
        key,
        schemaToExample(property, depth + 1),
      ])
    )
  }
  if (
    type === 'array' ||
    (schema.items !== undefined && schema.items !== null)
  ) {
    return [schemaToExample(schema.items ?? {}, depth + 1)]
  }
  const format = typeof schema.format === 'string' ? schema.format : ''
  if (type === 'string') {
    if (format === 'email') return 'user@example.com'
    if (format === 'date-time') return '2024-01-01T00:00:00Z'
    if (format === 'date') return '2024-01-01'
    if (format === 'password') return '********'
    if (format === 'uuid') return '00000000-0000-0000-0000-000000000000'
    if (format === 'uri') return 'https://example.com'
    return 'string'
  }
  if (type === 'integer' || type === 'number') {
    return 0
  }
  if (type === 'boolean') {
    return true
  }
  return null
}

function pickContentSchema(content: Json) {
  const json = content['application/json']
  if (isObject(json) && 'schema' in json) {
    return json.schema ?? null
  }
  for (const entry of Object.values(content)) {
    if (isObject(entry) && 'schema' in entry) {
      return entry.schema ?? null
    }
  }
  return null
}

function pickContentExample(content: Json) {
  const json = content['application/json']
  if (!isObject(json)) {
    return null
  }
  if ('example' in json) {
    return json.example ?? null
  }
  if (isObject(json.examples)) {
    for (const example of Object.values(json.examples)) {
      if (isObject(example) && 'value' in example) {
        return example.value ?? null
      }
    }
  }
  return null
}

function normalizeRequestBody(value: unknown) {
  if (value === undefined || value === null) {
    return null
  }
  if (!isObject(value)) {
    return schemaToExample(value, 0)
  }
  if (isObject(value.content)) {
    const example = pickContentExample(value.content)
    if (example !== null) {
      return example
    }
    const schema = pickContentSchema(value.content)
    if (schema !== null) {
      return schemaToExample(schema, 0)
    }
    return null
  }
  return schemaToExample(value, 0)
}

function isHttpStatusKey(key: string) {
  return key === 'default' || /^\d{3}$/.test(key)
}

function normalizeResponses(value: unknown) {
  if (!isObject(value)) {
    return {}
  }
  const examplesByStatus: Json = {}
  for (const [status, entry] of Object.entries(value)) {
    if (!isHttpStatusKey(status) || !isObject(entry)) {
      continue
    }
    let example: unknown = null
    if (isObject(entry.content)) {
      example = pickContentExample(entry.content)
      if (example === null) {
        const schema = pickContentSchema(entry.content)
        if (schema !== null) {
          example = schemaToExample(schema, 0)
        }
      }
    } else if ('example' in entry) {
      example = entry.example
    } else if ('schema' in entry) {
      example = schemaToExample(entry.schema, 0)
    }
    if (example !== undefined && example !== null) {
      examplesByStatus[status] = example
    }
  }
  const examples = Object.values(examplesByStatus)
  if (examples.length === 0) {
    return {}
  }
  if (examples.length === 1) {
    return examples[0]
  }
  return examplesByStatus
}

export function openApiExamples(doc: Json, operation: Json) {
  return {
    requestBody: JSON.stringify(
      normalizeRequestBody(resolveRefsInDoc(doc, operation.requestBody))
    ),
    responses: JSON.stringify(
      normalizeResponses(resolveRefsInDoc(doc, operation.responses))
    ),
  }
}

type GraphQLDefinition = {
  kind: 'Scalar' | 'Enum' | 'Object' | 'Interface' | 'Union' | 'InputObject'
  fields: (FieldDefinitionNode | InputValueDefinitionNode)[]
  enumValues: string[]
  types: string[]
}

export type GraphQLTypes = Map<string, GraphQLDefinition>

type SelectionNode = {
  fieldName: string
  children: SelectionNode[]
  fragments: Map<string, SelectionNode[]>
  isLeaf: boolean
}

export function graphQLTypes(document: DocumentNode): GraphQLTypes {
  const types: GraphQLTypes = new Map(
    ['String', 'ID', 'Int', 'Float', 'Boolean'].map((name) => [
      name,
      { kind: 'Scalar', fields: [], enumValues: [], types: [] },
    ])
  )
  function entry(name: string, kind: GraphQLDefinition['kind']) {
    const existing = types.get(name)
    if (existing !== undefined) {
      return existing
    }
    const created: GraphQLDefinition = {
      kind,
      fields: [],
      enumValues: [],
      types: [],
    }
    types.set(name, created)
    return created
  }
  for (const definition of document.definitions) {
    switch (definition.kind) {
      case Kind.SCALAR_TYPE_DEFINITION:
        entry(definition.name.value, 'Scalar')
        break
      case Kind.OBJECT_TYPE_DEFINITION:
      case Kind.OBJECT_TYPE_EXTENSION:
        entry(definition.name.value, 'Object').fields.push(
          ...(definition.fields ?? [])
        )
        break
      case Kind.INTERFACE_TYPE_DEFINITION:
      case Kind.INTERFACE_TYPE_EXTENSION:
        entry(definition.name.value, 'Interface').fields.push(
          ...(definition.fields ?? [])
        )
        break
      case Kind.INPUT_OBJECT_TYPE_DEFINITION:
      case Kind.INPUT_OBJECT_TYPE_EXTENSION:
        entry(definition.name.value, 'InputObject').fields.push(
          ...(definition.fields ?? [])
        )
        break
      case Kind.ENUM_TYPE_DEFINITION:
      case Kind.ENUM_TYPE_EXTENSION:
        entry(definition.name.value, 'Enum').enumValues.push(
          ...(definition.values ?? []).map((value) => value.name.value)
        )
        break
      case Kind.UNION_TYPE_DEFINITION:
      case Kind.UNION_TYPE_EXTENSION:
        entry(definition.name.value, 'Union').types.push(
          ...(definition.types ?? []).map((type) => type.name.value)
        )
        break
    }
  }
  return types
}

function unwrapNonNull(type: TypeNode) {
  return type.kind === Kind.NON_NULL_TYPE ? type.type : type
}

function baseTypeName(type: TypeNode): string {
  return type.kind === Kind.NAMED_TYPE
    ? type.name.value
    : baseTypeName(type.type)
}

function buildSelectionTree(
  types: GraphQLTypes,
  returnType: TypeNode,
  maxDepth: number,
  visited: Set<string>
): SelectionNode[] {
  const base = baseTypeName(returnType)
  if (visited.has(base)) {
    return []
  }
  visited.add(base)
  try {
    const definition = types.get(base)
    if (
      definition === undefined ||
      definition.kind === 'Scalar' ||
      definition.kind === 'Enum' ||
      maxDepth <= 0
    ) {
      return []
    }
    if (definition.kind === 'Object' || definition.kind === 'Interface') {
      return buildObjectSelection(types, definition, maxDepth, visited)
    }
    if (definition.kind === 'Union') {
      const fragments = new Map<string, SelectionNode[]>()
      for (const member of definition.types.slice(0, 2)) {
        const memberDefinition = types.get(member)
        if (memberDefinition === undefined) {
          continue
        }
        fragments.set(
          member,
          buildObjectSelection(types, memberDefinition, maxDepth - 1, visited)
        )
      }
      return [{ fieldName: '', children: [], fragments, isLeaf: false }]
    }
    return []
  } finally {
    visited.delete(base)
  }
}

function buildObjectSelection(
  types: GraphQLTypes,
  definition: GraphQLDefinition,
  maxDepth: number,
  visited: Set<string>
) {
  const scalars: SelectionNode[] = []
  for (const field of definition.fields) {
    const kind = types.get(baseTypeName(field.type))?.kind
    if (kind === 'Scalar' || kind === 'Enum') {
      scalars.push({
        fieldName: field.name.value,
        children: [],
        fragments: new Map(),
        isLeaf: true,
      })
    }
  }
  const objects: SelectionNode[] = []
  if (maxDepth > 1) {
    for (const field of definition.fields) {
      const kind = types.get(baseTypeName(field.type))?.kind
      if (kind === 'Object' || kind === 'Interface' || kind === 'Union') {
        const children = buildSelectionTree(
          types,
          field.type,
          maxDepth - 1,
          visited
        )
        objects.push({
          fieldName: field.name.value,
          children,
          fragments: new Map(),
          isLeaf: children.length === 0,
        })
      }
    }
  }
  return [...scalars, ...objects]
}

function renderSelectionSet(
  nodes: SelectionNode[],
  indentSpaces: number
): string {
  const indent = ' '.repeat(indentSpaces)
  let out = ''
  for (const [index, node] of nodes.entries()) {
    if (index > 0) {
      out += '\n'
    }
    if (node.fieldName === '' && node.fragments.size > 0) {
      const keys = [...node.fragments.keys()].sort()
      for (const [keyIndex, key] of keys.entries()) {
        if (keyIndex > 0) {
          out += '\n'
        }
        out += `${indent}... on ${key} {\n`
        const child = renderSelectionSet(
          node.fragments.get(key) ?? [],
          indentSpaces + 2
        )
        if (child.trim() !== '') {
          out += `${child}\n`
        }
        out += `${indent}}`
      }
      continue
    }
    out += indent + node.fieldName
    if (node.isLeaf || node.children.length === 0) {
      continue
    }
    const child = renderSelectionSet(node.children, indentSpaces + 2)
    if (child.trim() === '') {
      continue
    }
    out += ` {\n${child}\n${indent}}`
  }
  return out
}

function toPascal(value: string) {
  return value
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter((part) => part !== '')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('')
}

function renderRequestExample(
  kind: string,
  field: FieldDefinitionNode,
  selectionSet: string
) {
  const args = field.arguments ?? []
  const varDefs =
    args.length === 0
      ? ''
      : `(${args.map((arg) => `$${arg.name.value}: ${print(arg.type)}`).join(', ')})`
  const argCalls =
    args.length === 0
      ? ''
      : `(${args.map((arg) => `${arg.name.value}: $${arg.name.value}`).join(', ')})`
  const selection = selectionSet.trim() === '' ? '' : ` {\n${selectionSet}\n  }`
  return `${kind.toLowerCase()} ${toPascal(kind)}${toPascal(field.name.value)}${varDefs} {\n  ${field.name.value}${argCalls}${selection}\n}`
}

function exampleResponseValue(
  types: GraphQLTypes,
  type: TypeNode,
  selection: SelectionNode[],
  depth: number
): unknown {
  const unwrapped = unwrapNonNull(type)
  if (unwrapped.kind === Kind.LIST_TYPE) {
    return [exampleResponseValue(types, unwrapped.type, selection, depth)]
  }
  const base = baseTypeName(unwrapped)
  if (base === 'String' || base === 'ID') return 'example'
  if (base === 'Int') return 123
  if (base === 'Float') return 123.45
  if (base === 'Boolean') return true
  const definition = types.get(base)
  if (definition === undefined) {
    return {}
  }
  if (definition.kind === 'Enum') {
    return definition.enumValues[0] ?? 'ENUM_VALUE'
  }
  if (depth <= 0 || selection.length === 0) {
    return {}
  }
  const [first] = selection
  if (
    selection.length === 1 &&
    first.fieldName === '' &&
    first.fragments.size > 0
  ) {
    const [key] = [...first.fragments.keys()].sort()
    return objectFromSelection(
      types,
      base,
      first.fragments.get(key) ?? [],
      depth - 1
    )
  }
  return objectFromSelection(types, base, selection, depth - 1)
}

function objectFromSelection(
  types: GraphQLTypes,
  baseType: string,
  selection: SelectionNode[],
  depth: number
) {
  const result: Json = {}
  const definition = types.get(baseType)
  if (definition === undefined) {
    return result
  }
  for (const node of selection) {
    if (node.fieldName === '') {
      continue
    }
    const field = definition.fields.find(
      (candidate) => candidate.name.value === node.fieldName
    )
    if (field === undefined) {
      continue
    }
    result[node.fieldName] = exampleResponseValue(
      types,
      field.type,
      node.children,
      depth
    )
  }
  return result
}

export function graphQLExamples(
  types: GraphQLTypes,
  kind: string,
  field: FieldDefinitionNode
) {
  const selection = buildSelectionTree(types, field.type, 10, new Set())
  return {
    requestBody: JSON.stringify({
      query: renderRequestExample(
        kind,
        field,
        renderSelectionSet(selection, 2)
      ),
    }),
    responses: JSON.stringify({
      data: {
        [field.name.value]: exampleResponseValue(
          types,
          field.type,
          selection,
          3
        ),
      },
    }),
  }
}

type ProtoItem = { header: string; body: string | null }

type ProtoMessage = {
  fields: { name: string; typeName: string; isList: boolean }[]
}

export type ProtoTypeIndex = Map<string, ProtoMessage>

const PROTO_SCALARS = [
  'string',
  'bytes',
  'int32',
  'int64',
  'uint32',
  'uint64',
  'sint32',
  'sint64',
  'fixed32',
  'fixed64',
  'sfixed32',
  'sfixed64',
  'float',
  'double',
  'bool',
  'google.protobuf.Timestamp',
  'Timestamp',
]

function protoItems(text: string) {
  const items: ProtoItem[] = []
  let start = 0
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (char === ';') {
      items.push({ header: text.slice(start, index).trim(), body: null })
      start = index + 1
    } else if (char === '{') {
      let depth = 1
      let end = index + 1
      while (end < text.length && depth > 0) {
        if (text[end] === '{') depth++
        if (text[end] === '}') depth--
        end++
      }
      items.push({
        header: text.slice(start, index).trim(),
        body: text.slice(index + 1, end - 1),
      })
      index = end - 1
      start = end
    }
  }
  return items
}

function storeProtoType(
  index: ProtoTypeIndex,
  key: string,
  message: ProtoMessage
) {
  const trimmed = key.replace(/^\./, '').trim()
  if (trimmed !== '' && !index.has(trimmed)) {
    index.set(trimmed, message)
  }
}

function indexProtoMessage(
  index: ProtoTypeIndex,
  pkg: string,
  prefix: string,
  name: string,
  body: string
) {
  const full = prefix === '' ? name : `${prefix}.${name}`
  const items = protoItems(body)
  const message: ProtoMessage = {
    fields: items.flatMap(({ header, body: itemBody }) => {
      const match =
        itemBody === null
          ? /^(?:(repeated|optional|required)\s+)?(\.?[\w.]+)\s+(\w+)\s*=\s*\d+/.exec(
              header
            )
          : null
      if (
        match === null ||
        ['option', 'reserved', 'extensions'].includes(match[2])
      ) {
        return []
      }
      return [
        {
          name: match[3],
          typeName: match[2],
          isList: match[1] === 'repeated',
        },
      ]
    }),
  }
  storeProtoType(index, name, message)
  storeProtoType(index, full, message)
  if (pkg !== '') {
    storeProtoType(index, `${pkg}.${name}`, message)
    storeProtoType(index, `${pkg}.${full}`, message)
  }
  for (const item of items) {
    const nested = /^message\s+(\w+)$/.exec(item.header)
    if (nested !== null && item.body !== null) {
      indexProtoMessage(index, pkg, full, nested[1], item.body)
    }
  }
}

export function protoTypeIndex(text: string, pkg: string) {
  const index: ProtoTypeIndex = new Map()
  const source = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  for (const item of protoItems(source)) {
    const message = /^message\s+(\w+)$/.exec(item.header)
    if (message !== null && item.body !== null) {
      indexProtoMessage(index, pkg, '', message[1], item.body)
    }
  }
  return index
}

function resolveProtoTypeName(index: ProtoTypeIndex, pkg: string, raw: string) {
  const name = raw.replace(/^\./, '').trim()
  if (name === '' || PROTO_SCALARS.includes(name) || index.has(name)) {
    return name
  }
  if (pkg !== '' && index.has(`${pkg}.${name}`)) {
    return `${pkg}.${name}`
  }
  return name
}

function exampleScalar(type: string) {
  if (type === 'string') return 'example'
  if (type === 'bytes') return 'ZXhhbXBsZQ=='
  if (type === 'float' || type === 'double') return 123.45
  if (type === 'bool') return true
  if (type === 'google.protobuf.Timestamp' || type === 'Timestamp') {
    return '2025-01-01T00:00:00Z'
  }
  return 123
}

function exampleValueForType(
  index: ProtoTypeIndex,
  pkg: string,
  typeName: string,
  depth: number
): { value: unknown; ok: boolean } {
  const name = typeName.replace(/^\./, '').trim()
  if (name === '') {
    return { value: {}, ok: false }
  }
  if (PROTO_SCALARS.includes(name)) {
    return { value: exampleScalar(name), ok: true }
  }
  if (depth <= 0) {
    return { value: {}, ok: true }
  }
  const message =
    index.get(name) ??
    (pkg !== '' && !name.includes('.')
      ? index.get(`${pkg}.${name}`)
      : undefined)
  if (message === undefined) {
    return { value: {}, ok: false }
  }
  const result: Json = {}
  for (const field of message.fields) {
    const { value } = exampleValueForType(index, pkg, field.typeName, depth - 1)
    result[field.name] = field.isList ? [value] : value
  }
  return { value: result, ok: true }
}

export function protoExample(
  index: ProtoTypeIndex,
  pkg: string,
  rawType: string
) {
  const { value, ok } = exampleValueForType(
    index,
    pkg,
    resolveProtoTypeName(index, pkg, rawType),
    3
  )
  return ok ? JSON.stringify(value) : '{}'
}
