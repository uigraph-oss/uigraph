import { z } from 'zod'

export const DIAGRAM_TYPES = [
  'flowchart',
  'sequenceDiagram',
  'stateDiagram-v2',
  'C4Container',
  'C4Component',
] as const

export const MAX_DIAGRAM_CANDIDATES = 15
export const MAX_RECOMMENDED = 8
export const MAX_DOC_CANDIDATES = 10

export const diagramCandidateSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use a kebab-case id')
    .max(48)
    .describe(
      'Kebab-case id. It becomes the diagram directory name under .uigraph/diagrams/.'
    ),
  name: z
    .string()
    .min(1)
    .max(60)
    .describe('Plain display name that says what the diagram shows'),
  type: z.enum(DIAGRAM_TYPES).describe('Mermaid diagram type'),
  summary: z
    .string()
    .min(1)
    .max(160)
    .describe('One line saying what the diagram shows'),
  evidence: z
    .array(z.string().min(1))
    .min(1)
    .max(4)
    .describe(
      'Repository-relative files that prove this flow or structure exists'
    ),
  recommended: z.boolean().describe('Pre-selected for the owner'),
})

export type DiagramCandidate = z.infer<typeof diagramCandidateSchema>

export const docCandidateSchema = z.object({
  path: z
    .string()
    .min(1)
    .describe(
      'Repository-relative path of an existing Markdown or HTML document'
    ),
  name: z
    .string()
    .min(1)
    .max(60)
    .describe('Plain display name, such as "Deployment guide"'),
  summary: z
    .string()
    .min(1)
    .max(160)
    .describe('One line saying what the document covers'),
})

export type DocCandidate = z.infer<typeof docCandidateSchema>

export type PlanSubmission = {
  diagrams: DiagramCandidate[]
  docs: DocCandidate[]
}

export type DiagramSelection = {
  diagrams: DiagramCandidate[]
  docs: DocCandidate[]
  focus: string | null
}

export function findPlanProblems(diagrams: readonly DiagramCandidate[]) {
  const problems: string[] = []
  const seen = new Set<string>()
  for (const { id } of diagrams) {
    if (seen.has(id)) {
      problems.push(`Duplicate id: ${id}`)
    }
    seen.add(id)
  }
  const recommended = diagrams.filter((diagram) => diagram.recommended).length
  if (recommended < 1 || recommended > MAX_RECOMMENDED) {
    problems.push(
      `Mark between 1 and ${MAX_RECOMMENDED} diagrams as recommended (found ${recommended})`
    )
  }
  return problems
}

export function formatApprovedDiagrams(
  selection: DiagramSelection,
  existing: readonly string[]
) {
  const lines: string[] = []
  if (selection.diagrams.length === 0) {
    lines.push(
      'The owner approved no new architecture diagrams. Do not generate any new architecture diagram.'
    )
  } else {
    lines.push(
      'Approved diagrams. Generate exactly these under architectureDiagrams, each at .uigraph/diagrams/<id>/<id>.mmd with a context.json, using the listed Mermaid type. Do not generate any other new diagram:'
    )
    for (const diagram of selection.diagrams) {
      lines.push(
        `- ${diagram.id} | ${diagram.name} | ${diagram.type} | ${diagram.summary} | evidence: ${diagram.evidence.join(', ')}`
      )
    }
  }
  if (selection.docs.length > 0) {
    lines.push(
      'Approved existing documents. Add each one under docs with the listed name and its current path, and set fileType to markdown or html. Do not copy, move, or rewrite these files. This replaces the rule in references/docs.md that existing repository documents are never doc artifacts:'
    )
    for (const doc of selection.docs) {
      lines.push(`- ${doc.path} | ${doc.name} | ${doc.summary}`)
    }
  }
  if (existing.length > 0) {
    lines.push(
      `Diagrams already in the repository (keep them and update them when the code changed): ${existing.join(', ')}.`
    )
  }
  if (selection.focus !== null) {
    lines.push(
      `The owner asked you to focus on: "${selection.focus}". If this names a flow the code shows, add one diagram for it. If the code does not show it, leave it out and say so in your summary. Never invent a flow.`
    )
  }
  return lines.join('\n')
}
