import type { GitContext, HandoffPayload, NormalizedSession, OpenSpecContext } from "../core/types.js"
import { redactSecrets } from "../utils/sanitize.js"

export class MarkdownSynthesizer {
  private isRawToolLog(text: string): boolean {
    if (!text) return true
    const trimmed = text.trim()
    return (
      trimmed.startsWith("Created At:") ||
      trimmed.startsWith("Completed At:") ||
      trimmed.startsWith("The command exited with code") ||
      trimmed.startsWith("Tool is running") ||
      trimmed.startsWith("Task:") ||
      trimmed.startsWith("Task \"") ||
      trimmed.startsWith("Encountered error in") ||
      trimmed.startsWith("File Path: `file:///") ||
      trimmed.startsWith("[12:") ||
      trimmed.startsWith("[11:") ||
      trimmed.startsWith("[10:")
    )
  }

  private extractCleanSummary(text: string): string | null {
    if (!text || this.isRawToolLog(text)) return null
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !this.isRawToolLog(l))

    if (lines.length === 0) return null

    // Prefer first heading or first informative sentence
    const heading = lines.find((l) => l.startsWith("#"))
    if (heading) {
      return heading.replace(/^#+\s*/, "").trim()
    }

    const firstSentence = lines[0].replace(/^[-*•]\s*/, "")
    if (firstSentence.length > 10) {
      return firstSentence.length > 120 ? `${firstSentence.slice(0, 117)}...` : firstSentence
    }

    return null
  }

  buildPayload(
    session: NormalizedSession,
    git: GitContext,
    openspec: OpenSpecContext,
    focus?: string
  ): HandoffPayload {
    // 1. Objective: explicit focus, or extracted user intent, or session title
    const firstUserTurn = session.turns.find((t) => t.role === "user")
    let objective = focus ? focus.trim() : ""

    if (!objective && firstUserTurn?.content) {
      const content = firstUserTurn.content.trim()
      const argMatch = content.match(/\*\*Provided arguments\*\*:\s*([^\r\n]+)/i)
      if (argMatch) {
        objective = argMatch[1].trim()
      } else if (content.length > 250 && session.title) {
        objective = session.title
      } else {
        objective = content
      }
    }

    if (!objective) {
      objective = session.title || "Continue current development task"
    }

    objective = redactSecrets(objective)

    // 2. Completed work items: assistant conclusions and modified files
    const completedWork: string[] = []
    const filesModifiedSet = new Set<string>()

    for (const turn of session.turns) {
      if (turn.filesModified) {
        for (const f of turn.filesModified) filesModifiedSet.add(f)
      }
      if (turn.role === "assistant" && turn.content) {
        const summary = this.extractCleanSummary(turn.content)
        if (summary && !completedWork.includes(summary)) {
          completedWork.push(redactSecrets(summary))
        }
      }
    }

    // 3. Last action
    const lastAssistantTurn = [...session.turns]
      .reverse()
      .find((t) => t.role === "assistant" && t.content && !this.isRawToolLog(t.content))

    let lastAction = lastAssistantTurn?.content
      ? this.extractCleanSummary(lastAssistantTurn.content) || lastAssistantTurn.content.split("\n")[0]
      : "Work paused mid-session."

    lastAction = redactSecrets(lastAction)

    // 4. Next steps
    const nextSteps: string[] = []
    if (focus) {
      nextSteps.push(`Focus on: ${focus.trim()}`)
    }
    if (openspec.hasOpenSpec && openspec.activeChange) {
      nextSteps.push(`Continue OpenSpec tasks for change '${openspec.activeChange}' (${openspec.summary})`)
      if (openspec.blockedGates.length > 0) {
        nextSteps.push(`Resolve blocked release gates: ${openspec.blockedGates.join(", ")}`)
      }
    }
    if (git.modifiedFiles.length > 0) {
      nextSteps.push(
        `Verify or test uncommitted modifications in ${git.modifiedFiles.slice(0, 3).join(", ")}${
          git.modifiedFiles.length > 3 ? ` (+${git.modifiedFiles.length - 3} more)` : ""
        }`
      )
    }
    if (nextSteps.length === 0) {
      nextSteps.push("Review modified files, run test suite, and continue implementation.")
    }

    // 5. Suggested Skills (inspired by Matt Pocock's handoff skill)
    const suggestedSkills: string[] = []
    const allModified = [
      ...git.modifiedFiles,
      ...Array.from(filesModifiedSet),
      ...session.turns.flatMap((t) => t.filesModified || []),
    ]

    if (openspec.hasOpenSpec) {
      suggestedSkills.push("openspec-apply-change — Implement remaining OpenSpec tasks")
      suggestedSkills.push("openspec-explore — Investigate ideas or clarify requirements")
    }

    const hasUI = allModified.some(
      (f) => /\.(tsx|jsx|css|scss|vue|svelte)$/i.test(f) || /[\\/]components[\\/]/i.test(f)
    )
    if (hasUI) {
      suggestedSkills.push("impeccable — Critique, design, and polish UI/UX components")
    }

    const hasTests = allModified.some(
      (f) => /\.(test|spec)\.[jt]sx?$/i.test(f) || /[\\/]tests?[\\/]/i.test(f)
    )
    if (hasTests) {
      suggestedSkills.push("gsd-add-tests — Ensure test suite completeness and verification")
    }

    if (git.modifiedFiles.length > 0) {
      suggestedSkills.push("gsd-code-review — Audit uncommitted diffs for regressions or safety")
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
      suggestedSkills: suggestedSkills.length > 0 ? suggestedSkills : undefined,
      promptKickstart: kickstartPrompt,
    }
  }

  generateMarkdown(payload: HandoffPayload): string {
    const { session, git, openspec, objective, lastAction, completedWork, nextSteps, suggestedSkills } =
      payload

    const modifiedList = Array.from(
      new Set([...git.modifiedFiles, ...session.turns.flatMap((t) => t.filesModified || [])])
    )

    let md = `# Context Handoff

> **Generated:** ${payload.generatedAt}  
> **Source Harness:** ${session.harness.toUpperCase()} (\`${session.sessionId}\`)  
> **Repository:** \`${session.cwd || process.cwd()}\`

---

## 1. Primary Objective
${redactSecrets(objective)}

## 2. Session Context & Completed Work
- **Harness Session Title:** ${redactSecrets(session.title || "N/A")}
- **Last Action Recorded:**
${lastAction
  .split("\n")
  .map((line) => `  > ${redactSecrets(line)}`)
  .join("\n")}

### Recent Progress Milestones:
${
  completedWork.length > 0
    ? completedWork.map((item) => `- ${redactSecrets(item)}`).join("\n")
    : "- No previous milestone summaries recorded."
}

## 3. Code Modifications & Git State
- **Git Branch:** \`${git.branch || "unknown"}\`
- **Modified Files (${modifiedList.length}):**
${
  modifiedList.length > 0
    ? modifiedList
        .slice(0, 30)
        .map((f) => `  - \`${redactSecrets(f)}\``)
        .join("\n") +
      (modifiedList.length > 30 ? `\n  - ... (+${modifiedList.length - 30} more)` : "")
    : "  - No modified files recorded."
}
${
  git.untrackedFiles.length > 0
    ? `- **Untracked Files (${git.untrackedFiles.length}):**\n${git.untrackedFiles
        .slice(0, 10)
        .map((f) => `  - \`${redactSecrets(f)}\``)
        .join("\n")}`
    : ""
}

${
  git.diffSummary
    ? `### Git Diff Stat (Artifact Reference):\n\`\`\`\n${redactSecrets(git.diffSummary)}\n\`\`\`\n`
    : ""
}

## 4. OpenSpec Status
${
  openspec.hasOpenSpec
    ? `- **Active Change:** \`${openspec.activeChange || "None"}\`\n- **Progress:** ${
        openspec.summary || "In progress"
      }${
        openspec.blockedGates.length > 0 ? `\n- **Blocked Gates:** ${openspec.blockedGates.join(", ")}` : ""
      }`
    : "- No active OpenSpec setup in this repository."
}
`

    if (suggestedSkills && suggestedSkills.length > 0) {
      md += `
---

## 5. Suggested Skills & Commands
The next assistant can invoke these skills for this project state:
${suggestedSkills.map((s) => `- \`${s.split(" — ")[0]}\` — ${s.split(" — ")[1] || ""}`).join("\n")}
`
    }

    const nextStepsHeaderNum = suggestedSkills && suggestedSkills.length > 0 ? 6 : 5
    md += `
---

## ${nextStepsHeaderNum}. Recommended Next Steps
${nextSteps.map((step, idx) => `${idx + 1}. ${redactSecrets(step)}`).join("\n")}
`

    return md
  }
}
