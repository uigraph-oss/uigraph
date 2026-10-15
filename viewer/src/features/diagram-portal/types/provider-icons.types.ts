export interface ProviderIcon {
  cloud: string
  category: string
  subcategory: string | null
  name: string
  fileName: string
  relativePath: string
}

export interface ProviderIconGroup {
  cloud: string
  categories: {
    [category: string]: ProviderIcon[]
  }
}

export interface ProviderIconSection {
  title: string
  cloud: string
  categories: {
    [category: string]: ProviderIcon[]
  }
}
