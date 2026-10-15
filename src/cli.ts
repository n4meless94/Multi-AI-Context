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
import type { HarnessType } from "./core/types.js"

const program = new Command()

program
  .name("handoff")
  .description("Cross-harness session discovery, extraction, and handoff tool for AI coding environments")
  .version("0.1.0")

program
  .argument("[threadOrDeeplink]", "Optional thread ID or deeplink (e.g., codex://threads/<id>)")
  .option("-f, --from <harness>", "Explicit source harness (codex, claude, commandcode, antigravity, opencode)")
  .option("-i, --inject", "Inject handoff directly into AGENTS.override.md and CLAUDE.md")
  .option("--no-clipboard", "Do not copy kickstart prompt to clipboard")
  .option("--cwd <path>", "Target working directory (defaults to current working directory)")
  .action(async (threadOrDeeplink, options) => {
    p.intro(pc.bgCyan(pc.black(" AI Harness Handoff ")))

    const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd()
    const fromHarness = options.from ? (options.from.toLowerCase() as HarnessType) : undefined

    const s = p.spinner()

    // 1. Session discovery
    s.start("Scanning local harness stores for active session...")
    const orchestrator = new SessionOrchestrator()
    const session = await orchestrator.discoverSession({
      cwd,
      fromHarness,
      threadOrDeeplink,
    })

    if (!session) {
      s.stop(pc.yellow("No active session found"))
      p.log.warn(
        `Could not locate a recent session for ${pc.cyan(cwd)}. You can pass a direct deeplink or thread ID as an argument.`
      )
      p.outro(pc.gray("Exited without writing handoff."))
      return
    }

    s.stop(`Found session in ${pc.bold(session.harness.toUpperCase())}: ${pc.cyan(session.title || session.sessionId)}`)

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
    s.start("Synthesizing HANDOFF.md...")
    const synthesizer = new MarkdownSynthesizer()
    const payload = synthesizer.buildPayload(session, gitCtx, openspecCtx)
    const markdown = synthesizer.generateMarkdown(payload)

    const handoffPath = path.join(cwd, "HANDOFF.md")
    fs.writeFileSync(handoffPath, markdown, "utf8")
    ensureGitExcluded(cwd, "HANDOFF.md")
    s.stop(`Generated ${pc.green("HANDOFF.md")} (excluded from Git).`)

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
