import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import readline from "node:readline"
import type { NormalizedSession, NormalizedTurn, SessionExtractor, ToolCall } from "../core/types.js"
import { pathsEqual } from "../utils/paths.js"

interface SessionIndexEntry {
  id: string
  thread_name: string
  updated_at: string
}

export class CodexExtractor implements SessionExtractor {
  readonly harness = "codex" as const
  readonly name = "OpenAI Codex"

  private getCodexDir(): string {
    return path.join(os.homedir(), ".codex")
  }

  async isAvailable(): Promise<boolean> {
    const codexDir = this.getCodexDir()
    return fs.existsSync(codexDir) && fs.existsSync(path.join(codexDir, "sessions"))
  }

  private async loadSessionIndex(): Promise<Map<string, SessionIndexEntry>> {
    const map = new Map<string, SessionIndexEntry>()
    const indexPath = path.join(this.getCodexDir(), "session_index.jsonl")
    if (!fs.existsSync(indexPath)) return map

    const fileStream = fs.createReadStream(indexPath, { encoding: "utf8" })
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity })

    for await (const line of rl) {
      if (!line.trim()) continue
      try {
        const entry = JSON.parse(line) as SessionIndexEntry
        if (entry.id) {
          map.set(entry.id, entry)
        }
      } catch {
        // ignore malformed lines
      }
    }

    return map
  }

  private findSessionFiles(): string[] {
    const sessionsDir = path.join(this.getCodexDir(), "sessions")
    if (!fs.existsSync(sessionsDir)) return []

    const results: string[] = []
    function walk(dir: string) {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name)
          if (entry.isDirectory()) {
            walk(fullPath)
          } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
            results.push(fullPath)
          }
        }
      } catch {
        // ignore unreadable dirs
      }
    }

    walk(sessionsDir)
    return results
  }

  async findLatestSession(cwd: string): Promise<NormalizedSession | null> {
    const recents = await this.findRecentSessions(cwd, 1)
    return recents[0] || null
  }

  async findRecentSessions(cwd: string, limit = 3): Promise<NormalizedSession[]> {
    const sessionFiles = this.findSessionFiles()
    if (sessionFiles.length === 0) return []

    // Sort by file mtime descending to check newest files first
    sessionFiles.sort((a, b) => {
      try {
        return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs
      } catch {
        return 0
      }
    })

    const indexMap = await this.loadSessionIndex()
    const results: NormalizedSession[] = []

    for (const filePath of sessionFiles) {
      const session = await this.parseSessionFile(filePath, cwd, indexMap)
      if (session) {
        results.push(session)
        if (results.length >= limit) break
      }
    }

    return results
  }

  async getSessionById(id: string): Promise<NormalizedSession | null> {
    const sessionFiles = this.findSessionFiles()
    const indexMap = await this.loadSessionIndex()

    for (const filePath of sessionFiles) {
      if (filePath.includes(id)) {
        const session = await this.parseSessionFile(filePath, undefined, indexMap)
        if (session) return session
      }
    }

    return null
  }

  async parseSessionFile(
    filePath: string,
    targetCwd?: string,
    indexMap?: Map<string, SessionIndexEntry>
  ): Promise<NormalizedSession | null> {
    if (!fs.existsSync(filePath)) return null

    const fileStream = fs.createReadStream(filePath, { encoding: "utf8" })
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity })

    let threadId = ""
    let sessionCwd = ""
    let latestTimestamp = ""
    const turns: NormalizedTurn[] = []

    for await (const line of rl) {
      if (!line.trim()) continue
      try {
        const event = JSON.parse(line)
        const ts = event.timestamp || new Date().toISOString()
        latestTimestamp = ts

        const payload = event.payload
        if (!payload) continue

        // Check thread settings
        if (payload.type === "thread_settings_applied" && payload.thread_settings) {
          if (payload.thread_id) threadId = payload.thread_id
          if (payload.thread_settings.cwd) sessionCwd = payload.thread_settings.cwd
        }

        // Check user message
        if (payload.type === "user_message" || (payload.type === "message" && payload.role === "user")) {
          const content = payload.message || payload.content || ""
          if (content && typeof content === "string") {
            turns.push({
              role: "user",
              timestamp: ts,
              content: content.trim(),
            })
          }
        }

        // Check assistant message
        if (payload.type === "assistant_message" || (payload.type === "message" && payload.role === "assistant")) {
          const content = payload.message || payload.content || ""
          if (content && typeof content === "string") {
            turns.push({
              role: "assistant",
              timestamp: ts,
              content: content.trim(),
            })
          }
        }

        // Check tool execution / calls
        if (payload.type === "tool_call" || payload.type === "tool_execution" || payload.type === "exec_command") {
          const toolName = payload.tool_name || payload.name || payload.type
          const args = payload.args || payload.parameters || {}
          const filesModified: string[] = []

          // detect modified file arguments
          if (args.file_path || args.path || args.TargetFile) {
            filesModified.push(String(args.file_path || args.path || args.TargetFile))
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
        // ignore parse error on individual line
      }
    }

    if (targetCwd && (!sessionCwd || !pathsEqual(sessionCwd, targetCwd))) {
      return null
    }

    // Extract thread ID from filename if missing: rollout-YYYY-MM-DDTHH-MM-SS-<uuid>.jsonl
    if (!threadId) {
      const match = path.basename(filePath).match(/([0-9a-fA-F-]{36})/)
      if (match) threadId = match[1]
    }

    const indexInfo = indexMap?.get(threadId)
    const title = indexInfo?.thread_name

    return {
      harness: "codex",
      sessionId: threadId || path.basename(filePath, ".jsonl"),
      title,
      cwd: sessionCwd || targetCwd || "",
      updatedAt: indexInfo?.updated_at || latestTimestamp || new Date().toISOString(),
      turns,
    }
  }
}
