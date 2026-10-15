# Tasks

## 1. Project Scaffolding & Dependencies

- [x] 1.1 Initialize `package.json`, configure `tsconfig.json` and `tsup.config.ts`, and install dependencies (`commander`, `tsup`, `@clack/prompts`, `picocolors`, `execa`). Verify `pnpm install` and build succeed.
- [x] 1.2 Define core interfaces (`NormalizedTurn`, `NormalizedSession`, `SessionExtractor`, `HandoffPayload`) in `src/core/types.ts`. Verify TypeScript compiler passes without errors.

## 2. Harness Session Extractors

- [x] 2.1 Implement OpenAI Codex extractor (`src/extractors/codex.ts`) parsing `~/.codex/sessions/**/rollout-*.jsonl` and `session_index.jsonl`. Verify unit test passes with synthetic Codex JSONL fixture.
- [x] 2.2 Implement Claude Code extractor (`src/extractors/claude.ts`) resolving slugified project directories under `~/.claude/projects/`. Verify unit test passes with synthetic Claude Code fixture.
- [x] 2.3 Implement CommandCode extractor (`src/extractors/commandcode.ts`) reading project JSONL and `.meta.json` from `~/.commandcode/projects/`. Verify unit test passes with synthetic CommandCode fixture.
- [x] 2.4 Implement Google Antigravity extractor (`src/extractors/antigravity.ts`) parsing brain transcript logs and conversation databases. Verify unit test passes with synthetic Antigravity transcript fixture.
- [x] 2.5 Implement OpenCode extractor (`src/extractors/opencode.ts`) invoking `opencode2 export` CLI or reading local session state. Verify unit test passes with synthetic OpenCode fixture.

## 3. Session Discovery & Context Enrichment

- [x] 3.1 Implement multi-harness session discovery orchestrator (`src/core/orchestrator.ts`) comparing timestamps across harnesses for `process.cwd()`. Verify discovery correctly identifies the most recent session.
- [x] 3.2 Implement Git status and diff enricher (`src/enrichers/git.ts`) capturing branch name, modified files, and uncommitted diff summary. Verify test runs against local Git repo.
- [x] 3.3 Implement OpenSpec context enricher (`src/enrichers/openspec.ts`) parsing active change tasks and release gate status. Verify test parses sample OpenSpec JSON output.

## 4. Synthesis & Output Generation

- [x] 4.1 Implement Markdown synthesizer (`src/synthesizer/markdown.ts`) producing standardized `HANDOFF.md` with executive summary, completed work, modified files, blockers, and next steps. Verify output formatting against spec.
- [x] 4.2 Implement clipboard integration (`src/utils/clipboard.ts`) copying kickstart prompt to system clipboard. Verify prompt text is written to clipboard.
- [x] 4.3 Implement Git exclusion guard ensuring `HANDOFF.md` is appended to `.git/info/exclude` if not already ignored. Verify `.git/info/exclude` contains `HANDOFF.md`.
- [x] 4.4 Implement dual-mode instruction file injection (`src/synthesizer/injector.ts`) supporting `--inject` and `handoff clear` cleanup. Verify injection and removal tests pass.

## 5. CLI Wiring & End-to-End Verification

- [x] 5.1 Wire Commander CLI commands (`handoff`, `handoff clear`) with interactive `@clack/prompts` output in `src/cli.ts`. Verify `handoff --help` and `handoff clear --help` execute cleanly.
- [x] 5.2 Run end-to-end integration test creating a live handoff in a test directory and verifying `HANDOFF.md`, clipboard output, and clean removal.
