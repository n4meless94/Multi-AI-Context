import type { HarnessType, NormalizedSession, SessionExtractor } from "./types.js"
import { CodexExtractor } from "../extractors/codex.js"
import { ClaudeCodeExtractor } from "../extractors/claude.js"
import { CommandCodeExtractor } from "../extractors/commandcode.js"
import { AntigravityExtractor } from "../extractors/antigravity.js"
import { OpenCodeExtractor } from "../extractors/opencode.js"

export interface DiscoverOptions {
  cwd?: string
  fromHarness?: HarnessType
  threadOrDeeplink?: string
}

export class SessionOrchestrator {
  private extractors: SessionExtractor[]

  constructor(customExtractors?: SessionExtractor[]) {
    this.extractors = customExtractors || [
      new CodexExtractor(),
      new ClaudeCodeExtractor(),
      new CommandCodeExtractor(),
      new AntigravityExtractor(),
      new OpenCodeExtractor(),
    ]
  }

  getExtractor(harness: HarnessType): SessionExtractor | undefined {
    return this.extractors.find((e) => e.harness === harness)
  }

  parseDeeplink(input: string): { harness?: HarnessType; id: string } {
    const trimmed = input.trim()
    if (trimmed.startsWith("codex://threads/")) {
      return { harness: "codex", id: trimmed.replace("codex://threads/", "") }
    }
    if (trimmed.startsWith("claude://")) {
      return { harness: "claude", id: trimmed.replace("claude://", "") }
    }
    if (trimmed.startsWith("commandcode://")) {
      return { harness: "commandcode", id: trimmed.replace("commandcode://", "") }
    }
    if (trimmed.startsWith("antigravity://")) {
      return { harness: "antigravity", id: trimmed.replace("antigravity://", "") }
    }
    return { id: trimmed }
  }

  async discoverCandidates(options: DiscoverOptions = {}): Promise<NormalizedSession[]> {
    const cwd = options.cwd || process.cwd()

    // 1. Direct ID or deeplink
    if (options.threadOrDeeplink) {
      const { harness, id } = this.parseDeeplink(options.threadOrDeeplink)
      if (harness) {
        const ext = this.getExtractor(harness)
        if (ext) {
          const session = await ext.getSessionById(id)
          if (session) return [session]
        }
      } else {
        // Try all extractors with this ID
        for (const ext of this.extractors) {
          try {
            const session = await ext.getSessionById(id)
            if (session) return [session]
          } catch {
            // continue
          }
        }
      }
      return []
    }

    // 2. Filtered by harness
    if (options.fromHarness) {
      const ext = this.getExtractor(options.fromHarness)
      if (!ext) return []
      if (typeof ext.findRecentSessions === "function") {
        return await ext.findRecentSessions(cwd, 5)
      }
      const session = await ext.findLatestSession(cwd)
      return session ? [session] : []
    }

    // 3. Multi-harness auto-discovery: query all available extractors
    const candidatePromises = this.extractors.map(async (ext) => {
      try {
        const available = await ext.isAvailable()
        if (!available) return []
        if (typeof ext.findRecentSessions === "function") {
          return await ext.findRecentSessions(cwd, 3)
        }
        const session = await ext.findLatestSession(cwd)
        return session ? [session] : []
      } catch {
        return []
      }
    })

    const results = await Promise.all(candidatePromises)
    const candidates = results.flat()

    candidates.sort((a, b) => {
      const timeA = new Date(a.updatedAt).getTime() || 0
      const timeB = new Date(b.updatedAt).getTime() || 0
      return timeB - timeA
    })

    return candidates
  }

  async discoverSession(options: DiscoverOptions = {}): Promise<NormalizedSession | null> {
    const candidates = await this.discoverCandidates(options)
    return candidates[0] || null
  }
}
