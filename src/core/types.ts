export type HarnessType = 'codex' | 'claude' | 'commandcode' | 'antigravity' | 'opencode'

export interface ToolCall {
  name: string
  args?: Record<string, unknown>
}

export interface NormalizedTurn {
  role: 'user' | 'assistant' | 'tool' | 'system'
  timestamp: string
  content: string
  toolCalls?: ToolCall[]
  filesModified?: string[]
}

export interface NormalizedSession {
  harness: HarnessType
  sessionId: string
  title?: string
  cwd: string
  updatedAt: string
  turns: NormalizedTurn[]
}

export interface SessionExtractor {
  harness: HarnessType
  name: string
  isAvailable(): Promise<boolean>
  findLatestSession(cwd: string): Promise<NormalizedSession | null>
  getSessionById(id: string): Promise<NormalizedSession | null>
}

export interface GitContext {
  isRepo: boolean
  branch?: string
  modifiedFiles: string[]
  untrackedFiles: string[]
  diffSummary?: string
  recentCommits: string[]
}

export interface OpenSpecContext {
  hasOpenSpec: boolean
  activeChange?: string
  completedTasks: number
  totalTasks: number
  blockedGates: string[]
  summary?: string
}

export interface HandoffPayload {
  generatedAt: string
  session: NormalizedSession
  git: GitContext
  openspec: OpenSpecContext
  objective: string
  lastAction: string
  completedWork: string[]
  nextSteps: string[]
  suggestedSkills?: string[]
  promptKickstart: string
}
