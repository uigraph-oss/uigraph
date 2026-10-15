import { randomUUID } from 'node:crypto'

const pending = new Set<string>()
const uploads = new Map<string, { data: Buffer; contentType: string }>()

export function createUpload() {
  const assetId = randomUUID()
  pending.add(assetId)
  return { assetId, uploadUrl: `/uploads/${assetId}` }
}

export function isPendingUpload(assetId: string) {
  return pending.has(assetId)
}

export function storeUpload(
  assetId: string,
  data: Buffer,
  contentType: string
) {
  if (!pending.delete(assetId)) {
    throw new Error(`Unknown upload ${assetId}`)
  }
  uploads.set(assetId, { data, contentType })
}

export function takeUpload(assetId: string) {
  const upload = uploads.get(assetId)
  if (upload === undefined) {
    throw new Error(
      `The upload ${assetId} was not found; upload the file again`
    )
  }
  uploads.delete(assetId)
  return upload
}
