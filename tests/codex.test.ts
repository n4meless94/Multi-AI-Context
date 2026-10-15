import { describe, it, expect } from "vitest"
import path from "node:path"
import fs from "node:fs"
import os from "node:os"
import { CodexExtractor } from "../src/extractors/codex.js"

describe("CodexExtractor", () => {
  it("parses synthetic Codex JSONL session correctly", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-test-"))
    const testJsonl = path.join(tempDir, "rollout-2026-10-15-01a13d17-987f-7fb2-aa0e-9110273ecbd7.jsonl")

    const sampleLines = [
      JSON.stringify({
        timestamp: "2026-10-15T01:00:00Z",
        type: "event_msg",
        payload: {
          type: "thread_settings_applied",
          thread_id: "01a13d17-987f-7fb2-aa0e-9110273ecbd7",
          thread_settings: { cwd: "C:/Work/Project" }
        }
      }),
      JSON.stringify({
        timestamp: "2026-10-15T01:05:00Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "Refactor database migrations and add user model"
        }
      }),
      JSON.stringify({
        timestamp: "2026-10-15T01:10:00Z",
        type: "event_msg",
        payload: {
          type: "tool_call",
          tool_name: "edit_file",
          args: { path: "src/db/user.ts" }
        }
      }),
      JSON.stringify({
        timestamp: "2026-10-15T01:15:00Z",
        type: "event_msg",
        payload: {
          type: "assistant_message",
          message: "Completed user model refactoring. Migration passed."
        }
      })
    ].join("\n")

    fs.writeFileSync(testJsonl, sampleLines, "utf8")

    const extractor = new CodexExtractor()
    const session = await extractor.parseSessionFile(testJsonl, "C:/Work/Project")

    expect(session).not.toBeNull()
    expect(session?.harness).toBe("codex")
    expect(session?.sessionId).toBe("01a13d17-987f-7fb2-aa0e-9110273ecbd7")
    expect(session?.turns.length).toBe(3)
    expect(session?.turns[0].role).toBe("user")
    expect(session?.turns[0].content).toContain("Refactor database migrations")
    expect(session?.turns[1].role).toBe("tool")
    expect(session?.turns[1].filesModified).toContain("src/db/user.ts")
    expect(session?.turns[2].role).toBe("assistant")
    expect(session?.turns[2].content).toContain("Completed user model refactoring")

    fs.rmSync(tempDir, { recursive: true, force: true })
  })
})
