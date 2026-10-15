export function SectionGetStarted({ label }: { label: string }) {
  return (
    <div className="border-stock flex min-h-[400px] flex-col items-center justify-center gap-6 rounded-[28px] border border-dashed bg-transparent p-8">
      <p className="text-paragraph/60 text-lg font-medium">{label}</p>
      <ol className="text-paragraph/80 flex flex-col gap-4 text-sm">
        <li>
          1. Install the UIGraph skill for your coding agent:
          <code className="mt-2 block rounded-lg bg-[#1A2030] px-4 py-2 font-mono text-[#5C84FF]">
            npx skills add uigraph-oss/skills
          </code>
        </li>
        <li>
          2. In your repository, ask the agent:
          <code className="mt-2 block rounded-lg bg-[#1A2030] px-4 py-2 font-mono text-[#5C84FF]">
            Generate UIGraph artifacts for this repo
          </code>
        </li>
        <li>3. Your artifacts appear in the viewer.</li>
      </ol>
    </div>
  )
}
