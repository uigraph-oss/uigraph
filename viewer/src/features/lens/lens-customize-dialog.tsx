import {
  BetterDialogContent,
  BetterDialogProvider,
} from '@/components/better-dialog'
import { DialogTrigger } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { SlidersHorizontalIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  CustomizeFields,
  type LensSettings,
  type RepositoryConfig,
  sameSettings,
} from '@uigraph/lens/ui'
import { useState } from 'react'

export function LensCustomizeDialog(props: {
  settings: LensSettings
  repositoryConfig: RepositoryConfig | null
  saveSettings: (settings: LensSettings) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(props.settings)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rerun = !sameSettings(props.settings, draft)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await props.saveSettings(draft)
      setOpen(false)
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Lens could not save the settings.'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <BetterDialogProvider
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setDraft(props.settings)
          setError(null)
        }
        setOpen(next)
      }}
      trigger={
        <DialogTrigger asChild>
          <button type="button" className="action-button">
            <HugeiconsIcon icon={SlidersHorizontalIcon} aria-hidden="true" />
            Customize
          </button>
        </DialogTrigger>
      }
    >
      <BetterDialogContent
        title="Customize Lens"
        description="Your settings apply to every review on this machine."
        footerCancel
        footerSubmit={saving ? 'Saving' : rerun ? 'Save and run again' : 'Save'}
        footerSubmitLoading={saving}
        onFooterSubmitClick={() => void save()}
      >
        <div className="uigraph-lens">
          <CustomizeFields
            value={draft}
            onChange={setDraft}
            repositoryConfig={props.repositoryConfig}
          />
        </div>
        <p
          role={error ? 'alert' : undefined}
          className={cn('mt-5 text-xs text-[#828DA3]', error && 'text-red-400')}
        >
          {error ??
            (rerun
              ? 'Saving starts a new review. It takes a few minutes.'
              : 'The review does not need to run again.')}
        </p>
      </BetterDialogContent>
    </BetterDialogProvider>
  )
}
