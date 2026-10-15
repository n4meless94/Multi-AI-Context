import { describe, it, expect } from "vitest"
import { GitEnricher } from "../src/enrichers/git.js"

describe("GitEnricher", () => {
  it("extracts git status from the current repository", async () => {
    const enricher = new GitEnricher()
    const ctx = await enricher.getGitContext(process.cwd())

    expect(ctx.isRepo).toBe(true)
    expect(ctx.branch).toBeDefined()
    expect(Array.isArray(ctx.modifiedFiles)).toBe(true)
    expect(Array.isArray(ctx.untrackedFiles)).toBe(true)
    expect(Array.isArray(ctx.recentCommits)).toBe(true)
  })
})
