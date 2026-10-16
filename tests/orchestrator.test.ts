import { describe, it, expect } from "vitest"
import { SessionOrchestrator } from "../src/core/orchestrator.js"
import type { SessionExtractor, NormalizedSession } from "../src/core/types.js"

describe("SessionOrchestrator", () => {
  it("selects the most recently updated session across mock extractors", async () => {
    const mockCodexSession: NormalizedSession = {
      harness: "codex",
      sessionId: "codex-1",
      cwd: "C:/Work/Project",
      updatedAt: "2026-10-15T02:00:00Z",
      turns: []
    }

    const mockClaudeSession: NormalizedSession = {
      harness: "claude",
      sessionId: "claude-2",
      cwd: "C:/Work/Project",
      updatedAt: "2026-10-15T03:30:00Z", // Newer than Codex!
      turns: []
    }

    const mockCodexExtractor: SessionExtractor = {
      harness: "codex",
      name: "Mock Codex",
      isAvailable: async () => true,
      findLatestSession: async () => mockCodexSession,
      getSessionById: async () => mockCodexSession
    }

    const mockClaudeExtractor: SessionExtractor = {
      harness: "claude",
      name: "Mock Claude",
      isAvailable: async () => true,
      findLatestSession: async () => mockClaudeSession,
      getSessionById: async () => mockClaudeSession
    }

    const orchestrator = new SessionOrchestrator([mockCodexExtractor, mockClaudeExtractor])
    const latest = await orchestrator.discoverSession({ cwd: "C:/Work/Project" })

    expect(latest).not.toBeNull()
    expect(latest?.harness).toBe("claude")
    expect(latest?.sessionId).toBe("claude-2")
  })

  it("respects explicit deeplink resolution", async () => {
    const mockCodexSession: NormalizedSession = {
      harness: "codex",
      sessionId: "target-codex-id",
      cwd: "C:/Work/Project",
      updatedAt: "2026-10-15T01:00:00Z",
      turns: []
    }

    const mockCodexExtractor: SessionExtractor = {
      harness: "codex",
      name: "Mock Codex",
      isAvailable: async () => true,
      findLatestSession: async () => null,
      getSessionById: async (id) => (id === "target-codex-id" ? mockCodexSession : null)
    }

    const orchestrator = new SessionOrchestrator([mockCodexExtractor])
    const session = await orchestrator.discoverSession({
      threadOrDeeplink: "codex://threads/target-codex-id"
    })

    expect(session).not.toBeNull()
    expect(session?.sessionId).toBe("target-codex-id")
  })

  it("returns multiple candidate sessions across harnesses sorted newest first", async () => {
    const s1: NormalizedSession = {
      harness: "opencode",
      sessionId: "open-1",
      cwd: "C:/Work/Project",
      updatedAt: "2026-10-15T01:00:00Z",
      turns: []
    }
    const s2: NormalizedSession = {
      harness: "opencode",
      sessionId: "open-2",
      cwd: "C:/Work/Project",
      updatedAt: "2026-10-15T05:00:00Z", // Newest
      turns: []
    }
    const s3: NormalizedSession = {
      harness: "antigravity",
      sessionId: "anti-1",
      cwd: "C:/Work/Project",
      updatedAt: "2026-10-15T03:00:00Z", // Middle
      turns: []
    }

    const mockOpenCode: SessionExtractor = {
      harness: "opencode",
      name: "Mock OpenCode",
      isAvailable: async () => true,
      findLatestSession: async () => s2,
      findRecentSessions: async () => [s2, s1],
      getSessionById: async () => null
    }

    const mockAnti: SessionExtractor = {
      harness: "antigravity",
      name: "Mock Antigravity",
      isAvailable: async () => true,
      findLatestSession: async () => s3,
      findRecentSessions: async () => [s3],
      getSessionById: async () => null
    }

    const orchestrator = new SessionOrchestrator([mockOpenCode, mockAnti])
    const candidates = await orchestrator.discoverCandidates({ cwd: "C:/Work/Project" })

    expect(candidates).toHaveLength(3)
    expect(candidates[0].sessionId).toBe("open-2")
    expect(candidates[1].sessionId).toBe("anti-1")
    expect(candidates[2].sessionId).toBe("open-1")
  })
})
