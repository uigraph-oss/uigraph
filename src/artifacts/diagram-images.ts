import fs from 'node:fs/promises'
import path from 'node:path'
import { exists } from './docs.js'
import { slugify } from './load.js'
import { IMAGE_EXTENSIONS } from './maps.js'
import { writeArtifactFile } from './write.js'

const DIAGRAM_IMAGE_EXTENSIONS: Record<string, string> = {
  ...IMAGE_EXTENSIONS,
  'image/svg+xml': '.svg',
}

function imageDirectory(diagramPath: string) {
  return path.posix.join(path.posix.dirname(diagramPath), 'images')
}

export async function listDiagramImages(root: string, diagramPath: string) {
  const directory = imageDirectory(diagramPath)
  const entries = await fs
    .readdir(path.join(root, directory), { withFileTypes: true })
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return []
      }
      throw error
    })
  const extensions = new Set(Object.values(DIAGRAM_IMAGE_EXTENSIONS))
  const images = []
  for (const entry of entries) {
    if (
      entry.isFile() &&
      extensions.has(path.extname(entry.name).toLowerCase())
    ) {
      const imagePath = `${directory}/${entry.name}`
      const stat = await fs.stat(path.join(root, imagePath))
      images.push({ imagePath, createdAt: stat.birthtime.toISOString() })
    }
  }
  return images.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function writeDiagramImage(
  root: string,
  diagramPath: string,
  fileName: string,
  upload: { data: Buffer; contentType: string }
) {
  const extension = DIAGRAM_IMAGE_EXTENSIONS[upload.contentType]
  if (extension === undefined) {
    throw new Error('Diagram images must be PNG, JPEG, WebP, GIF or SVG files')
  }
  const directory = imageDirectory(diagramPath)
  const base = slugify(path.parse(fileName).name)
  if (base === '') {
    throw new Error('The image file name must contain a letter or digit')
  }
  let imagePath = `${directory}/${base}${extension}`
  for (let suffix = 2; await exists(path.join(root, imagePath)); suffix++) {
    imagePath = `${directory}/${base}-${suffix}${extension}`
  }
  await writeArtifactFile(root, imagePath, upload.data)
  return imagePath
}
