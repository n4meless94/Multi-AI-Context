import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import readline from "node:readline"
import type { NormalizedSession, NormalizedTurn, SessionExtractor, ToolCall } from "../core/types.js"
import { slugifyForCommandCode } from "../utils/paths.js"

interface CommandCodeMeta {
  title?: string
  entrypoint?: string
}

export class CommandCodeExtractor implements SessionExtractor {
  readonly harness = "commandcode" as const
  readonly name = "CommandCode"

  private getCommandCodeDir(): string {
    return path.join(os.homedir(), ".commandcode")
  }

  async isAvailable(): Promise<boolean> {
    const cmdDir = this.getCommandCodeDir()
    return fs.existsSync(cmdDir) && fs.existsSync(path.join(cmdDir, "projects"))
  }

  private findProjectDirs(): string[] {
    const projectsDir = path.join(this.getCommandCodeDir(), "projects")
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

    const expectedSlug = slugifyForCommandCode(cwd).toLowerCase()
    const matchingDirs = projectDirs.filter((d) => path.basename(d).toLowerCase() === expectedSlug)
    if (matchingDirs.length === 0) return null
    const dirsToScan = matchingDirs

    const allSessionFiles: string[] = []
    for (const dir of dirsToScan) {
      try {
        const files = fs
          .readdirSync(dir)
          .filter((f) => f.endsWith(".jsonl") && !f.endsWith(".checkpoints.jsonl"))
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
        const files = fs
          .readdirSync(dir)
          .filter((f) => f.includes(id) && f.endsWith(".jsonl") && !f.endsWith(".checkpoints.jsonl"))
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

    const sessionId = path.basename(filePath, ".jsonl")
    const metaPath = path.join(path.dirname(filePath), `${sessionId}.meta.json`)
    let title: string | undefined

    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as CommandCodeMeta
        if (meta.title) title = meta.title
      } catch {
        // ignore meta parse error
      }
    }

    const fileStream = fs.createReadStream(filePath, { encoding: "utf8" })
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity })

    let latestTimestamp = ""
    const turns: NormalizedTurn[] = []

    for await (const line of rl) {
      if (!line.trim()) continue
      try {
        const event = JSON.parse(line)
        const ts = event.timestamp || new Date().toISOString()
        latestTimestamp = ts

        const payload = event.payload || event
        const type = payload.type || event.type

        if (type === "user_message" || (payload.role === "user" && payload.content)) {
          const content = String(payload.message || payload.content || "").trim()
          if (content) {
            turns.push({
              role: "user",
              timestamp: ts,
              content,
            })
          }
        }

        if (type === "assistant_message" || (payload.role === "assistant" && payload.content)) {
          const content = String(payload.message || payload.content || "").trim()
          if (content) {
            turns.push({
              role: "assistant",
              timestamp: ts,
              content,
            })
          }
        }

        if (type === "tool_call" || payload.tool_name || payload.tool) {
          const toolName = payload.tool_name || payload.tool || payload.name || "tool"
          const args = payload.args || payload.parameters || {}
          const filesModified: string[] = []

          if (args.path || args.file_path || args.TargetFile) {
            filesModified.push(String(args.path || args.file_path || args.TargetFile))
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
        // ignore malformed line
      }
    }

    return {
      harness: "commandcode",
      sessionId,
      title: title || (turns.find((t) => t.role === "user")?.content.slice(0, 60)) || "CommandCode Session",
      cwd: targetCwd || "",
      updatedAt: latestTimestamp || new Date().toISOString(),
      turns,
    }
  }
}
