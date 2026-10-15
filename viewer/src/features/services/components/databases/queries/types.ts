export type SavedQuery = {
  id: string
  title: string
  description?: string
  queryText: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

export type SaveQueryInput = {
  title: string
  description: string
  queryText: string
  tags: string[]
}
