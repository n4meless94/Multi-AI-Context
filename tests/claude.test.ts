import { describe, it, expect } from "vitest"
import path from "node:path"
import fs from "node:fs"
import os from "node:os"
import { ClaudeCodeExtractor } from "../src/extractors/claude.js"

describe("ClaudeCodeExtractor", () => {
  it("parses synthetic Claude Code JSONL session correctly", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-test-"))
    const testJsonl = path.join(tempDir, "session-1234.jsonl")

    const sampleLines = [
      JSON.stringify({
        type: "attachment",
        cwd: "C:/Work/Project",
        sessionId: "sess-claude-999",
        timestamp: "2026-10-15T02:00:00Z"
      }),
      JSON.stringify({
        type: "queue-operation",
        operation: "enqueue",
        content: "Fix login session expiry handling in auth controller",
        sessionId: "sess-claude-999",
        timestamp: "2026-10-15T02:01:00Z"
      }),
      JSON.stringify({
        type: "tool_use",
        name: "Edit",
        input: { path: "server/auth.ts" },
        timestamp: "2026-10-15T02:02:00Z"
      }),
      JSON.stringify({
        type: "assistant",
        content: "Updated session timeout in auth controller.",
        timestamp: "2026-10-15T02:03:00Z"
      })
    ].join("\n")

    fs.writeFileSync(testJsonl, sampleLines, "utf8")

    const extractor = new ClaudeCodeExtractor()
    const session = await extractor.parseSessionFile(testJsonl, "C:/Work/Project")

    expect(session).not.toBeNull()
    expect(session?.harness).toBe("claude")
    expect(session?.sessionId).toBe("sess-claude-999")
    expect(session?.turns.length).toBe(3)
    expect(session?.turns[0].role).toBe("user")
    expect(session?.turns[0].content).toContain("Fix login session expiry")
    expect(session?.turns[1].role).toBe("tool")
    expect(session?.turns[1].filesModified).toContain("server/auth.ts")
    expect(session?.turns[2].role).toBe("assistant")

    fs.rmSync(tempDir, { recursive: true, force: true })
  })
})
