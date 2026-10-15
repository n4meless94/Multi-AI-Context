import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import readline from "node:readline"
import type { NormalizedSession, NormalizedTurn, SessionExtractor, ToolCall } from "../core/types.js"
import { pathsEqual, slugifyForClaudeCode } from "../utils/paths.js"

export class ClaudeCodeExtractor implements SessionExtractor {
  readonly harness = "claude" as const
  readonly name = "Claude Code"

  private getClaudeDir(): string {
    return path.join(os.homedir(), ".claude")
  }

  async isAvailable(): Promise<boolean> {
    const claudeDir = this.getClaudeDir()
    return fs.existsSync(claudeDir) && fs.existsSync(path.join(claudeDir, "projects"))
  }

  private findProjectDirs(): string[] {
    const projectsDir = path.join(this.getClaudeDir(), "projects")
    if (!fs.existsSync(projectsDir)) return []

    try {
      return fs
        .readdirSync(projectsDir, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => path.join(projectsDir, dirent.name))
    } catch {
      return []
    }
  }

  async findLatestSession(cwd: string): Promise<NormalizedSession | null> {
    const projectDirs = this.findProjectDirs()
    if (projectDirs.length === 0) return null

    const expectedSlug = slugifyForClaudeCode(cwd).toLowerCase()

    // Find directory matching slug
    const matchingDirs = projectDirs.filter((d) => path.basename(d).toLowerCase() === expectedSlug)
    if (matchingDirs.length === 0) return null
    const dirsToScan = matchingDirs

    const allSessionFiles: string[] = []
    for (const dir of dirsToScan) {
      try {
        const files = fs
          .readdirSync(dir)
          .filter((f) => f.endsWith(".jsonl"))
          .map((f) => path.join(dir, f))
        allSessionFiles.push(...files)
      } catch {
        // ignore
      }
    }

    if (allSessionFiles.length === 0) return null

    // Sort by mtime descending
    allSessionFiles.sort((a, b) => {
      try {
        return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs
      } catch {
        return 0
      }
    })

    for (const filePath of allSessionFiles) {
      const session = await this.parseSessionFile(filePath, cwd)
      if (session) return session
    }

    return null
  }

  async getSessionById(id: string): Promise<NormalizedSession | null> {
    const projectDirs = this.findProjectDirs()
    for (const dir of projectDirs) {
      try {
        const files = fs.readdirSync(dir).filter((f) => f.includes(id) && f.endsWith(".jsonl"))
        for (const file of files) {
          const session = await this.parseSessionFile(path.join(dir, file))
          if (session) return session
        }
      } catch {
        // ignore
      }
    }
    return null
  }

  async parseSessionFile(filePath: string, targetCwd?: string): Promise<NormalizedSession | null> {
    if (!fs.existsSync(filePath)) return null

    const fileStream = fs.createReadStream(filePath, { encoding: "utf8" })
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity })

    let sessionId = path.basename(filePath, ".jsonl")
    let sessionCwd = ""
    let latestTimestamp = ""
    let firstUserPrompt = ""
    const turns: NormalizedTurn[] = []

    for await (const line of rl) {
      if (!line.trim()) continue
      try {
        const record = JSON.parse(line)
        const ts = record.timestamp || new Date().toISOString()
        latestTimestamp = ts

        if (record.sessionId) sessionId = record.sessionId
        if (record.cwd) sessionCwd = record.cwd

        // User prompt
        if (record.type === "queue-operation" && record.operation === "enqueue" && record.content) {
          const content = String(record.content).trim()
          if (!firstUserPrompt) firstUserPrompt = content
          turns.push({
            role: "user",
            timestamp: ts,
            content,
          })
        } else if (record.type === "user" || record.role === "user") {
          const content = String(record.content || record.message || "").trim()
          if (content) {
            if (!firstUserPrompt) firstUserPrompt = content
            turns.push({
              role: "user",
              timestamp: ts,
              content,
            })
          }
        }

        // Assistant response
        if (record.type === "assistant" || record.role === "assistant") {
          const content = String(record.content || record.message || "").trim()
          if (content) {
            turns.push({
              role: "assistant",
              timestamp: ts,
              content,
            })
          }
        }

        // Tool actions
        if (record.type === "tool_use" || record.tool_name || record.name) {
          const toolName = record.tool_name || record.name || record.tool || "tool"
          const args = record.args || record.input || {}
          const filesModified: string[] = []

          if (args.path || args.file_path || args.filePath) {
            filesModified.push(String(args.path || args.file_path || args.filePath))
          }

          const toolCall: ToolCall = { name: toolName, args }
          turns.push({
            role: "tool",
            timestamp: ts,
            content: `Tool ${toolName} invoked`,
            toolCalls: [toolCall],
            filesModified: filesModified.length > 0 ? filesModified : undefined,
          })
        }
      } catch {
        // ignore line parse error
      }
    }

    if (targetCwd && sessionCwd && !pathsEqual(sessionCwd, targetCwd)) {
      return null
    }

    return {
      harness: "claude",
      sessionId,
      title: firstUserPrompt.slice(0, 60) || "Claude Code Session",
      cwd: sessionCwd || targetCwd || "",
      updatedAt: latestTimestamp || new Date().toISOString(),
      turns,
    }
  }
}
