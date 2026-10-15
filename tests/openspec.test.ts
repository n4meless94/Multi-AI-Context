import { describe, it, expect } from "vitest"
import { OpenSpecEnricher } from "../src/enrichers/openspec.js"

describe("OpenSpecEnricher", () => {
  it("parses apply instructions output correctly", () => {
    const enricher = new OpenSpecEnricher()
    const sampleOutput = JSON.stringify({
      changeName: "harden-security-before-query-adoption",
      progress: {
        total: 47,
        complete: 44,
        remaining: 3
      },
      state: "ready",
      tasks: [
        { id: "1", description: "Task 1", done: true },
        { id: "2", description: "Task 2", done: false }
      ]
    })

    const ctx = enricher.parseApplyOutput("harden-security-before-query-adoption", sampleOutput)

    expect(ctx.hasOpenSpec).toBe(true)
    expect(ctx.activeChange).toBe("harden-security-before-query-adoption")
    expect(ctx.completedTasks).toBe(44)
    expect(ctx.totalTasks).toBe(47)
    expect(ctx.summary).toContain("44/47 tasks complete")
  })

  it("handles blocked gate state correctly", () => {
    const enricher = new OpenSpecEnricher()
    const sampleOutput = JSON.stringify({
      changeName: "harden-security-before-query-adoption",
      progress: { total: 47, complete: 44 },
      state: "blocked",
      missingArtifacts: ["task-11.3-verification", "csp-drills"]
    })

    const ctx = enricher.parseApplyOutput("harden-security-before-query-adoption", sampleOutput)

    expect(ctx.blockedGates).toContain("task-11.3-verification")
    expect(ctx.blockedGates).toContain("csp-drills")
    expect(ctx.summary).toContain("Blocked by: task-11.3-verification, csp-drills")
  })
})
