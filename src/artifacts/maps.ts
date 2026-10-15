import fs from 'node:fs/promises'
import path from 'node:path'
import { isMap } from 'yaml'
import { resolveRepositoryFile } from '../analysis/repo-access.js'
import { exists, loadValid } from './docs.js'
import {
  CANVAS_FILE,
  canvasFileSchema,
  slugify,
  type CanvasFile,
  type MapEntry,
} from './load.js'
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
  replaceItem,
} from './yaml-edit.js'

export const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
}

export async function createMap(
  root: string,
  configFile: string,
  file: string,
  input: { name: string; description: string }
) {
  await loadValid(root, configFile)
  const { source, document } = await readYaml(root, file)
  const entry = {
    name: input.name,
    ...(input.description === '' ? {} : { description: input.description }),
  }
  await writeArtifactFile(
    root,
    file,
    applyEdits(source, [appendItem(source, document, ['maps'], entry)])
  )
}

export async function editMap(
  root: string,
  configFile: string,
  file: string,
  name: string,
  edit: (map: MapEntry) => MapEntry | null
) {
  await loadValid(root, configFile)
  const { source, document } = await readYaml(root, file)
  const index = findItemIndex(document, ['maps'], name)
  const node = document.getIn(['maps', index], true)
  if (!isMap(node)) {
    throw new Error(`maps[${name}] must be a mapping`)
  }
  const next = edit(node.toJSON() as MapEntry)
  const textEdit =
    next === null
      ? removeItem(source, document, ['maps'], index)
      : replaceItem(source, node, next)
  await writeArtifactFile(root, file, applyEdits(source, [textEdit]))
}

export async function editCanvas(
  root: string,
  edit: (canvas: CanvasFile) => void
) {
  const present = await exists(path.join(root, CANVAS_FILE))
  let canvas: CanvasFile = {}
  if (present) {
    const { realPath } = await resolveRepositoryFile(root, CANVAS_FILE)
    canvas = canvasFileSchema.parse(
      JSON.parse(await fs.readFile(realPath, 'utf8'))
    )
  }
  const before = JSON.stringify(canvas)
  edit(canvas)
  if (JSON.stringify(canvas) === before) {
    return
  }
  if (Object.keys(canvas).length === 0) {
    if (present) {
      await deleteArtifactFile(root, CANVAS_FILE)
    }
    return
  }
  await writeArtifactFile(
    root,
    CANVAS_FILE,
    `${JSON.stringify(canvas, null, 2)}\n`
  )
}

export async function retargetLinks(
  root: string,
  from: { map: string; frame?: string },
  to: { map: string; frame?: string } | null
) {
  await editCanvas(root, (canvas) => {
    for (const mapCanvas of Object.values(canvas)) {
      for (const frameCanvas of Object.values(mapCanvas.frames ?? {})) {
        if (frameCanvas.links === undefined) {
          continue
        }
        frameCanvas.links = frameCanvas.links.flatMap((link) => {
          const matches =
            link.map === from.map &&
            (from.frame === undefined || link.frame === from.frame)
          if (!matches) {
            return [link]
          }
          if (to === null) {
            return []
          }
          return [
            {
              ...link,
              map: to.map,
              ...(from.frame === undefined ? {} : { frame: to.frame }),
            },
          ]
        })
      }
    }
  })
}

export async function writeFrameImage(
  root: string,
  mapName: string,
  frameName: string,
  upload: { data: Buffer; contentType: string }
) {
  const extension = IMAGE_EXTENSIONS[upload.contentType]
  if (extension === undefined) {
    throw new Error('Frame images must be PNG, JPEG, WebP or GIF files')
  }
  const directory = `.uigraph/maps/${slugify(mapName)}`
  const base = slugify(frameName)
  let imagePath = `${directory}/${base}${extension}`
  for (let suffix = 2; await exists(path.join(root, imagePath)); suffix++) {
    imagePath = `${directory}/${base}-${suffix}${extension}`
  }
  await writeArtifactFile(root, imagePath, upload.data)
  return imagePath
}

export async function deleteUnusedImages(
  root: string,
  configFile: string,
  imagePaths: string[]
) {
  const db = await loadValid(root, configFile)
  const used = new Set(
    db.maps.flatMap((map) =>
      map.frames.flatMap(({ frame }) => frame.screenshotAssetId ?? [])
    )
  )
  for (const imagePath of imagePaths) {
    if (isArtifactPath(imagePath) && !used.has(imagePath)) {
      await deleteArtifactFile(root, imagePath)
    }
  }
}
