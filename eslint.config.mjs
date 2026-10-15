import { fixupConfigRules, fixupPluginRules } from '@eslint/compat'
import { FlatCompat } from '@eslint/eslintrc'
import pluginJs from '@eslint/js'
import checkFile from 'eslint-plugin-check-file'
import _import from 'eslint-plugin-import'
import jsxA11Y from 'eslint-plugin-jsx-a11y'
import prettier from 'eslint-plugin-prettier'
import react from 'eslint-plugin-react'
import reactFunc from 'eslint-plugin-react-func'
import reactHooks from 'eslint-plugin-react-hooks'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { configs, parser } from 'typescript-eslint'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: pluginJs.configs.recommended,
  allConfig: pluginJs.configs.all,
})

export default [
  {
    ignores: [
      '**/.gql',
      '**/dist',
      '**/*.d.ts',
      '**/node_modules',
      './*.{js,mjs,ts,mts}',
      './viewer/public',
      './viewer/src/components/ui/*.{tsx,jsx}',
    ],
  },

  ...configs.recommended,

  ...fixupConfigRules(
    compat.extends(
      'plugin:import/typescript',
      'plugin:jsx-a11y/recommended',
      'plugin:react/recommended',
      'plugin:react-hooks/recommended',
      'plugin:prettier/recommended'
    )
  ),
  {
    plugins: {
      import: fixupPluginRules(_import),
      'jsx-a11y': fixupPluginRules(jsxA11Y),
      react: fixupPluginRules(react),
      'react-func': reactFunc,
      'react-hooks': fixupPluginRules(reactHooks),
      'check-file': checkFile,
      prettier: fixupPluginRules(prettier),
    },

    languageOptions: {
      parser: parser,
      ecmaVersion: 5,
      sourceType: 'module',

      parserOptions: {
        project: ['tsconfig.json', 'viewer/tsconfig.json'],
        tsconfigRootDir: __dirname,
        ecmaFeatures: { jsx: true },
      },
    },

    settings: {
      react: {
        version: 'detect',
      },
    },

    rules: {
      'react/react-in-jsx-scope': 0,
      'no-underscore-dangle': 0,
      'react/jsx-fragments': 0,
      'react/jsx-props-no-spreading': 0,
      'jsx-a11y/no-static-element-interactions': 0,
      'no-plusplus': 0,
      'react/no-danger': 0,
      'no-useless-escape': 0,
      'jsx-a11y/click-events-have-key-events': 0,
      'react/destructuring-assignment': 0,
      'jsx-a11y/label-has-associated-control': 0,
      'react/jsx-no-bind': 0,
      'react/require-default-props': 0,
      'react/button-has-type': 0,
      'react/prop-types': 0,
      '@typescript-eslint/explicit-module-boundary-types': 0,
      'react/jsx-no-constructed-context-values': 0,
      'no-void': 0,
      'symbol-description': 0,
      'consistent-return': 0,

      'prettier/prettier': 1,

      '@typescript-eslint/no-unused-vars': [
        1,
        {
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],

      'no-param-reassign': 2,
      'import/no-default-export': 2,
      '@typescript-eslint/no-floating-promises': 2,
      'prefer-arrow-callback': [2, { allowNamedFunctions: false }],
      'func-style': [2, 'declaration', { allowArrowFunctions: false }],

      '@typescript-eslint/naming-convention': [
        2,
        {
          selector: ['typeLike', 'interface'],
          leadingUnderscore: 'allowSingleOrDouble',
          trailingUnderscore: 'allowSingleOrDouble',
          format: ['PascalCase'],
        },
        {
          selector: 'parameter',
          leadingUnderscore: 'allowSingleOrDouble',
          trailingUnderscore: 'allowSingleOrDouble',
          format: ['camelCase'],
        },
        {
          selector: 'variable',
          leadingUnderscore: 'allowSingleOrDouble',
          trailingUnderscore: 'allowSingleOrDouble',
          format: ['camelCase', 'PascalCase', 'UPPER_CASE'],
        },
      ],

      'check-file/folder-naming-convention': [
        2,
        { '*/**': 'KEBAB_CASE' },
        { ignoreWords: ['__tests__', '__trash__'] },
      ],
      'check-file/filename-naming-convention': [
        2,
        { '**/*.*': 'KEBAB_CASE' },
        { ignoreMiddleExtensions: true },
      ],

      'no-restricted-syntax': [
        'error',
        {
          selector:
            "ImportDeclaration[source.value='react'] > ImportDefaultSpecifier",
          message:
            'Please remove `import React from "react"`, it is not needed.',
        },
      ],

      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@apollo/client',
              importNames: ['gql'],
              message: "✅ Use: import { graphql } from '@/api'",
            },
          ],
        },
      ],
    },
  },
]
