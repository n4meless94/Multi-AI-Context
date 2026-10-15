import fs from "node:fs"
import path from "node:path"

export function ensureGitExcluded(cwd: string = process.cwd(), filename = "HANDOFF.md"): boolean {
  const gitDir = path.join(cwd, ".git")
  if (!fs.existsSync(gitDir)) return false

  const infoDir = path.join(gitDir, "info")
  const excludePath = path.join(infoDir, "exclude")

  try {
    if (!fs.existsSync(infoDir)) {
      fs.mkdirSync(infoDir, { recursive: true })
    }

    let currentContent = ""
    if (fs.existsSync(excludePath)) {
      currentContent = fs.readFileSync(excludePath, "utf8")
    }

    const lines = currentContent.split("\n").map((l) => l.trim())
    if (lines.includes(filename)) {
      return true
    }

    const appendText = currentContent.endsWith("\n") || !currentContent
      ? `${filename}\n`
      : `\n${filename}\n`

    fs.appendFileSync(excludePath, appendText, "utf8")
    return true
  } catch {
    return false
  }
}
