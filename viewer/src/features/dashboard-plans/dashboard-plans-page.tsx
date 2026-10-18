import { Button } from '@/components/ui/button'
import { DashboardPageSectionLayout } from '@/features/dashboard'
import { LuCheck } from 'react-icons/lu'

interface FeatureGroup {
  title?: string
  items: readonly string[]
}

interface Plan {
  name: string
  description: string
  groups: readonly FeatureGroup[]
  action: { label: string; href: string; preset: 'primary' | 'outline' } | null
}

const PLANS: readonly Plan[] = [
  {
    name: 'Free',
    description: 'Runs locally on your machine.',
    groups: [
      {
        title: 'Local viewer',
        items: [
          'Unlimited projects in one viewer on your machine',
          'Open source under Apache-2.0',
          'Your data stays in your repository',
        ],
      },
      {
        title: 'Generate with your coding agent',
        items: [
          'UIGraph skill for Claude Code, Codex, OpenCode, Pi and Cursor',
          'Artifacts written to .uigraph.yaml and .uigraph/',
          'Instructions that keep artifacts current as code changes',
        ],
      },
      {
        title: 'Document your system',
        items: [
          'Services with APIs (OpenAPI, GraphQL and gRPC) and dependencies',
          'Mermaid, sequence, state and C4 diagrams, editable in the viewer',
          'Database schemas (SQL and NoSQL) and saved queries',
          'Docs, test packs and maps with frames and points',
        ],
      },
      {
        title: 'Lens reviews',
        items: [
          'Review a GitHub pull request or two branches',
          'Before and after flow diagrams, impact, test coverage and rollout',
          'Customize focus, steps and agent, per repository too',
        ],
      },
    ],
    action: null,
  },
  {
    name: 'Cloud',
    description: 'Hosted by UIGraph, ready for your team.',
    groups: [
      { items: ['Everything in Free'] },
      {
        title: 'Teams and access',
        items: [
          'Organizations, teams and members',
          'Admin, editor and viewer roles',
          'Service accounts and access tokens',
        ],
      },
      {
        title: 'Shared catalog',
        items: [
          'Services, APIs, dependencies and database schemas in a shared catalog',
          'Mermaid, sequence, state and C4 diagrams with version history, thumbnails and comments',
          'Docs, test packs and maps with frames and points, shared with your team',
          'Timeline of decisions, incidents and releases',
        ],
      },
      {
        title: 'Automation',
        items: [
          'Sync from your repository and CI/CD with the UIGraph CLI',
          'Artifacts agent keeps artifacts current with your code',
          'Impact agent reports the blast radius of a pull request',
        ],
      },
      {
        title: 'AI',
        items: [
          'AI Assist chat over your architecture',
          'ML Studio',
          'UIGraph MCP for Cursor, Claude Code, Codex and OpenCode',
        ],
      },
      {
        title: 'Integrations',
        items: [
          'GitHub App for repository import and diagram pull requests',
          'Slack and Figma',
          'Costs and infrastructure from cloud connections',
        ],
      },
    ],
    action: {
      label: 'Try for free',
      href: 'https://console.uigraph.app/signup',
      preset: 'primary',
    },
  },
  {
    name: 'Self-hosted / Enterprise',
    description: 'Run UIGraph on your own infrastructure.',
    groups: [
      { items: ['Everything in Cloud'] },
      {
        title: 'Identity and access',
        items: [
          'Single sign-on with OIDC, OAuth 2.0 and SAML 2.0',
          'Microsoft Entra ID, Okta and generic OIDC providers',
          'Domain-based organization discovery',
          'Role mapping from identity provider attributes',
          'Server administration for users and organizations',
        ],
      },
      {
        title: 'Deploy in your own environment',
        items: [
          'Docker Compose stack with API, GraphQL, gateway and UI',
          'Bundled Postgres, Redis and MinIO, or your own managed services',
          'S3, GCS or MinIO object storage',
          'Automatic migrations and first-run admin bootstrap',
          'You control upgrades, backups and monitoring',
        ],
      },
      {
        title: 'Data and AI control',
        items: [
          'Your data stays in your own database and storage',
          'Bring your own AI model provider, including OpenAI-compatible endpoints',
          'Slack bot that answers architecture questions with your model',
        ],
      },
    ],
    action: {
      label: 'Contact us',
      href: 'https://uigraph.app',
      preset: 'outline',
    },
  },
]

export function DashboardPlansPage() {
  return (
    <DashboardPageSectionLayout
      crumbs={[{ to: '/plans', label: 'Plans' }]}
      title="Plans"
      description="Compare the local version with UIGraph Cloud and self-hosted UIGraph."
    >
      <div className="grid gap-4 md:grid-cols-3">
        {PLANS.map((plan) => (
          <div
            key={plan.name}
            className="border-stock bg-card flex flex-col gap-4 rounded-[0.75rem] border p-5"
          >
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-[#F4F7FC]">
                {plan.name}
              </h3>
              <p className="text-paragraph text-sm">{plan.description}</p>
            </div>

            {plan.action ? (
              <Button asChild preset={plan.action.preset}>
                <a
                  href={plan.action.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {plan.action.label}
                </a>
              </Button>
            ) : (
              <p className="text-paragraph flex h-[2.7938125rem] items-center justify-center text-sm">
                Current plan
              </p>
            )}

            <div className="flex flex-1 flex-col gap-4">
              {plan.groups.map((group, index) => (
                <div key={group.title ?? index} className="space-y-2">
                  {group.title ? (
                    <h4 className="text-paragraph text-xs font-medium tracking-wide uppercase">
                      {group.title}
                    </h4>
                  ) : null}
                  <ul className="flex flex-col gap-2">
                    {group.items.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-start gap-2 text-sm text-[#F4F7FC]"
                      >
                        <LuCheck className="text-primary mt-0.5 size-4 shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </DashboardPageSectionLayout>
  )
}
