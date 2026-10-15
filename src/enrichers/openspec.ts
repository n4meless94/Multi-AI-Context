import { execa } from "execa"
import fs from "node:fs"
import path from "node:path"
import type { OpenSpecContext } from "../core/types.js"

export class OpenSpecEnricher {
  async getOpenSpecContext(cwd: string = process.cwd()): Promise<OpenSpecContext> {
    const openspecDir = path.join(cwd, "openspec")
    if (!fs.existsSync(openspecDir)) {
      return this.emptyContext()
    }

    try {
      const listRes = await execa("openspec", ["list", "--json"], { cwd, timeout: 5000 })
      const listData = JSON.parse(listRes.stdout)
      const changes = listData.changes || []
      if (!Array.isArray(changes) || changes.length === 0) {
        return {
          hasOpenSpec: true,
          completedTasks: 0,
          totalTasks: 0,
          blockedGates: [],
          summary: "OpenSpec initialized (no active changes)",
        }
      }

      // Pick the first active change
      const activeChangeName = typeof changes[0] === "string" ? changes[0] : changes[0].name || changes[0].id
      if (!activeChangeName) {
        return {
          hasOpenSpec: true,
          completedTasks: 0,
          totalTasks: 0,
          blockedGates: [],
        }
      }

      // Fetch instructions / status for tasks
      const applyRes = await execa("openspec", ["instructions", "apply", "--change", activeChangeName, "--json"], {
        cwd,
        timeout: 5000,
      })
      return this.parseApplyOutput(activeChangeName, applyRes.stdout)
    } catch {
      // Fallback: scan tasks.md manually if CLI fails
      return this.fallbackParseTasksMd(cwd)
    }
  }

  parseApplyOutput(changeName: string, jsonStr: string): OpenSpecContext {
    try {
      const data = JSON.parse(jsonStr)
      const progress = data.progress || {}
      const total = Number(progress.total) || 0
      const complete = Number(progress.complete) || 0
      const blockedGates: string[] = []

      if (data.state === "blocked" && Array.isArray(data.missingArtifacts)) {
        blockedGates.push(...data.missingArtifacts)
      }

      return {
        hasOpenSpec: true,
        activeChange: changeName,
        completedTasks: complete,
        totalTasks: total,
        blockedGates,
        summary: `${complete}/${total} tasks complete${blockedGates.length > 0 ? ` (Blocked by: ${blockedGates.join(", ")})` : ""}`,
      }
    } catch {
      return {
        hasOpenSpec: true,
        activeChange: changeName,
        completedTasks: 0,
        totalTasks: 0,
        blockedGates: [],
      }
    }
  }

  private fallbackParseTasksMd(cwd: string): OpenSpecContext {
    const changesDir = path.join(cwd, "openspec", "changes")
    if (!fs.existsSync(changesDir)) {
      return { hasOpenSpec: true, completedTasks: 0, totalTasks: 0, blockedGates: [] }
    }

    try {
      const entries = fs.readdirSync(changesDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name !== "archive") {
          const tasksFile = path.join(changesDir, entry.name, "tasks.md")
          if (fs.existsSync(tasksFile)) {
            const content = fs.readFileSync(tasksFile, "utf8")
            const totalMatches = content.match(/- \[[ xX]\]/g) || []
            const doneMatches = content.match(/- \[[xX]\]/g) || []
            const total = totalMatches.length
            const complete = doneMatches.length

            return {
              hasOpenSpec: true,
              activeChange: entry.name,
              completedTasks: complete,
              totalTasks: total,
              blockedGates: [],
              summary: `${complete}/${total} tasks complete`,
            }
          }
        }
      }
    } catch {
      // ignore
    }

    return { hasOpenSpec: true, completedTasks: 0, totalTasks: 0, blockedGates: [] }
  }

  private emptyContext(): OpenSpecContext {
    return {
      hasOpenSpec: false,
      completedTasks: 0,
      totalTasks: 0,
      blockedGates: [],
    }
  }
}
