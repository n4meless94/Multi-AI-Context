import { execa } from "execa"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import type { NormalizedSession, NormalizedTurn, SessionExtractor, ToolCall } from "../core/types.js"
import { pathsEqual } from "../utils/paths.js"

export class OpenCodeExtractor implements SessionExtractor {
  readonly harness = "opencode" as const
  readonly name = "OpenCode"

  private getDbPath(): string {
    return path.join(os.homedir(), ".local", "share", "opencode", "opencode.db")
  }

  async isAvailable(): Promise<boolean> {
    if (fs.existsSync(this.getDbPath())) return true
    try {
      const res = await execa("opencode2", ["--version"])
      return res.exitCode === 0
    } catch {
      return fs.existsSync(path.join(os.homedir(), ".opencode"))
    }
  }

  async findLatestSession(cwd: string): Promise<NormalizedSession | null> {
    // 1. Try direct SQLite database read if available
    const dbSession = await this.findSessionFromDb(cwd)
    if (dbSession) return dbSession

    // 2. Fallback: Attempt export via opencode2 CLI
    try {
      const { stdout } = await execa("opencode2", ["export"], {
        cwd,
        timeout: 5000,
      })
      if (stdout && stdout.trim()) {
        return this.parseExportedJson(stdout, cwd)
      }
    } catch {
      // CLI export failed or timed out
    }

    return null
  }

  async getSessionById(id: string): Promise<NormalizedSession | null> {
    // 1. Try SQLite database by ID
    const dbSession = await this.getSessionByIdFromDb(id)
    if (dbSession) return dbSession

    // 2. Try CLI export by ID
    try {
      const { stdout } = await execa("opencode2", ["export", "--session", id], {
        timeout: 5000,
      })
      if (stdout && stdout.trim()) {
        return this.parseExportedJson(stdout)
      }
    } catch {
      // ignore
    }
    return null
  }

  private async getSqliteDatabase(): Promise<any | null> {
    const dbPath = this.getDbPath()
    if (!fs.existsSync(dbPath)) return null

    try {
      // Use dynamic module name so bundler does not strip the "node:" prefix
      const sqliteModuleName = "node:sqlite"
      const sqliteMod = await import(sqliteModuleName)
      if (sqliteMod.DatabaseSync) {
        return new sqliteMod.DatabaseSync(dbPath, { readOnly: true })
      }
    } catch {
      // node:sqlite not available on older runtimes
    }
    return null
  }

  private async findSessionFromDb(cwd: string): Promise<NormalizedSession | null> {
    const db = await this.getSqliteDatabase()
    if (!db) return null

    try {
      const sessions = db
        .prepare("SELECT id, directory, title, time_updated FROM session ORDER BY time_updated DESC")
        .all() as Array<{ id: string; directory: string; title: string; time_updated: number }>

      const match = sessions.find((s) => s.directory && pathsEqual(s.directory, cwd))
      if (!match) return null

      return this.extractSessionFromDb(db, match.id, match.directory, match.title, match.time_updated)
    } catch {
      return null
    }
  }

  private async getSessionByIdFromDb(id: string): Promise<NormalizedSession | null> {
    const db = await this.getSqliteDatabase()
    if (!db) return null

    try {
      const match = db
        .prepare("SELECT id, directory, title, time_updated FROM session WHERE id = ? LIMIT 1")
        .get(id) as { id: string; directory: string; title: string; time_updated: number } | undefined

      if (!match) return null

      return this.extractSessionFromDb(db, match.id, match.directory, match.title, match.time_updated)
    } catch {
      return null
    }
  }

  private extractSessionFromDb(
    db: any,
    sessionId: string,
    directory: string,
    title: string,
    timeUpdated: number
  ): NormalizedSession {
    const msgs = db
      .prepare("SELECT id, time_created, data FROM message WHERE session_id = ? ORDER BY time_created ASC")
      .all(sessionId) as Array<{ id: string; time_created: number; data: string }>

    const turns: NormalizedTurn[] = []

    for (const m of msgs) {
      let mData: any = {}
      try {
        mData = JSON.parse(m.data)
      } catch {
        // ignore
      }
      const role = mData.role === "assistant" ? "assistant" : "user"

      const parts = db
        .prepare("SELECT id, data FROM part WHERE message_id = ? ORDER BY time_created ASC")
        .all(m.id) as Array<{ id: string; data: string }>

      let text = ""
      const toolCalls: ToolCall[] = []
      const filesModified: string[] = []

      for (const p of parts) {
        try {
          const pData = JSON.parse(p.data)
          if (pData.type === "text" && pData.text) {
            text += (text ? "\n" : "") + pData.text
          }
          if (pData.type === "tool" || pData.name) {
            const name = pData.name || pData.tool || "tool"
            const args = pData.args || pData.input || {}
            toolCalls.push({ name, args })

            // Only track write tools
            const writeTools = new Set(["write_to_file", "replace_file_content", "edit_file", "write", "patch", "apply_diff"])
            if (writeTools.has(name.toLowerCase())) {
              const target = args.path || args.file_path || args.TargetFile
              if (target) filesModified.push(String(target))
            }
          }
        } catch {
          // ignore
        }
      }

      if (text || toolCalls.length > 0) {
        turns.push({
          role,
          timestamp: new Date(m.time_created).toISOString(),
          content: text || `Assistant executed ${toolCalls.map((t) => t.name).join(", ")}`,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          filesModified: filesModified.length > 0 ? filesModified : undefined,
        })
      }
    }

    return {
      harness: "opencode",
      sessionId,
      title: title || (turns.find((t) => t.role === "user")?.content.slice(0, 60)) || "OpenCode Session",
      cwd: directory,
      updatedAt: new Date(timeUpdated).toISOString(),
      turns,
    }
  }

  parseExportedJson(jsonStr: string, defaultCwd = ""): NormalizedSession | null {
    try {
      const data = JSON.parse(jsonStr)
      const turns: NormalizedTurn[] = []

      const sessionId = data.id || data.sessionId || data.session?.id || "opencode-session"
      const sessionCwd = data.cwd || data.session?.cwd || defaultCwd
      const title = data.title || data.session?.title || "OpenCode Session"
      const updatedAt = data.updatedAt || data.updated_at || new Date().toISOString()

      const rawMessages = Array.isArray(data)
        ? data
        : Array.isArray(data.messages)
          ? data.messages
          : Array.isArray(data.turns)
            ? data.turns
            : []

      for (const msg of rawMessages) {
        const role = msg.role === "assistant" ? "assistant" : msg.role === "user" ? "user" : "tool"
        const ts = msg.timestamp || msg.created_at || updatedAt

        let content = ""
        if (typeof msg.content === "string") {
          content = msg.content
        } else if (Array.isArray(msg.content)) {
          content = msg.content
            .map((part: any) => (typeof part === "string" ? part : part?.text || ""))
            .join("\n")
        }

        const toolCalls: ToolCall[] = []
        const filesModified: string[] = []

        if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
          for (const tc of msg.tool_calls) {
            const name = tc.name || tc.function?.name || "tool"
            const args = tc.args || tc.function?.arguments || {}
            const writeTools = new Set(["write_to_file", "replace_file_content", "edit_file", "write", "patch", "apply_diff"])
            if (writeTools.has(name.toLowerCase())) {
              const target = args.path || args.file_path || args.TargetFile
              if (target) filesModified.push(String(target))
            }
            toolCalls.push({ name, args })
          }
        }

        turns.push({
          role,
          timestamp: ts,
          content: content.trim(),
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          filesModified: filesModified.length > 0 ? filesModified : undefined,
        })
      }

      return {
        harness: "opencode",
        sessionId,
        title,
        cwd: sessionCwd,
        updatedAt,
        turns,
      }
    } catch {
      return null
    }
  }
}
