import { describe, expect, it } from 'vitest'
import { parseDocument, type Document } from 'yaml'
import {
  appendItem,
  applyEdits,
  findItemIndex,
  removeItem,
  replaceItem,
  setField,
  type TextEdit,
} from './yaml-edit.js'

const SOURCE = `# Orders service
version: 1
docs:
  - name: Guide # keep me
    path: guide.md
  - name: Runbook
    path: runbook.md
maps: []
`

function edit(source: string, makeEdit: (document: Document) => TextEdit) {
  return applyEdits(source, [makeEdit(parseDocument(source))])
}

describe('applyEdits', () => {
  it('applies edits in any order', () => {
    expect(
      applyEdits('abcdef', [
        { start: 0, end: 1, text: 'A' },
        { start: 4, end: 6, text: 'EF!' },
      ])
    ).toBe('AbcdEF!')
  })
})

describe('appendItem', () => {
  it('appends to a block list and keeps comments', () => {
    const result = edit(SOURCE, (document) =>
      appendItem(SOURCE, document, ['docs'], { name: 'FAQ', path: 'faq.md' })
    )
    expect(result).toBe(`# Orders service
version: 1
docs:
  - name: Guide # keep me
    path: guide.md
  - name: Runbook
    path: runbook.md
  - name: FAQ
    path: faq.md
maps: []
`)
  })

  it('turns an empty flow list into a block list', () => {
    const result = edit(SOURCE, (document) =>
      appendItem(SOURCE, document, ['maps'], { name: 'Home' })
    )
    expect(result).toBe(`# Orders service
version: 1
docs:
  - name: Guide # keep me
    path: guide.md
  - name: Runbook
    path: runbook.md
maps:
  - name: Home
`)
  })

  it('adds the key when the list is missing', () => {
    const result = edit(SOURCE, (document) =>
      appendItem(SOURCE, document, ['queries'], { name: 'All' })
    )
    expect(result).toBe(`${SOURCE}queries:
  - name: All
`)
  })

  it('refuses a list that is not empty and not a block list', () => {
    const source = 'docs: [a, b]\n'
    expect(() =>
      appendItem(source, parseDocument(source), ['docs'], 'c')
    ).toThrow('docs must be a list')
  })
})

describe('removeItem', () => {
  it('removes one item and keeps the rest', () => {
    const result = edit(SOURCE, (document) =>
      removeItem(SOURCE, document, ['docs'], 0)
    )
    expect(result).toBe(`# Orders service
version: 1
docs:
  - name: Runbook
    path: runbook.md
maps: []
`)
  })

  it('leaves an empty list when the last item is removed', () => {
    const source = 'docs:\n  - name: Guide\n    path: guide.md\nmaps: []\n'
    const result = edit(source, (document) =>
      removeItem(source, document, ['docs'], 0)
    )
    expect(result).toBe('docs: []\nmaps: []\n')
    expect(parseDocument(result).toJSON()).toEqual({ docs: [], maps: [] })
  })

  it('rejects an index that does not exist', () => {
    expect(() =>
      removeItem(SOURCE, parseDocument(SOURCE), ['docs'], 5)
    ).toThrow('docs has no item 5')
  })
})

describe('replaceItem', () => {
  it('replaces one mapping in place', () => {
    const result = edit(SOURCE, (document) =>
      replaceItem(SOURCE, document.getIn(['docs', 1], true), {
        name: 'Runbook v2',
        path: 'runbook-v2.md',
      })
    )
    expect(result).toBe(`# Orders service
version: 1
docs:
  - name: Guide # keep me
    path: guide.md
  - name: Runbook v2
    path: runbook-v2.md
maps: []
`)
  })
})

describe('setField', () => {
  it('replaces an existing scalar', () => {
    const result = edit(SOURCE, (document) =>
      setField(SOURCE, document.contents, 'version', 2)
    )
    expect(result).toBe(SOURCE.replace('version: 1', 'version: 2'))
  })

  it('refuses to replace a list in place', () => {
    expect(() =>
      setField(SOURCE, parseDocument(SOURCE).contents, 'docs', 'x')
    ).toThrow('Cannot replace the "docs" field in place')
  })
})

describe('findItemIndex', () => {
  it('finds an item by name', () => {
    expect(findItemIndex(parseDocument(SOURCE), ['docs'], 'Runbook')).toBe(1)
  })

  it('fails for an unknown name', () => {
    expect(() =>
      findItemIndex(parseDocument(SOURCE), ['docs'], 'Missing')
    ).toThrow('docs has no entry named "Missing"')
  })
})
