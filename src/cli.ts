import { Command } from "commander"
import * as p from "@clack/prompts"
import pc from "picocolors"
import fs from "node:fs"
import path from "node:path"
import { SessionOrchestrator } from "./core/orchestrator.js"
import { GitEnricher } from "./enrichers/git.js"
import { OpenSpecEnricher } from "./enrichers/openspec.js"
import { MarkdownSynthesizer } from "./synthesizer/markdown.js"
import { ContextInjector } from "./synthesizer/injector.js"
import { copyToClipboard } from "./utils/clipboard.js"
import { ensureGitExcluded } from "./utils/git-exclude.js"
import type { HarnessType, NormalizedSession } from "./core/types.js"

function isSessionIdentifier(arg: string): boolean {
  const trimmed = arg.trim()
  if (
    trimmed.startsWith("codex://") ||
    trimmed.startsWith("claude://") ||
    trimmed.startsWith("commandcode://") ||
    trimmed.startsWith("antigravity://") ||
    trimmed.startsWith("opencode://") ||
    trimmed.startsWith("ses_")
  ) {
    return true
  }
  // Check UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(trimmed)) {
    return true
  }
  return false
}

const program = new Command()

program
  .name("handoff")
  .description("Cross-harness session discovery, extraction, and handoff tool for AI coding environments")
  .version("0.1.0")

program
  .argument("[threadOrFocus]", "Optional thread ID, deeplink, or description of next session focus")
  .option("-f, --from <harness>", "Explicit source harness (codex, claude, commandcode, antigravity, opencode)")
  .option("-i, --inject", "Inject handoff directly into AGENTS.override.md and CLAUDE.md")
  .option("--focus <text>", "Explicit description of what the next session will focus on")
  .option("--out <path>", "Custom output path for the handoff markdown file (defaults to HANDOFF.md in project root)")
  .option("--no-clipboard", "Do not copy kickstart prompt to clipboard")
  .option("--cwd <path>", "Target working directory (defaults to current working directory)")
  .action(async (threadOrFocus, options) => {
    p.intro(pc.bgCyan(pc.black(" AI Harness Handoff ")))

    const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd()
    const fromHarness = options.from ? (options.from.toLowerCase() as HarnessType) : undefined

    let threadOrDeeplink: string | undefined
    let focus: string | undefined = options.focus

    if (threadOrFocus) {
      if (isSessionIdentifier(threadOrFocus)) {
        threadOrDeeplink = threadOrFocus
      } else if (!focus) {
        focus = threadOrFocus
      }
    }

    const s = p.spinner()

    // 1. Session discovery
    s.start("Scanning local harness stores for active sessions in this repository...")
    const orchestrator = new SessionOrchestrator()
    const candidates = await orchestrator.discoverCandidates({
      cwd,
      fromHarness,
      threadOrDeeplink,
    })

    if (candidates.length === 0) {
      s.stop(pc.yellow("No active session found"))
      p.log.warn(
        `Could not locate a recent session for ${pc.cyan(cwd)}. You can pass a direct deeplink or session ID as an argument.`
      )
      p.outro(pc.gray("Exited without writing handoff."))
      return
    }

    let session: NormalizedSession
    if (candidates.length === 1 || Boolean(threadOrDeeplink)) {
      session = candidates[0]
      s.stop(
        `Found session in ${pc.bold(session.harness.toUpperCase())}: ${pc.cyan(session.title || session.sessionId)}`
      )
    } else {
      s.stop(`Found ${candidates.length} candidate sessions for this repository.`)
      // Prompt user to select
      const choice = await p.select({
        message: "Select which session to hand off from:",
        options: candidates.map((c) => ({
          value: c,
          label: `[${c.harness.toUpperCase()}] ${c.title || c.sessionId}`,
          hint: `Updated ${new Date(c.updatedAt).toLocaleString()}`,
        })),
      })

      if (p.isCancel(choice)) {
        p.cancel("Handoff cancelled.")
        return
      }

      session = choice as NormalizedSession
    }

    // 2. Context enrichment
    s.start("Enriching repository state (Git & OpenSpec)...")
    const gitEnricher = new GitEnricher()
    const openspecEnricher = new OpenSpecEnricher()

    const [gitCtx, openspecCtx] = await Promise.all([
      gitEnricher.getGitContext(cwd),
      openspecEnricher.getOpenSpecContext(cwd),
    ])
    s.stop("Repository and task state enriched.")

    // 3. Synthesis & Writing
    s.start("Synthesizing HANDOFF.md with secret redaction and skill suggestions...")
    const synthesizer = new MarkdownSynthesizer()
    const payload = synthesizer.buildPayload(session, gitCtx, openspecCtx, focus)
    const markdown = synthesizer.generateMarkdown(payload)

    const outputPath = options.out ? path.resolve(options.out) : path.join(cwd, "HANDOFF.md")
    fs.writeFileSync(outputPath, markdown, "utf8")

    if (!options.out) {
      ensureGitExcluded(cwd, "HANDOFF.md")
      s.stop(`Generated ${pc.green("HANDOFF.md")} (auto-excluded in .git/info/exclude).`)
    } else {
      s.stop(`Generated ${pc.green(outputPath)}.`)
    }

    // 4. Optional injection
    if (options.inject) {
      const injector = new ContextInjector()
      const injected = injector.inject(cwd, markdown)
      p.log.success(`Injected context block into: ${pc.cyan(injected.join(", "))}`)
    }

    // 5. Clipboard copy
    if (options.clipboard !== false) {
      const copied = await copyToClipboard(payload.promptKickstart)
      if (copied) {
        p.log.success(pc.green("Kickstart prompt copied to clipboard! Ready to paste into your next AI harness."))
      } else {
        p.log.info("Prompt kickstart:\n" + pc.italic(payload.promptKickstart))
      }
    }

    p.note(
      `Objective: ${pc.bold(payload.objective.slice(0, 80))}\n` +
        `Git Modified: ${gitCtx.modifiedFiles.length} file(s)\n` +
        `OpenSpec: ${openspecCtx.summary || "N/A"}\n` +
        `Suggested Skills: ${payload.suggestedSkills?.length || 0} recommended\n` +
        `Next Step: ${payload.nextSteps[0] || "Review HANDOFF.md"}`,
      "Handoff Summary"
    )

    p.outro(pc.bgGreen(pc.black(" Handoff ready! ")))
  })

program
  .command("clear")
  .description("Remove HANDOFF.md and strip any injected context blocks from instruction files")
  .option("--cwd <path>", "Target working directory (defaults to current working directory)")
  .action((options) => {
    p.intro(pc.bgYellow(pc.black(" Clear AI Handoff ")))
    const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd()

    const injector = new ContextInjector()
    const { removedHandoff, cleanedFiles } = injector.clear(cwd)

    if (removedHandoff) {
      p.log.success(`Deleted ${pc.green("HANDOFF.md")}`)
    } else {
      p.log.info("No HANDOFF.md found to delete.")
    }

    if (cleanedFiles.length > 0) {
      p.log.success(`Cleaned handoff blocks from: ${pc.cyan(cleanedFiles.join(", "))}`)
    }

    p.outro(pc.green("Repository state is clean."))
  })

program.parse()
