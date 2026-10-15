import fs from 'node:fs/promises'
import path from 'node:path'

const EXCLUDED_DIRECTORIES = [
  '.git',
  'node_modules',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.turbo',
  '.cache',
  'coverage',
  'target',
  'vendor',
  '.venv',
  'venv',
  '__pycache__',
  '.terraform',
  '.claude',
]

const SECRET_FILE_PATTERNS = [
  /^\.env(\..+)?$/,
  /\.(pem|key|p12|pfx|jks|keystore|crt|cer|der)$/,
  /^id_(rsa|dsa|ecdsa|ed25519)/,
  /^credentials/,
  /^secrets?\./,
  /^\.npmrc$/,
  /^\.netrc$/,
  /^\.pypirc$/,
  /\.tfstate(\.backup)?$/,
]

const ALLOWED_ENV_FILES = ['.env.example', '.env.sample', '.env.template']

export function isExcludedPath(relativePath: string) {
  const segments = relativePath.split('/')
  if (segments.some((segment) => EXCLUDED_DIRECTORIES.includes(segment))) {
    return true
  }
  const fileName = segments[segments.length - 1]
  if (ALLOWED_ENV_FILES.includes(fileName)) {
    return false
  }
  return SECRET_FILE_PATTERNS.some((pattern) => pattern.test(fileName))
}

export async function resolveRepositoryFile(root: string, requested: string) {
  const normalized = path.posix.normalize(requested.replaceAll('\\', '/'))
  if (
    normalized === '..' ||
    normalized.startsWith('../') ||
    path.isAbsolute(normalized)
  ) {
    throw new Error(`Path must be relative to the repository: ${requested}`)
  }
  const relativePath = normalized.replace(/^\.\//, '')
  if (isExcludedPath(relativePath)) {
    throw new Error(`Path is excluded from analysis: ${relativePath}`)
  }
  const absolutePath = path.join(root, relativePath)
  const realPath = await fs.realpath(absolutePath)
  if (realPath !== root && !realPath.startsWith(root + path.sep)) {
    throw new Error(`Path resolves outside the repository: ${relativePath}`)
  }
  const stat = await fs.stat(realPath)
  return { relativePath, realPath, stat }
}
