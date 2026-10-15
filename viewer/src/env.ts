import z from 'zod'

const envSchema = z.object({
  GRAPHQL_URL: z.url(),

  VITE_DEPLOY_ENV: z
    .enum(['local', 'development', 'production'])
    .default('production'),

  VITE_FEATURE_DIAGRAM_IMPORT_EXPORT: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),

  VITE_FEATURE_ENABLE_DEMO_TEST_CASES: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),

  VITE_FEATURE_ENABLE_INSIGHTS: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),

  VITE_FEATURE_ENABLE_DEBUG_DIAGRAM_NODE_BOUNDS: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),

  VITE_FEATURE_ENABLE_ENTERPRISE: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
})

export const env = envSchema.parse({
  ...import.meta.env,
  GRAPHQL_URL: `${window.location.origin}/graphql`,
})
