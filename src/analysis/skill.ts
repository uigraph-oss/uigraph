const REPOSITORY = 'uigraph-oss/skills'
const SKILL_DIRECTORY = 'skills/uigraph/'

export const SKILL_SOURCE = `github.com/${REPOSITORY}`

async function fetchOk(url: string) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`${url} responded ${response.status}`)
  }
  return response
}

export async function downloadSkill() {
  const tree = (await (
    await fetchOk(
      `https://api.github.com/repos/${REPOSITORY}/git/trees/main?recursive=1`
    )
  ).json()) as {
    sha: string
    truncated: boolean
    tree: { path: string; type: string }[]
  }
  if (tree.truncated) {
    throw new Error(`The file list of ${SKILL_SOURCE} is truncated`)
  }

  const paths = tree.tree
    .filter(
      (entry) => entry.type === 'blob' && entry.path.startsWith(SKILL_DIRECTORY)
    )
    .map((entry) => entry.path)
  const files = new Map<string, string>()
  await Promise.all(
    paths.map(async (filePath) => {
      const response = await fetchOk(
        `https://raw.githubusercontent.com/${REPOSITORY}/${tree.sha}/${filePath}`
      )
      files.set(filePath.slice(SKILL_DIRECTORY.length), await response.text())
    })
  )
  const instructions = files.get('SKILL.md')
  if (instructions === undefined) {
    throw new Error(`${SKILL_SOURCE} has no ${SKILL_DIRECTORY}SKILL.md`)
  }
  return {
    instructions: instructions.replace(/^---\n[\s\S]*?\n---\n/, ''),
    files,
  }
}
