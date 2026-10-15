import { motion } from 'framer-motion'
import Fuse from 'fuse.js'
import { useEffect, useMemo, useState } from 'react'
import { AiOutlineLoading3Quarters } from 'react-icons/ai'
import { FiSearch } from 'react-icons/fi'
import {
  ProviderIcon,
  ProviderIconSection,
} from '../types/provider-icons.types'
import { IconItem } from './icon-item'
import { getProviderBrandIcon } from './provider-brand-icon'

export function IconsSearchView({
  sections,
  searchQuery,
}: {
  sections: ProviderIconSection[]
  searchQuery: string
}) {
  const query = searchQuery.trim()
  const [matches, setMatches] = useState<
    Array<{
      score: number
      cloud: string
      title: string
      category: string
      icon: ProviderIcon
      searchText: string
    }>
  >([])
  const [isSearching, setIsSearching] = useState(false)

  const entries = useMemo(
    () =>
      sections.flatMap((section) =>
        Object.entries(section.categories).flatMap(([category, icons]) =>
          icons.map((icon) => ({
            cloud: section.cloud,
            title: section.title,
            category,
            icon,
            searchText: `${section.cloud} ${section.title} ${category} ${icon.name}`,
          }))
        )
      ),
    [sections]
  )

  const fuse = useMemo(
    () =>
      new Fuse(entries, {
        includeScore: true,
        threshold: 0.3,
        ignoreLocation: true,
        keys: [
          { name: 'icon.name', weight: 0.7 },
          { name: 'category', weight: 0.2 },
          { name: 'searchText', weight: 0.1 },
        ],
      }),
    [entries]
  )

  useEffect(() => {
    if (!query) {
      setMatches([])
      setIsSearching(false)
      return
    }

    setIsSearching(true)

    const timeout = setTimeout(() => {
      setMatches(
        fuse.search(query).map((result) => ({
          score: result.score ?? 1,
          ...result.item,
        }))
      )
      setIsSearching(false)
    }, 180)

    return () => clearTimeout(timeout)
  }, [fuse, query])

  const groupedProviders = useMemo(() => {
    const providersMap = new Map<
      string,
      {
        cloud: string
        title: string
        score: number
        categories: Map<
          string,
          {
            category: string
            score: number
            icons: Array<{ icon: ProviderIcon; score: number }>
          }
        >
      }
    >()

    for (const match of matches) {
      if (!providersMap.has(match.cloud)) {
        providersMap.set(match.cloud, {
          cloud: match.cloud,
          title: match.title,
          score: match.score,
          categories: new Map(),
        })
      }

      const providerEntry = providersMap.get(match.cloud)!
      providerEntry.score = Math.min(providerEntry.score, match.score)

      if (!providerEntry.categories.has(match.category)) {
        providerEntry.categories.set(match.category, {
          category: match.category,
          score: match.score,
          icons: [],
        })
      }

      const categoryEntry = providerEntry.categories.get(match.category)!
      categoryEntry.score = Math.min(categoryEntry.score, match.score)
      categoryEntry.icons.push({
        icon: match.icon,
        score: match.score,
      })
    }

    return Array.from(providersMap.values())
      .map((providerEntry) => ({
        ...providerEntry,
        categories: Array.from(providerEntry.categories.values())
          .map((categoryEntry) => ({
            ...categoryEntry,
            icons: categoryEntry.icons.sort(
              (a, b) =>
                a.score - b.score || a.icon.name.localeCompare(b.icon.name)
            ),
          }))
          .sort(
            (a, b) => a.score - b.score || a.category.localeCompare(b.category)
          ),
      }))
      .sort((a, b) => a.score - b.score || a.title.localeCompare(b.title))
  }, [matches])

  if (isSearching) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
        <AiOutlineLoading3Quarters className="text-muted-foreground size-5 animate-spin" />
        <p className="text-muted-foreground text-sm">Searching icons...</p>
      </div>
    )
  }

  if (groupedProviders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <FiSearch className="text-muted-foreground mb-2 size-8" />
        <p className="text-muted-foreground text-sm">
          No icons found for &quot;{searchQuery}&quot;
        </p>
        <p className="text-muted-foreground text-xs">
          Try a different search term
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-xs">
        {matches.length} result{matches.length !== 1 ? 's' : ''} in{' '}
        {groupedProviders.length} provider
        {groupedProviders.length !== 1 ? 's' : ''}
      </p>

      <motion.div
        className="space-y-3"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: {
            transition: {
              staggerChildren: 0.05,
            },
          },
        }}
      >
        {groupedProviders.map((providerEntry) => (
          <motion.div
            key={providerEntry.cloud}
            className="flex flex-col gap-3"
            variants={{
              hidden: { opacity: 0, y: 6 },
              visible: {
                opacity: 1,
                y: 0,
                transition: { duration: 0.18, ease: 'easeOut' },
              },
            }}
          >
            <div className="border-primary/20 from-primary/10 to-primary/5 w-full rounded-lg border bg-gradient-to-r p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-3xl">
                    {getProviderBrandIcon(providerEntry.cloud)}
                  </span>
                  <div className="text-left">
                    <h3 className="text-foreground text-sm font-semibold">
                      {providerEntry.title}
                    </h3>
                    <p className="text-paragraph text-xs">
                      {providerEntry.categories.reduce(
                        (sum, category) => sum + category.icons.length,
                        0
                      )}{' '}
                      matched icon
                      {providerEntry.categories.reduce(
                        (sum, category) => sum + category.icons.length,
                        0
                      ) !== 1
                        ? 's'
                        : ''}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="animate-in slide-in-from-top-2 flex flex-col gap-2 duration-200">
              {providerEntry.categories.map((categoryEntry) => (
                <div
                  key={`${providerEntry.cloud}:${categoryEntry.category}`}
                  className="flex flex-col gap-1"
                >
                  <div className="group text-secondary-foreground flex h-8 w-full items-center justify-between rounded-md px-3 text-xs font-medium">
                    <span className="truncate capitalize">
                      {categoryEntry.category.replace(/-/g, ' ')}
                    </span>
                    <span className="bg-accent text-paragraph rounded-full px-1.5 py-0.5 text-[10px]">
                      {categoryEntry.icons.length}
                    </span>
                  </div>

                  <div className="border-stock ml-2 flex flex-col gap-1.5 border-l pl-3">
                    {categoryEntry.icons.map((iconEntry) => (
                      <IconItem
                        key={`${providerEntry.cloud}:${categoryEntry.category}:${iconEntry.icon.name}:${iconEntry.icon.relativePath}`}
                        cloud={providerEntry.cloud}
                        icon={iconEntry.icon}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  )
}
