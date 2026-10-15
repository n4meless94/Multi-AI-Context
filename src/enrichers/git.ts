import { execa } from "execa"
import type { GitContext } from "../core/types.js"

export class GitEnricher {
  async getGitContext(cwd: string = process.cwd()): Promise<GitContext> {
    try {
      const isRepoRes = await execa("git", ["rev-parse", "--is-inside-work-tree"], { cwd })
      if (isRepoRes.stdout.trim() !== "true") {
        return this.emptyContext()
      }
    } catch {
      return this.emptyContext()
    }

    let branch = ""
    try {
      const branchRes = await execa("git", ["branch", "--show-current"], { cwd })
      branch = branchRes.stdout.trim()
    } catch {
      // ignore
    }

    const modifiedFiles: string[] = []
    const untrackedFiles: string[] = []

    try {
      const statusRes = await execa("git", ["status", "--porcelain"], { cwd })
      const lines = statusRes.stdout.split("\n")
      for (const line of lines) {
        if (!line.trim()) continue
        const code = line.slice(0, 2)
        const filePath = line.slice(3).trim()
        if (code.includes("?")) {
          untrackedFiles.push(filePath)
        } else {
          modifiedFiles.push(filePath)
        }
      }
    } catch {
      // ignore
    }

    let diffSummary = ""
    try {
      const diffRes = await execa("git", ["diff", "--stat"], { cwd })
      diffSummary = diffRes.stdout.trim()
    } catch {
      // ignore
    }

    const recentCommits: string[] = []
    try {
      const logRes = await execa("git", ["log", "-n", "5", "--oneline"], { cwd })
      for (const line of logRes.stdout.split("\n")) {
        if (line.trim()) recentCommits.push(line.trim())
      }
    } catch {
      // ignore
    }

    return {
      isRepo: true,
      branch: branch || undefined,
      modifiedFiles,
      untrackedFiles,
      diffSummary: diffSummary || undefined,
      recentCommits,
    }
  }

  private emptyContext(): GitContext {
    return {
      isRepo: false,
      modifiedFiles: [],
      untrackedFiles: [],
      recentCommits: [],
    }
  }
}
