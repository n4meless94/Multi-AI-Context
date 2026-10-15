# Proposal: Cross-Harness AI Session Handoff CLI

## Why

Developers frequently switch between AI coding harnesses (such as OpenAI Codex, Google Antigravity, Claude Code, CommandCode, and OpenCode) when encountering model rate limits, token budget exhaustion, or specialized harness strengths. Currently, switching harnesses requires manual context recreation, copying raw session deeplinks, and digging through disparate on-disk session logs to figure out what was done, what files were edited, and what tasks remain blocked. 

This change introduces a standalone CLI tool (`handoff`) that automatically extracts session history, modified files, uncommitted Git diffs, and OpenSpec progress across supported harnesses, synthesizing them into a standardized, ephemeral `HANDOFF.md` and copying a kickstart prompt to the clipboard so any incoming AI assistant can immediately resume work with zero context loss.

## What Changes

- Add a modern TypeScript CLI executable (`handoff`) built with Commander, tsup, and `@clack/prompts`.
- Implement automated session discovery that locates the most recent session matching the current working directory (`process.cwd()`) across:
  - OpenAI Codex (`~/.codex/sessions/**/rollout-*.jsonl`, `~/.codex/session_index.jsonl`)
  - Claude Code (`~/.claude/projects/<slugified-path>/*.jsonl`)
  - CommandCode (`~/.commandcode/projects/<slugified-path>/*.jsonl`, `*.meta.json`)
  - Google Antigravity (`~/.gemini/antigravity/brain/<id>/.system_generated/logs/transcript.jsonl`)
  - OpenCode (`opencode2 export` CLI or local storage)
- Support manual overrides via CLI flags (`--from <harness>`) or explicit deeplinks/thread IDs (e.g., `codex://threads/<id>`).
- Implement deterministic rule-based extraction by default (parsing user goals, assistant summaries, tool invocations, modified files, Git status, and OpenSpec task progress) with an optional `--summarize` flag for LLM narrative synthesis.
- Generate a standardized `HANDOFF.md` in the project root containing:
  - Objective & session source
  - Completed actions & decisions
  - Modified files & Git status summary
  - Active OpenSpec tasks & blockers
  - Immediate recommended next steps
- Copy a concise kickstart prompt directly to the system clipboard upon generation.
- Support dual consumption modes:
  - Default: `HANDOFF.md` kept local and ignored by Git (checked via `.git/info/exclude` or `.gitignore`).
  - `--inject`: Option to directly update harness guidance files (`AGENTS.override.md`, `CLAUDE.md`, etc.) for silent startup ingestion.
- Provide a `handoff clear` command to remove `HANDOFF.md` and revert any injected harness guidance blocks.

## Capabilities

### New Capabilities
- `session-handoff`: Multi-harness session discovery, extraction, synthesis, and handoff artifact generation across Codex, Claude Code, CommandCode, Antigravity, and OpenCode.

### Modified Capabilities
<!-- None: Greenfield capability -->

## Impact

- **New package / repository**: Node.js/TypeScript CLI project in this repository.
- **Dependencies**: `commander`, `tsup`, `@clack/prompts`, `picocolors`, `execa`, `clipboardy` (or native PowerShell clipboard fallback), `globby` / `fast-glob`.
- **Runtime**: Node.js >= 20 (environment runs Node 24.11.1).
- **No breaking changes**: Purely additive developer tooling.
