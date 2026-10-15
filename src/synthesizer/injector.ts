import fs from "node:fs"
import path from "node:path"

export const INJECTION_START = "<!-- AI-HANDOFF-START -->"
export const INJECTION_END = "<!-- AI-HANDOFF-END -->"

export class ContextInjector {
  inject(cwd: string = process.cwd(), handoffContent: string): string[] {
    const injectedFiles: string[] = []
    const targets = ["AGENTS.override.md", "CLAUDE.md"]

    const injectionBlock = `\n${INJECTION_START}\n# Active Task Handoff\n> Ingested by ai-handoff at ${new Date().toISOString()}\n\n${handoffContent}\n${INJECTION_END}\n`

    for (const targetName of targets) {
      const targetPath = path.join(cwd, targetName)

      try {
        let content = ""
        if (fs.existsSync(targetPath)) {
          content = fs.readFileSync(targetPath, "utf8")
        }

        // Replace existing block if present
        const regex = new RegExp(`${INJECTION_START}[\\s\\S]*?${INJECTION_END}`, "g")
        if (regex.test(content)) {
          content = content.replace(regex, injectionBlock.trim())
        } else {
          content = `${injectionBlock}\n${content}`.trim() + "\n"
        }

        fs.writeFileSync(targetPath, content, "utf8")
        injectedFiles.push(targetName)
      } catch {
        // ignore write error on specific file
      }
    }

    return injectedFiles
  }

  clear(cwd: string = process.cwd()): { removedHandoff: boolean; cleanedFiles: string[] } {
    let removedHandoff = false
    const cleanedFiles: string[] = []

    // 1. Delete HANDOFF.md if present
    const handoffPath = path.join(cwd, "HANDOFF.md")
    if (fs.existsSync(handoffPath)) {
      try {
        fs.unlinkSync(handoffPath)
        removedHandoff = true
      } catch {
        // ignore
      }
    }

    // 2. Strip injection blocks from instruction files
    const targets = ["AGENTS.override.md", "AGENTS.md", "CLAUDE.md"]
    const regex = new RegExp(`\\n*${INJECTION_START}[\\s\\S]*?${INJECTION_END}\\n*`, "g")

    for (const targetName of targets) {
      const targetPath = path.join(cwd, targetName)
      if (fs.existsSync(targetPath)) {
        try {
          const original = fs.readFileSync(targetPath, "utf8")
          if (regex.test(original)) {
            const cleaned = original.replace(regex, "\n").trim()
            if (!cleaned && targetName === "AGENTS.override.md") {
              // Delete override file if it only contained the handoff
              fs.unlinkSync(targetPath)
            } else {
              fs.writeFileSync(targetPath, cleaned ? `${cleaned}\n` : "", "utf8")
            }
            cleanedFiles.push(targetName)
          }
        } catch {
          // ignore
        }
      }
    }

    return { removedHandoff, cleanedFiles }
  }
}
