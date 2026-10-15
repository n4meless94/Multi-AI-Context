import { describe, it, expect } from "vitest"
import path from "node:path"
import fs from "node:fs"
import os from "node:os"
import { AntigravityExtractor } from "../src/extractors/antigravity.js"

describe("AntigravityExtractor", () => {
  it("parses synthetic Antigravity transcript correctly", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "antigrav-test-"))
    const logDir = path.join(tempDir, "conv-1234", ".system_generated", "logs")
    fs.mkdirSync(logDir, { recursive: true })
    const testJsonl = path.join(logDir, "transcript.jsonl")

    const sampleLines = [
      JSON.stringify({
        step_index: 0,
        source: "USER_EXPLICIT",
        type: "USER_INPUT",
        content: "<USER_REQUEST>\nImplement turnstile verification service\n</USER_REQUEST>\nCommand Working Directory: C:/Work/Project",
        created_at: "2026-10-15T03:00:00Z"
      }),
      JSON.stringify({
        step_index: 1,
        source: "MODEL",
        type: "PLANNER_RESPONSE",
        content: "I will implement the verification service.",
        tool_calls: [
          {
            name: "write_to_file",
            args: { TargetFile: "server/services/turnstile.ts" }
          }
        ],
        created_at: "2026-10-15T03:01:00Z"
      }),
      JSON.stringify({
        step_index: 2,
        source: "MODEL",
        type: "PLANNER_RESPONSE",
        content: "Turnstile verification service is now implemented and ready.",
        created_at: "2026-10-15T03:02:00Z"
      })
    ].join("\n")

    fs.writeFileSync(testJsonl, sampleLines, "utf8")

    const extractor = new AntigravityExtractor()
    const session = await extractor.parseSessionFile(testJsonl, "C:/Work/Project")

    expect(session).not.toBeNull()
    expect(session?.harness).toBe("antigravity")
    expect(session?.sessionId).toBe("conv-1234")
    expect(session?.title).toContain("Implement turnstile verification service")
    expect(session?.turns.length).toBe(3)
    expect(session?.turns[0].role).toBe("user")
    expect(session?.turns[0].content).toBe("Implement turnstile verification service")
    expect(session?.turns[1].filesModified).toContain("server/services/turnstile.ts")
    expect(session?.turns[2].content).toContain("Turnstile verification service is now implemented")

    fs.rmSync(tempDir, { recursive: true, force: true })
  })
})
