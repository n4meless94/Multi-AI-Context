# Design: Cross-Harness AI Session Handoff CLI

## Context

See `proposal.md` for problem motivation and background. Developers run multiple AI coding harnesses on a single workstation (OpenAI Codex, Claude Code, CommandCode, Google Antigravity, OpenCode). Switching harnesses mid-task due to rate limits or model capabilities currently suffers from complete context loss.

## Goals / Non-Goals

**Goals:**
- Provide a single, fast command (`handoff`) that automatically bridges the active conversation and repository state from any supported harness into a standardized handover document.
- Parse local session data deterministically without requiring external API tokens or running background daemons.
- Deliver context to the next harness with zero friction via `HANDOFF.md`, clipboard copy, and optional instruction file injection (`--inject`).
- Ensure repo cleanliness via Git exclusion guards and `handoff clear`.

**Non-Goals:**
- Continuous background daemon or file system watcher (the tool is intentionally invoked on-demand when switching harnesses).
- Direct bi-directional real-time socket communication between different running harness processes.
- Remote server synchronization or multi-tenant cloud storage.

## Decisions

### 1. Technology Stack & Packaging
- **Runtime:** Node.js (>= 20) with TypeScript.
- **Package Manager:** `pnpm`.
- **CLI Framework:** `commander` for command definitions, options, and subcommands.
- **Bundler:** `tsup` (esbuild-based) compiling into a clean standalone ESM executable in `dist/cli.js` with shebang `#!/usr/bin/env node`.
- **UI / Feedback:** `@clack/prompts` and `picocolors` for terminal spinners and formatted output.

### 2. Extractor Architecture (`SessionExtractor`)
Each harness has an isolated extractor implementing a standard TypeScript interface:
```typescript
interface NormalizedTurn {
  role: 'user' | 'assistant' | 'tool';
  timestamp: string;
  content: string;
  toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
  filesModified?: string[];
}

interface NormalizedSession {
  harness: 'codex' | 'claude' | 'commandcode' | 'antigravity' | 'opencode';
  sessionId: string;
  title?: string;
  cwd: string;
  updatedAt: string;
  turns: NormalizedTurn[];
}

interface SessionExtractor {
  harness: string;
  isAvailable(): Promise<boolean>;
  findLatestSession(cwd: string): Promise<NormalizedSession | null>;
  getSessionById(id: string): Promise<NormalizedSession | null>;
}
```

### 3. Harness Storage & Path Matching Strategies
- **Codex:** Reads `~/.codex/sessions/**/rollout-*.jsonl` matching `payload.thread_settings.cwd` against `process.cwd()`. Uses `session_index.jsonl` to resolve thread titles.
- **Claude Code:** Matches directory slug under `~/.claude/projects/<slug>` (where path separators and spaces are replaced with dashes). Reads `<uuid>.jsonl` lines.
- **CommandCode:** Scans `~/.commandcode/projects/<slug>/*.jsonl` and `<uuid>.meta.json` where slug corresponds to normalized project directory.
- **Antigravity:** Resolves `~/.gemini/antigravity/brain/<id>/.system_generated/logs/transcript.jsonl` where step 0 workspace metadata matches `process.cwd()`.
- **OpenCode:** Invokes `opencode2 export --session <id>` (or default active session) via CLI process execution.

### 4. Hybrid Synthesis Pipeline
1. **Rule-Based Synthesis (Default, Offline):**
   - Extracts initial task description from the earliest relevant user prompt in the active turn sequence.
   - Aggregates modified files from tool calls (`edit_file`, `replace_file_content`, `write_to_file`).
   - Runs `git status --short` and `git diff --stat` to capture live uncommitted code modifications.
   - Inspects `openspec status --json` when `openspec/` is present to summarize active change tasks and release gates.
   - Extracts the assistant's final response as "Last Completed Action".
2. **Optional LLM Narrative Synthesis (`--summarize`):**
   - When specified with an available model provider, passes the normalized turns through a lightweight summarizer to produce a concise executive briefing.

### 5. Consumption & Delivery Lifecycle
- **Default:** Writes `HANDOFF.md` to project root. Appends `HANDOFF.md` to `.git/info/exclude` if not already ignored, ensuring zero Git status pollution.
- **Clipboard Prompt:** Copies a ready-to-paste instruction:
  > *"I am continuing work from a previous session. Please read HANDOFF.md in the project root to understand what was done, current modified files, and open tasks. Let's proceed with the next step."*
- **`--inject` Flag:** Writes a delimited block into `AGENTS.override.md` and `CLAUDE.md`:
  ```markdown
  <!-- AI-HANDOFF-START -->
  ... contents of HANDOFF.md ...
  <!-- AI-HANDOFF-END -->
  ```
- **`handoff clear`:** Deletes `HANDOFF.md` and strips `<!-- AI-HANDOFF-START -->` blocks from instruction files.

## Risks / Trade-offs

- **[Risk: Harness log format updates]** → **Mitigation:** Extractors use defensive parsing with schema validation and fallback regex heuristics. If detailed turn parsing fails, the extractor falls back to raw turn text extraction.
- **[Risk: Large multi-megabyte session logs]** → **Mitigation:** Use reverse line streaming (tailing) to read only the last 30-50 events rather than parsing entire multi-turn JSONL archives.
- **[Risk: Accidental secret leakage in handoff]** → **Mitigation:** Apply a sanitizer pass on synthesized output to mask potential API keys, bearer tokens, or password strings.
