import { describe, it, expect } from "vitest"
import path from "node:path"
import fs from "node:fs"
import os from "node:os"
import { CommandCodeExtractor } from "../src/extractors/commandcode.js"

describe("CommandCodeExtractor", () => {
  it("parses synthetic CommandCode session and meta correctly", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmdcode-test-"))
    const sessId = "50d9a936-8e4e-48cc-aee8-3df1d6e0a584"
    const testJsonl = path.join(tempDir, `${sessId}.jsonl`)
    const testMeta = path.join(tempDir, `${sessId}.meta.json`)

    fs.writeFileSync(
      testMeta,
      JSON.stringify({ title: "Card Redesign Concepts", entrypoint: "interactive" }),
      "utf8"
    )

    const sampleLines = [
      JSON.stringify({
        timestamp: "2026-10-15T02:30:00Z",
        payload: {
          type: "user_message",
          message: "i want to redesign this card. can you propose different concepts"
        }
      }),
      JSON.stringify({
        timestamp: "2026-10-15T02:31:00Z",
        payload: {
          type: "tool_call",
          tool_name: "write_to_file",
          args: { TargetFile: "src/components/Card.tsx" }
        }
      }),
      JSON.stringify({
        timestamp: "2026-10-15T02:32:00Z",
        payload: {
          type: "assistant_message",
          message: "Here are 3 distinct card redesign concepts."
        }
      })
    ].join("\n")

    fs.writeFileSync(testJsonl, sampleLines, "utf8")

    const extractor = new CommandCodeExtractor()
    const session = await extractor.parseSessionFile(testJsonl, "C:/Work/QSB/QSB Intranet")

    expect(session).not.toBeNull()
    expect(session?.harness).toBe("commandcode")
    expect(session?.sessionId).toBe(sessId)
    expect(session?.title).toBe("Card Redesign Concepts")
    expect(session?.turns.length).toBe(3)
    expect(session?.turns[0].content).toContain("redesign this card")
    expect(session?.turns[1].filesModified).toContain("src/components/Card.tsx")
    expect(session?.turns[2].content).toContain("3 distinct card redesign concepts")

    fs.rmSync(tempDir, { recursive: true, force: true })
  })
})
