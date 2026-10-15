import { describe, it, expect } from "vitest"
import path from "node:path"
import fs from "node:fs"
import os from "node:os"
import { ContextInjector, INJECTION_START, INJECTION_END } from "../src/synthesizer/injector.js"

describe("ContextInjector", () => {
  it("injects handoff block and clears it cleanly", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "injector-test-"))
    const claudePath = path.join(tempDir, "CLAUDE.md")
    fs.writeFileSync(claudePath, "# Existing Claude Rules\nDo not break production.", "utf8")

    const handoffPath = path.join(tempDir, "HANDOFF.md")
    fs.writeFileSync(handoffPath, "# Sample Handoff", "utf8")

    const injector = new ContextInjector()

    // 1. Inject
    const injected = injector.inject(tempDir, "Active objective: Deploy new v2 API")
    expect(injected).toContain("CLAUDE.md")
    expect(injected).toContain("AGENTS.override.md")

    const claudeContent = fs.readFileSync(claudePath, "utf8")
    expect(claudeContent).toContain(INJECTION_START)
    expect(claudeContent).toContain("Deploy new v2 API")
    expect(claudeContent).toContain(INJECTION_END)
    expect(claudeContent).toContain("Existing Claude Rules")

    // 2. Clear
    const result = injector.clear(tempDir)
    expect(result.removedHandoff).toBe(true)
    expect(fs.existsSync(handoffPath)).toBe(false)

    const cleanedClaude = fs.readFileSync(claudePath, "utf8")
    expect(cleanedClaude).not.toContain(INJECTION_START)
    expect(cleanedClaude).toContain("Existing Claude Rules")

    // AGENTS.override.md should have been removed since it was empty
    expect(fs.existsSync(path.join(tempDir, "AGENTS.override.md"))).toBe(false)

    fs.rmSync(tempDir, { recursive: true, force: true })
  })
})
