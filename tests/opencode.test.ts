import { describe, it, expect } from "vitest"
import { OpenCodeExtractor } from "../src/extractors/opencode.js"

describe("OpenCodeExtractor", () => {
  it("parses exported OpenCode JSON payload correctly", () => {
    const sampleExport = JSON.stringify({
      id: "sess-opencode-555",
      title: "Add rate limiting middleware",
      cwd: "C:/Work/Project",
      updatedAt: "2026-10-15T04:00:00Z",
      messages: [
        {
          role: "user",
          content: "Add rate limiting middleware using redis token bucket",
          timestamp: "2026-10-15T04:01:00Z"
        },
        {
          role: "assistant",
          content: "I will implement the rate limiting middleware.",
          timestamp: "2026-10-15T04:02:00Z",
          tool_calls: [
            {
              name: "edit_file",
              args: { path: "server/middleware/rate-limit.ts" }
            }
          ]
        },
        {
          role: "assistant",
          content: "Rate limiter middleware is complete and verified.",
          timestamp: "2026-10-15T04:03:00Z"
        }
      ]
    })

    const extractor = new OpenCodeExtractor()
    const session = extractor.parseExportedJson(sampleExport, "C:/Work/Project")

    expect(session).not.toBeNull()
    expect(session?.harness).toBe("opencode")
    expect(session?.sessionId).toBe("sess-opencode-555")
    expect(session?.title).toBe("Add rate limiting middleware")
    expect(session?.turns.length).toBe(3)
    expect(session?.turns[0].content).toContain("Add rate limiting middleware")
    expect(session?.turns[1].filesModified).toContain("server/middleware/rate-limit.ts")
    expect(session?.turns[2].content).toContain("Rate limiter middleware is complete")
  })
})
