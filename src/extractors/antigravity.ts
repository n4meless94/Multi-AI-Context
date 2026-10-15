import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import readline from "node:readline"
import type { NormalizedSession, NormalizedTurn, SessionExtractor, ToolCall } from "../core/types.js"
import { pathsEqual } from "../utils/paths.js"

export class AntigravityExtractor implements SessionExtractor {
  readonly harness = "antigravity" as const
  readonly name = "Google Antigravity"

  private getBrainDir(): string {
    return path.join(os.homedir(), ".gemini", "antigravity", "brain")
  }

  async isAvailable(): Promise<boolean> {
    const brainDir = this.getBrainDir()
    return fs.existsSync(brainDir)
  }

  private findTranscriptFiles(): string[] {
    const brainDir = this.getBrainDir()
    if (!fs.existsSync(brainDir)) return []

    try {
      const convDirs = fs
        .readdirSync(brainDir, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory() && dirent.name !== "tempmediaStorage")
        .map((dirent) => path.join(brainDir, dirent.name))

      const transcripts: string[] = []
      for (const dir of convDirs) {
        const transcriptPath = path.join(dir, ".system_generated", "logs", "transcript.jsonl")
        if (fs.existsSync(transcriptPath)) {
          transcripts.push(transcriptPath)
        }
      }
      return transcripts
    } catch {
      return []
    }
  }

  async findLatestSession(cwd: string): Promise<NormalizedSession | null> {
    const transcripts = this.findTranscriptFiles()
    if (transcripts.length === 0) return null

    // Sort by mtime descending
    transcripts.sort((a, b) => {
      try {
        return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs
      } catch {
        return 0
      }
    })

    for (const filePath of transcripts) {
      const session = await this.parseSessionFile(filePath, cwd)
      if (session) return session
    }

    return null
  }

  async getSessionById(id: string): Promise<NormalizedSession | null> {
    const transcripts = this.findTranscriptFiles()
    for (const filePath of transcripts) {
      if (filePath.includes(id)) {
        const session = await this.parseSessionFile(filePath)
        if (session) return session
      }
    }
    return null
  }

  async parseSessionFile(filePath: string, targetCwd?: string): Promise<NormalizedSession | null> {
    if (!fs.existsSync(filePath)) return null

    // Path structure: .../brain/<conv-id>/.system_generated/logs/transcript.jsonl
    const parts = filePath.split(/[\\/]/)
    const sysGenIdx = parts.lastIndexOf(".system_generated")
    let convId = "antigravity-session"
    if (sysGenIdx > 0) {
      convId = parts[sysGenIdx - 1]
    } else {
      const brainIdx = parts.lastIndexOf("brain")
      if (brainIdx !== -1 && parts[brainIdx + 1]) {
        convId = parts[brainIdx + 1]
      }
    }

    const fileStream = fs.createReadStream(filePath, { encoding: "utf8" })
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity })

    let sessionCwd = ""
    let latestTimestamp = ""
    let firstUserPrompt = ""
    const turns: NormalizedTurn[] = []

    for await (const line of rl) {
      if (!line.trim()) continue
      try {
        const step = JSON.parse(line)
        const ts = step.created_at || new Date().toISOString()
        latestTimestamp = ts

        // Check metadata in initial step
        if (step.content && typeof step.content === "string") {
          const cwdMatch = step.content.match(/Command Working Directory:\s*([^\r\n]+)/)
          if (cwdMatch) sessionCwd = cwdMatch[1].trim()

          const wsMatch = step.content.match(/Active Workspaces:\s*\n-\s*([^\r\n]+)/)
          if (wsMatch && !sessionCwd) sessionCwd = wsMatch[1].trim()
        }

        // User input
        if (step.type === "USER_INPUT" || step.source === "USER_EXPLICIT") {
          let userText = step.content || ""
          // Clean <USER_REQUEST> tags if present
          const reqMatch = userText.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/)
          if (reqMatch) {
            userText = reqMatch[1].trim()
          }
          if (userText && typeof userText === "string") {
            if (!firstUserPrompt) firstUserPrompt = userText
            turns.push({
              role: "user",
              timestamp: ts,
              content: userText,
            })
          }
        }

        // Assistant response
        if (step.type === "PLANNER_RESPONSE" || step.source === "MODEL") {
          const content = String(step.content || "").trim()
          const toolCalls: ToolCall[] = []
          const filesModified: string[] = []

          if (step.tool_calls && Array.isArray(step.tool_calls)) {
            for (const tc of step.tool_calls) {
              const toolName = tc.name || "tool"
              const args = tc.args || {}

              if (args.TargetFile || args.AbsolutePath) {
                filesModified.push(String(args.TargetFile || args.AbsolutePath))
              }

              toolCalls.push({ name: toolName, args })
            }
          }

          if (content || toolCalls.length > 0) {
            turns.push({
              role: "assistant",
              timestamp: ts,
              content: content || `Assistant executed ${toolCalls.map((t) => t.name).join(", ")}`,
              toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
              filesModified: filesModified.length > 0 ? filesModified : undefined,
            })
          }
        }
      } catch {
        // ignore line error
      }
    }

    if (targetCwd && sessionCwd && !pathsEqual(sessionCwd, targetCwd)) {
      return null
    }

    return {
      harness: "antigravity",
      sessionId: convId,
      title: firstUserPrompt.slice(0, 60) || "Antigravity Session",
      cwd: sessionCwd || targetCwd || "",
      updatedAt: latestTimestamp || new Date().toISOString(),
      turns,
    }
  }
}
