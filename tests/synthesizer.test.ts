import { describe, it, expect } from "vitest"
import { MarkdownSynthesizer } from "../src/synthesizer/markdown.js"
import type { GitContext, NormalizedSession, OpenSpecContext } from "../src/core/types.js"

describe("MarkdownSynthesizer", () => {
  it("formats HANDOFF.md with all required sections", () => {
    const session: NormalizedSession = {
      harness: "codex",
      sessionId: "sess-abc-123",
      title: "Add authentication",
      cwd: "C:/Work/Project",
      updatedAt: "2026-10-15T05:00:00Z",
      turns: [
        {
          role: "user",
          content: "Implement JWT validation middleware",
          timestamp: "2026-10-15T05:01:00Z"
        },
        {
          role: "assistant",
          content: "JWT validation middleware implemented in server/auth.ts",
          timestamp: "2026-10-15T05:02:00Z",
          filesModified: ["server/auth.ts"]
        }
      ]
    }

    const git: GitContext = {
      isRepo: true,
      branch: "feature/jwt",
      modifiedFiles: ["server/auth.ts"],
      untrackedFiles: ["tests/jwt.test.ts"],
      diffSummary: "server/auth.ts | 25 +++++++++++++++++++++++++\n 1 file changed, 25 insertions(+)",
      recentCommits: ["a1b2c3d initial jwt scaffold"]
    }

    const openspec: OpenSpecContext = {
      hasOpenSpec: true,
      activeChange: "add-jwt-auth",
      completedTasks: 3,
      totalTasks: 5,
      blockedGates: ["key-rotation-drill"],
      summary: "3/5 tasks complete"
    }

    const synthesizer = new MarkdownSynthesizer()
    const payload = synthesizer.buildPayload(session, git, openspec)
    const md = synthesizer.generateMarkdown(payload)

    expect(md).toContain("# Context Handoff")
    expect(md).toContain("Source Harness:** CODEX")
    expect(md).toContain("Primary Objective")
    expect(md).toContain("Implement JWT validation middleware")
    expect(md).toContain("Code Modifications & Git State")
    expect(md).toContain("server/auth.ts")
    expect(md).toContain("OpenSpec Status")
    expect(md).toContain("add-jwt-auth")
    expect(md).toContain("Recommended Next Steps")

    expect(payload.promptKickstart).toContain("I am continuing work from a previous session in codex")
  })
})
