# session-handoff Specification

## Purpose
Enables automated session discovery, telemetry extraction, and context synthesis across AI coding harnesses to generate structured handoff documents and bridge workflow transitions.

## Requirements

### Requirement: Automated Cross-Harness Session Discovery
The system SHALL scan standard local storage locations for OpenAI Codex, Claude Code, CommandCode, Google Antigravity, and OpenCode, identifying the most recently active session whose working directory matches the current project folder.

#### Scenario: Auto-detect latest session in current directory
- **WHEN** user executes `handoff` without arguments inside a project repository
- **THEN** the system scans all supported harness session stores, matches `process.cwd()`, and selects the session with the most recent timestamp.

#### Scenario: Explicit harness flag override
- **WHEN** user executes `handoff --from codex`
- **THEN** the system restricts discovery exclusively to Codex sessions matching the current directory.

#### Scenario: Explicit thread deeplink or ID override
- **WHEN** user executes `handoff codex://threads/01a13d17-987f-7fb2-aa0e-9110273ecbd7`
- **THEN** the system bypasses directory auto-discovery and directly loads the specified thread log.

### Requirement: Multi-Harness Session Log Parsing
The system SHALL extract user objectives, assistant responses, executed tool actions, and modified file paths from the native log formats of each supported harness.

#### Scenario: Parse OpenAI Codex session
- **WHEN** extracting from a Codex session
- **THEN** the system parses `~/.codex/sessions/**/rollout-*.jsonl`, extracting `task_started`, `user_message`, `assistant_message`, and command execution events.

#### Scenario: Parse Claude Code session
- **WHEN** extracting from a Claude Code session
- **THEN** the system parses `~/.claude/projects/<slugified-path>/*.jsonl`, extracting user requests, queue operations, and tool actions.

#### Scenario: Parse CommandCode session
- **WHEN** extracting from a CommandCode session
- **THEN** the system parses `~/.commandcode/projects/<slugified-path>/*.jsonl` and associated `.meta.json`, extracting thread titles and conversation turns.

#### Scenario: Parse Google Antigravity session
- **WHEN** extracting from an Antigravity session
- **THEN** the system parses `~/.gemini/antigravity/brain/<id>/.system_generated/logs/transcript.jsonl`, extracting user inputs, planner responses, and tool calls.

#### Scenario: Parse OpenCode session
- **WHEN** extracting from an OpenCode session
- **THEN** the system invokes `opencode2 export` or reads local session state, extracting exported JSON turns.

### Requirement: Repository and Task Context Enrichment
The system SHALL enrich extracted session events with real-time repository state, including Git status, modified uncommitted files, and active OpenSpec tasks.

#### Scenario: Enrich with Git status
- **WHEN** synthesizing a handoff in a Git repository
- **THEN** the system queries `git status --short` and `git diff --stat`, recording modified, untracked, and staged files.

#### Scenario: Enrich with OpenSpec change progress
- **WHEN** the project contains an active OpenSpec change
- **THEN** the system queries `openspec status --json`, recording task completion ratios, in-progress tasks, and release blockers.

### Requirement: Standardized Handoff Document Generation
The system SHALL synthesize extracted telemetry into a standardized Markdown document at `HANDOFF.md` and copy a kickstart prompt to the system clipboard.

#### Scenario: Generate HANDOFF.md
- **WHEN** synthesis completes successfully
- **THEN** the system writes `HANDOFF.md` in the project root containing Objective, Session Origin, Completed Work, Active Code Changes, OpenSpec Progress, Blockers, and Recommended Next Action.

#### Scenario: Copy kickstart prompt to clipboard
- **WHEN** `HANDOFF.md` is written
- **THEN** the system formats a concise prompt referencing `HANDOFF.md` and writes it to the system clipboard.

### Requirement: Ephemeral Lifecycle and Injection Control
The system SHALL treat `HANDOFF.md` as local ephemeral state by default, support optional injection into harness instruction files, and provide cleanup capabilities.

#### Scenario: Ensure Git exclusion
- **WHEN** `HANDOFF.md` is generated
- **THEN** the system verifies `HANDOFF.md` is ignored by Git, appending it to `.git/info/exclude` if not already ignored.

#### Scenario: Instruction file injection
- **WHEN** user executes `handoff --inject`
- **THEN** the system appends a delimited handoff context block into `AGENTS.override.md` and `CLAUDE.md`.

#### Scenario: Handoff cleanup
- **WHEN** user executes `handoff clear`
- **THEN** the system removes `HANDOFF.md` and strips any injected delimiter blocks from instruction files.
