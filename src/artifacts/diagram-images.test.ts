import { describe, expect, it } from 'vitest'
import { createRepo } from '../test-repo.js'
import { listDiagramImages, writeDiagramImage } from './diagram-images.js'

describe('listDiagramImages', () => {
  it.each(['./diagram/a.mmd', 'diagram/a.mmd'])(
    'returns a clean path for %s',
    async (diagramPath) => {
      const root = await createRepo({ 'diagram/images/shot.png': 'png' })
      const images = await listDiagramImages(root, diagramPath)
      expect(images.map((image) => image.imagePath)).toEqual([
        'diagram/images/shot.png',
      ])
    }
  )
})

describe('writeDiagramImage', () => {
  it('saves an upload next to a diagram outside .uigraph', async () => {
    const root = await createRepo({ 'diagram/a.mmd': 'flowchart LR\n' })
    const imagePath = await writeDiagramImage(
      root,
      './diagram/a.mmd',
      'My Shot.png',
      { data: Buffer.from('png'), contentType: 'image/png' }
    )
    expect(imagePath).toBe('diagram/images/my-shot.png')
    const images = await listDiagramImages(root, './diagram/a.mmd')
    expect(images.map((image) => image.imagePath)).toEqual([imagePath])
  })
})
