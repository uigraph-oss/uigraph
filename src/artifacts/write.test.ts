import fs from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createRepo, ORDERS_FILES, readRepoFile } from '../test-repo.js'
import { loadArtifacts } from './load.js'
import {
  createDiagram,
  deleteArtifactFile,
  deleteDiagram,
  renameDiagramReferences,
  saveDiagram,
  writeArtifactFile,
} from './write.js'

describe('writeArtifactFile', () => {
  it('creates folders under .uigraph', async () => {
    const root = await createRepo({})
    expect(await writeArtifactFile(root, './.uigraph/a/b.txt', 'hi')).toBe(
      '.uigraph/a/b.txt'
    )
    expect(await readRepoFile(root, '.uigraph/a/b.txt')).toBe('hi')
  })

  it.each([
    ['../outside.txt', 'Path must be relative to the repository'],
    ['/etc/passwd', 'Path must be relative to the repository'],
    [
      '.uigraph/../src/index.ts',
      'Only .uigraph.yaml and files under .uigraph/',
    ],
    ['src/index.ts', 'Only .uigraph.yaml and files under .uigraph/'],
    ['.uigraph/', 'Only .uigraph.yaml and files under .uigraph/'],
  ])('refuses %s', async (requested, message) => {
    const root = await createRepo({})
    await expect(writeArtifactFile(root, requested, 'x')).rejects.toThrow(
      message
    )
  })

  it('refuses to write through a symbolic link', async () => {
    const root = await createRepo({})
    const outside = await createRepo({})
    await fs.symlink(outside, path.join(root, '.uigraph'))
    await expect(
      writeArtifactFile(root, '.uigraph/a.txt', 'x')
    ).rejects.toThrow('Refusing to write through a symbolic link')
    await expect(fs.readdir(outside)).resolves.toEqual([])
  })

  it('refuses text larger than 2 MB', async () => {
    const root = await createRepo({})
    await expect(
      writeArtifactFile(root, '.uigraph/big.txt', 'x'.repeat(2_000_001))
    ).rejects.toThrow('Content is larger than 2000000 bytes')
  })
})

describe('deleteArtifactFile', () => {
  it('removes empty folders but keeps .uigraph', async () => {
    const root = await createRepo({ '.uigraph/a/b/c.txt': 'x' })
    await deleteArtifactFile(root, '.uigraph/a/b/c.txt')
    await expect(fs.readdir(path.join(root, '.uigraph'))).resolves.toEqual([])
  })
})

describe('diagrams', () => {
  it('creates a diagram with its own folder', async () => {
    const root = await createRepo({
      ...ORDERS_FILES,
      '.uigraph/diagrams/payments/notes.txt': 'taken',
    })
    expect(
      await createDiagram(root, '.uigraph.yaml', '.uigraph.yaml', 'Payments')
    ).toBe('payments-2')
    expect(await readRepoFile(root, '.uigraph.yaml'))
      .toContain(`  - name: Checkout flow # main flow
    path: .uigraph/diagrams/checkout/checkout.mmd
  - name: Payments
    path: .uigraph/diagrams/payments-2/payments-2.mmd
    contextPath: .uigraph/diagrams/payments-2/context.json
`)
    const { db, errors } = await loadArtifacts(root)
    expect(errors).toEqual([])
    expect(db.diagrams.map((d) => d.entity.id)).toEqual([
      'checkout',
      'payments-2',
    ])
  })

  it('refuses a duplicate diagram name', async () => {
    const root = await createRepo(ORDERS_FILES)
    await expect(
      createDiagram(root, '.uigraph.yaml', '.uigraph.yaml', 'Checkout flow')
    ).rejects.toThrow(
      'Another diagram in .uigraph.yaml is named "Checkout flow"'
    )
  })

  it('renames a diagram without touching the rest of the file', async () => {
    const root = await createRepo(ORDERS_FILES)
    const before = await readRepoFile(root, '.uigraph.yaml')
    const saved = await saveDiagram(root, '.uigraph.yaml', 'checkout', {
      name: '  Checkout v2 ',
    })
    expect(saved.name).toBe('Checkout v2')
    expect(await readRepoFile(root, '.uigraph.yaml')).toBe(
      before.replace('name: Checkout flow # main', 'name: Checkout v2 # main')
    )
  })

  it('saves edited content to Mermaid and a context file', async () => {
    const root = await createRepo(ORDERS_FILES)
    const { db } = await loadArtifacts(root)
    const flow = db.diagrams[0].flow
    await saveDiagram(root, '.uigraph.yaml', 'checkout', {
      content: JSON.stringify({
        nodes: flow.nodes.filter((node) => node.id !== 'Db'),
        edges: flow.edges.filter((edge) => edge.target !== 'Db'),
      }),
    })
    const mermaid = await readRepoFile(
      root,
      '.uigraph/diagrams/checkout/checkout.mmd'
    )
    expect(mermaid).toContain('Api')
    expect(mermaid).not.toContain('Orders DB')
    expect(await readRepoFile(root, '.uigraph.yaml')).toContain(
      '    path: .uigraph/diagrams/checkout/checkout.mmd\n    contextPath: .uigraph/diagrams/checkout/context.json\n'
    )
    const reloaded = await loadArtifacts(root)
    expect(reloaded.errors).toEqual([])
    expect(reloaded.db.diagrams[0].flow.nodes).toHaveLength(2)
  })

  it('deletes a diagram, its files and its images', async () => {
    const root = await createRepo({
      ...ORDERS_FILES,
      '.uigraph/diagrams/checkout/images/shot.png': 'png',
    })
    await deleteDiagram(root, '.uigraph.yaml', 'checkout')
    expect(await readRepoFile(root, '.uigraph.yaml')).toContain(
      'architectureDiagrams: []\n'
    )
    await expect(
      fs.readdir(path.join(root, '.uigraph/diagrams'))
    ).rejects.toThrow('ENOENT')
  })

  it('renames references to a diagram in maps', async () => {
    const root = await createRepo({
      '.uigraph.yaml': `version: 1
maps:
  - name: Store
    frames:
      - name: Cart
        focalPoints:
          - name: Pay
            x: 1
            y: 2
            components:
              - componentId: component_backend-flow-diagram
                serviceName: Orders API
                architectureDiagramName: Checkout flow
              - componentId: component_backend-flow-diagram
                serviceName: Other API
                architectureDiagramName: Checkout flow
`,
    })
    await renameDiagramReferences(
      root,
      ['.uigraph.yaml'],
      'Orders API',
      'Checkout flow',
      'Checkout v2'
    )
    const text = await readRepoFile(root, '.uigraph.yaml')
    expect(text).toContain(`                serviceName: Orders API
                architectureDiagramName: Checkout v2`)
    expect(text).toContain(`                serviceName: Other API
                architectureDiagramName: Checkout flow`)
  })
})
