import { Button } from '@/components/ui/button'
import { DashboardPageSectionLayout } from '@/features/dashboard'
import { LuCheck } from 'react-icons/lu'

const PLANS = [
  {
    name: 'Free',
    description: 'Runs locally on your machine.',
    features: [
      'Unlimited projects',
      'Services, APIs, diagrams and docs',
      'Your data stays in your repository',
    ],
    action: null,
  },
  {
    name: 'Cloud',
    description: 'Hosted by UIGraph, ready for your team.',
    features: [
      'Teams and users',
      'AI Assist and ML Studio',
      'Integrations and cloud connections',
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
    features: ['Everything in Cloud', 'SSO', 'Deploy in your own environment'],
    action: {
      label: 'Contact us',
      href: 'https://uigraph.app',
      preset: 'outline',
    },
  },
] as const

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

            <ul className="flex flex-1 flex-col gap-2">
              {plan.features.map((feature) => (
                <li
                  key={feature}
                  className="flex items-center gap-2 text-sm text-[#F4F7FC]"
                >
                  <LuCheck className="text-primary size-4 shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>

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
          </div>
        ))}
      </div>
    </DashboardPageSectionLayout>
  )
}
