import type { GitContext, HandoffPayload, NormalizedSession, OpenSpecContext } from "../core/types.js"

export class MarkdownSynthesizer {
  buildPayload(
    session: NormalizedSession,
    git: GitContext,
    openspec: OpenSpecContext
  ): HandoffPayload {
    // 1. Objective: first user prompt or session title
    const firstUserTurn = session.turns.find((t) => t.role === "user")
    const objective = firstUserTurn?.content || session.title || "Continue current development task"

    // 2. Completed work items: assistant conclusions and modified files
    const completedWork: string[] = []
    const filesModifiedSet = new Set<string>()

    for (const turn of session.turns) {
      if (turn.filesModified) {
        for (const f of turn.filesModified) filesModifiedSet.add(f)
      }
      if (turn.role === "assistant" && turn.content) {
        // Grab concise summary lines
        const firstLine = turn.content.split("\n")[0].trim()
        if (firstLine && firstLine.length > 10 && !completedWork.includes(firstLine)) {
          completedWork.push(firstLine)
        }
      }
    }

    // 3. Last action
    const lastAssistantTurn = [...session.turns].reverse().find((t) => t.role === "assistant")
    const lastAction = lastAssistantTurn?.content || "Work paused mid-session."

    // 4. Next steps
    const nextSteps: string[] = []
    if (openspec.hasOpenSpec && openspec.activeChange) {
      nextSteps.push(`Continue OpenSpec tasks for change '${openspec.activeChange}' (${openspec.summary})`)
      if (openspec.blockedGates.length > 0) {
        nextSteps.push(`Resolve blocked release gates: ${openspec.blockedGates.join(", ")}`)
      }
    }
    if (git.modifiedFiles.length > 0) {
      nextSteps.push(`Verify or test uncommitted modifications in ${git.modifiedFiles.slice(0, 3).join(", ")}${git.modifiedFiles.length > 3 ? ` (+${git.modifiedFiles.length - 3} more)` : ""}`)
    }
    if (nextSteps.length === 0) {
      nextSteps.push("Review modified files, run test suite, and continue implementation.")
    }

    const kickstartPrompt = `I am continuing work from a previous session in ${session.harness}. Please read HANDOFF.md in the project root to understand what has been completed, modified files, and remaining tasks. Let's proceed with the next step.`

    return {
      generatedAt: new Date().toISOString(),
      session,
      git,
      openspec,
      objective,
      lastAction,
      completedWork: completedWork.slice(-5), // keep last 5 notable updates
      nextSteps,
      promptKickstart: kickstartPrompt,
    }
  }

  generateMarkdown(payload: HandoffPayload): string {
    const { session, git, openspec, objective, lastAction, completedWork, nextSteps } = payload

    const modifiedList = Array.from(
      new Set([...git.modifiedFiles, ...session.turns.flatMap((t) => t.filesModified || [])])
    )

    return `# Context Handoff

> **Generated:** ${payload.generatedAt}  
> **Source Harness:** ${session.harness.toUpperCase()} (\`${session.sessionId}\`)  
> **Repository:** \`${session.cwd || process.cwd()}\`

---

## 1. Primary Objective
${objective}

## 2. Session Context & Completed Work
- **Harness Session Title:** ${session.title || "N/A"}
- **Last Action Recorded:**
${lastAction.split("\n").map((line) => `  > ${line}`).join("\n")}

### Recent Progress Milestones:
${completedWork.length > 0 ? completedWork.map((item) => `- ${item}`).join("\n") : "- No previous milestone summaries recorded."}

## 3. Code Modifications & Git State
- **Git Branch:** \`${git.branch || "unknown"}\`
- **Modified Files (${modifiedList.length}):**
${modifiedList.length > 0 ? modifiedList.map((f) => `  - \`${f}\``).join("\n") : "  - No modified files recorded."}
${git.untrackedFiles.length > 0 ? `- **Untracked Files (${git.untrackedFiles.length}):**\n${git.untrackedFiles.slice(0, 10).map((f) => `  - \`${f}\``).join("\n")}` : ""}

${git.diffSummary ? `### Git Diff Stat:\n\`\`\`\n${git.diffSummary}\n\`\`\`\n` : ""}

## 4. OpenSpec Status
${openspec.hasOpenSpec ? `- **Active Change:** \`${openspec.activeChange || "None"}\`\n- **Progress:** ${openspec.summary || "In progress"}${openspec.blockedGates.length > 0 ? `\n- **Blocked Gates:** ${openspec.blockedGates.join(", ")}` : ""}` : "- No active OpenSpec setup in this repository."}

---

## 5. Recommended Next Steps
${nextSteps.map((step, idx) => `${idx + 1}. ${step}`).join("\n")}
`
  }
}
