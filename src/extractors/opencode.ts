import { execa } from "execa"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import type { NormalizedSession, NormalizedTurn, SessionExtractor, ToolCall } from "../core/types.js"

export class OpenCodeExtractor implements SessionExtractor {
  readonly harness = "opencode" as const
  readonly name = "OpenCode"

  async isAvailable(): Promise<boolean> {
    try {
      const res = await execa("opencode2", ["--version"])
      return res.exitCode === 0
    } catch {
      // Fallback: check if ~/.opencode exists
      return fs.existsSync(path.join(os.homedir(), ".opencode"))
    }
  }

  async findLatestSession(cwd: string): Promise<NormalizedSession | null> {
    try {
      // Attempt to export via opencode2 CLI
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
            if (args.path || args.file_path || args.TargetFile) {
              filesModified.push(String(args.path || args.file_path || args.TargetFile))
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
