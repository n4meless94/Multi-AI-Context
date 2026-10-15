import { describe, it, expect } from "vitest"
import path from "node:path"
import fs from "node:fs"
import os from "node:os"
import { ensureGitExcluded } from "../src/utils/git-exclude.js"

describe("ensureGitExcluded", () => {
  it("appends HANDOFF.md to .git/info/exclude in a git repository", () => {
    const tempRepo = fs.mkdtempSync(path.join(os.tmpdir(), "git-exclude-test-"))
    const gitDir = path.join(tempRepo, ".git")
    fs.mkdirSync(gitDir, { recursive: true })

    const res1 = ensureGitExcluded(tempRepo, "HANDOFF.md")
    expect(res1).toBe(true)

    const excludeContent = fs.readFileSync(path.join(gitDir, "info", "exclude"), "utf8")
    expect(excludeContent).toContain("HANDOFF.md")

    // Running again does not duplicate
    const res2 = ensureGitExcluded(tempRepo, "HANDOFF.md")
    expect(res2).toBe(true)
    const matches = excludeContent.split("\n").filter((l) => l.trim() === "HANDOFF.md")
    expect(matches.length).toBe(1)

    fs.rmSync(tempRepo, { recursive: true, force: true })
  })
})
