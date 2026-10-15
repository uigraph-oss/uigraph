'use client'

import { BetterDeleteConfirmationModal } from '@/components/better-delete-confirmation-modal'
import {
  BetterDialogContent,
  BetterDialogProvider,
} from '@/components/better-dialog'
import { CodeMirrorRaw } from '@/components/code-mirror'
import { TagList } from '@/components/common/tag-list'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { usePermissions } from '@/hooks/use-permissions'
import { formatDistanceToNow } from 'date-fns'
import { ChevronDown, ChevronUp, Copy, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { FiEdit3 } from 'react-icons/fi'
import { HiOutlineTrash } from 'react-icons/hi2'
import { toast } from 'sonner'
import { ServiceDbSchema } from '../../../api/service-db'
import { DbTypeBadge } from '../components/db-type-badge'
import { SaveQueryInput, SavedQuery } from './types'
import { useSavedQueries } from './use-saved-queries'

type EditState = {
  mode: 'create' | 'update'
  id?: string
}

export function SelectedDatabaseQueriesSection({
  db,
}: {
  db: ServiceDbSchema
}) {
  const { canWrite } = usePermissions()
  const serviceDbId = db.serviceDBId ?? 'unknown'
  const { queries, createQuery, updateQuery, deleteQuery } = useSavedQueries({
    serviceId: db.serviceId ?? 'unknown',
    serviceDbId,
  })

  const [editState, setEditState] = useState<EditState | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [draft, setDraft] = useState<SaveQueryInput>(emptyDraft())
  const [search, setSearch] = useState('')

  const activeQueries = useMemo(
    () => filterQueries(queries, search),
    [queries, search]
  )

  function startCreate() {
    setDraft(emptyDraft())
    setEditState({ mode: 'create' })
  }

  function startUpdate(query: SavedQuery) {
    setDraft({
      title: query.title,
      description: query.description ?? '',
      queryText: query.queryText,
      tags: query.tags,
    })
    setEditState({ mode: 'update', id: query.id })
  }

  function closeEditModal() {
    setEditState(null)
    setDraft(emptyDraft())
  }

  async function handleSave() {
    if (!draft.title.trim()) {
      toast.error('Enter a title for this query')
      return
    }
    if (!draft.queryText.trim()) {
      toast.error('Enter a query before saving')
      return
    }

    try {
      if (editState?.mode === 'update' && editState.id) {
        await updateQuery(editState.id, draft)
        toast.success('Query updated')
      } else {
        await createQuery(draft)
        toast.success('Query saved')
      }
      closeEditModal()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to save query'
      )
    }
  }

  async function handleDelete() {
    if (!deleteId) return
    try {
      await deleteQuery(deleteId)
      setDeleteId(null)
      toast.success('Query deleted')
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete query'
      )
    }
  }

  async function handleCopy(query: SavedQuery) {
    await navigator.clipboard.writeText(query.queryText)
    toast.success('Query copied to clipboard')
  }

  return (
    <div className="m-0 space-y-4 pt-5 pb-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1 rounded-xl border border-[#2A3242] bg-[#141925]/60 px-3 py-2.5">
          <Search className="pointer-events-none absolute top-1/2 left-6 h-4 w-4 -translate-y-1/2 text-[#828DA3]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search queries by title, tag, or text"
            className="h-8 border-0 bg-transparent pl-9 shadow-none focus-visible:ring-0"
          />
        </div>

        <div className="flex items-center gap-2">
          <DbTypeBadge type={db.dbType ?? db.dialect} />
          <Button
            type="button"
            preset="outline"
            disabled={!canWrite}
            onClick={startCreate}
          >
            <Plus className="h-4 w-4" />
            New Query
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {activeQueries.length === 0 ? (
          <QueryEmptyState
            onAdd={startCreate}
            isFiltered={queries.length > 0}
          />
        ) : (
          activeQueries.map((query) => (
            <QueryCard
              key={query.id}
              query={query}
              onCopy={() => handleCopy(query)}
              onEdit={() => startUpdate(query)}
              onDelete={() => setDeleteId(query.id)}
            />
          ))
        )}
      </div>

      <SaveQueryModal
        open={editState !== null}
        title={editState?.mode === 'create' ? 'Save Query' : 'Edit Query'}
        draft={draft}
        onDraftChange={setDraft}
        onSave={handleSave}
        onCancel={closeEditModal}
      />

      <BetterDeleteConfirmationModal
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Delete this query?"
        description="This action cannot be undone."
        onConfirm={async () => handleDelete()}
      />
    </div>
  )
}

function emptyDraft(): SaveQueryInput {
  return { title: '', description: '', queryText: '', tags: [] }
}

function filterQueries(queries: SavedQuery[], search: string): SavedQuery[] {
  const term = search.trim().toLowerCase()
  if (!term) return queries

  return queries.filter((query) =>
    [query.title, query.description ?? '', query.queryText, ...query.tags]
      .join(' ')
      .toLowerCase()
      .includes(term)
  )
}

function QueryEmptyState({
  onAdd,
  isFiltered,
}: {
  onAdd: () => void
  isFiltered: boolean
}) {
  if (isFiltered) {
    return (
      <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-[16px] border border-dashed border-[#2A3242] bg-[#1A2030]/40 px-6 py-10 text-center">
        <Search className="h-10 w-10 text-[#828DA3]" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-[#F4F7FC]">
            No queries match your filters
          </p>
          <p className="max-w-md text-sm text-[#828DA3]">
            Try a different search term or tag.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-[16px] border border-dashed border-[#2A3242] bg-[#1A2030]/40 px-6 py-10 text-center">
      <Search className="h-10 w-10 text-[#828DA3]" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-[#F4F7FC]">No queries yet</p>
        <p className="max-w-md text-sm text-[#828DA3]">
          Saved queries are written to the service&apos;s .uigraph.yaml.
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-primary hover:text-primary mt-1 gap-1.5"
        onClick={onAdd}
      >
        Save your first query
      </Button>
    </div>
  )
}

const COLLAPSED_LINE_THRESHOLD = 8

function QueryCard({
  query,
  onCopy,
  onEdit,
  onDelete,
}: {
  query: SavedQuery
  onCopy: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const lineCount = query.queryText.split('\n').length
  const isLong = lineCount > COLLAPSED_LINE_THRESHOLD

  return (
    <article className="overflow-hidden rounded-[16px] border border-[#2A3242] bg-[#1A2030]/60 shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-[#2A3242] px-4 py-2.5">
        <div className="min-w-0">
          <h4 className="truncate text-sm font-medium text-[#F4F7FC]">
            {query.title}
          </h4>
          {query.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-[#828DA3]">
              {query.description}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-[#828DA3]">
            <span>
              Updated{' '}
              {formatDistanceToNow(new Date(query.updatedAt), {
                addSuffix: true,
              })}
            </span>
            <TagList
              tags={query.tags}
              className="gap-1"
              tagClassName="border-primary/30 bg-primary/10 text-primary-foreground max-w-[140px] rounded-full border px-1.5 py-0.5"
            />
          </div>
        </div>

        <div className="flex shrink-0 gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-[#C5CDDB] hover:text-[#F4F7FC]"
            aria-label={`Copy ${query.title}`}
            onClick={onCopy}
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-[#C5CDDB] hover:text-[#F4F7FC]"
            aria-label={`Edit ${query.title}`}
            onClick={onEdit}
          >
            <FiEdit3 className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-red-500 hover:text-red-400"
            aria-label={`Delete ${query.title}`}
            onClick={onDelete}
          >
            <HiOutlineTrash className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="overflow-hidden">
        <CodeMirrorRaw
          readOnly
          editable={false}
          value={query.queryText}
          maxHeight={expanded ? '480px' : '160px'}
        />
      </div>

      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="flex w-full items-center justify-center gap-1 border-t border-[#2A3242] py-1.5 text-xs text-[#828DA3] transition-colors hover:text-[#C5CDDB]"
        >
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
          {expanded ? 'Show less' : `Show all ${lineCount} lines`}
        </button>
      )}
    </article>
  )
}

function SaveQueryModal({
  open,
  title,
  draft,
  onDraftChange,
  onSave,
  onCancel,
}: {
  open: boolean
  title: string
  draft: SaveQueryInput
  onDraftChange: (draft: SaveQueryInput) => void
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <BetterDialogProvider
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onCancel()
      }}
      className="[--width:42rem]"
    >
      <BetterDialogContent
        title={title}
        footerCancel
        footerSubmit="Save Query"
        onFooterSubmitClick={onSave}
      >
        <div className="space-y-5">
          <div className="space-y-2">
            <Label
              htmlFor="save-query-title"
              className="text-sm font-medium text-[#D2D9E6]"
            >
              Title
            </Label>
            <Input
              id="save-query-title"
              value={draft.title}
              onChange={(e) =>
                onDraftChange({ ...draft, title: e.target.value })
              }
              placeholder="Query title"
              className="h-[48px] rounded-[12px] border border-[#2A3242] bg-[#1E2533] px-4"
            />
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="save-query-description"
              className="text-sm font-medium text-[#D2D9E6]"
            >
              Description
            </Label>
            <Textarea
              id="save-query-description"
              value={draft.description}
              onChange={(e) =>
                onDraftChange({ ...draft, description: e.target.value })
              }
              placeholder="What is this query for? (optional)"
              className="min-h-24 resize-none rounded-[12px] border border-[#2A3242] bg-[#1E2533] px-4 py-3"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-[#D2D9E6]">Query</Label>
            <div className="overflow-hidden rounded-[12px] border border-[#2A3242]">
              <CodeMirrorRaw
                value={draft.queryText}
                minHeight="180px"
                maxHeight="280px"
                onChange={(value) =>
                  onDraftChange({ ...draft, queryText: value })
                }
                placeholder="Paste or write the query"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-[#D2D9E6]">Tags</Label>
            <TagsField
              tags={draft.tags}
              onChange={(tags) => onDraftChange({ ...draft, tags })}
            />
          </div>
        </div>
      </BetterDialogContent>
    </BetterDialogProvider>
  )
}

function TagsField({
  tags,
  onChange,
}: {
  tags: string[]
  onChange: (tags: string[]) => void
}) {
  const [draftTag, setDraftTag] = useState('')

  function addTag() {
    const value = draftTag.trim()
    if (!value || tags.includes(value)) return
    onChange([...tags, value])
    setDraftTag('')
  }

  return (
    <div className="flex min-h-[48px] flex-wrap items-center gap-1.5 rounded-[12px] border border-[#2A3242] bg-[#1E2533] px-3 py-2">
      {tags.map((tag) => (
        <span
          key={tag}
          className="bg-primary text-primary-foreground flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium"
        >
          {tag}
          <button
            type="button"
            onClick={() => onChange(tags.filter((t) => t !== tag))}
            className="text-primary-foreground/80 hover:text-primary-foreground"
            aria-label={`Remove ${tag} tag`}
          >
            ×
          </button>
        </span>
      ))}
      <Input
        value={draftTag}
        onChange={(e) => setDraftTag(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            addTag()
          }
        }}
        onBlur={addTag}
        placeholder={tags.length === 0 ? 'Add tags (press Enter)' : ''}
        className="h-6 min-w-[100px] flex-1 border-0 bg-transparent p-0 text-sm shadow-none outline-none focus-visible:ring-0"
      />
    </div>
  )
}
