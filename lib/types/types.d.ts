/**
 * Shared structural types for the analytics core. Hand-written mirror of the
 * plain-JS shapes (not generated).
 */

/** Disjoint token counters (reasoning is a subset of output — never added to total). */
export interface TokenCounters {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  reasoning: number
  total: number
}

/** Per-session aggregated stats (the resumable fold state). */
export interface SessionStats {
  id: string
  createdAt: number
  cwd?: string
  agentPreset?: string
  origin?: 'subagent'
  delegationDepth: number
  parentSession?: string
  firstAt?: number
  lastAt?: number
  turns: number
  steps: number
  userMessages: number
  toolCalls: number
  tokens: TokenCounters
  tools: Record<string, number>
  skills: Record<string, number>
  plugins: Record<string, number>
  subagentToolCalls: number
  models: Record<string, { calls: number; tokens: TokenCounters }>
  reasoningEfforts: Record<string, number>
  dayTokens: Record<string, number>
  dayTurns: Record<string, number>
  daySteps: Record<string, number>
  dayToolCalls: Record<string, number>
  dayUserMessages: Record<string, number>
  hourTokens: Record<string, number>
  currentModel: string
  currentEffort?: string
  foldedSeq?: number
}

/** One day bucket in the global aggregate. */
export interface DayCell {
  tokens: number
  turns: number
  steps: number
  toolCalls: number
  userMessages: number
  sessions: number
}

/** The global aggregate served to the dashboard. */
export interface Aggregate {
  generatedAt: number
  sessions: number
  subagentSessions: number
  turns: number
  steps: number
  userMessages: number
  toolCalls: number
  skillCalls: number
  pluginCalls: number
  subagentToolCalls: number
  tokens: TokenCounters
  models: Record<string, { calls: number; tokens: TokenCounters; sessions: number }>
  reasoningEfforts: Record<string, number>
  tools: Record<string, number>
  skills: Record<string, number>
  plugins: Record<string, number>
  presets: Record<string, number>
  days: Record<string, DayCell>
  weeks: Record<string, { tokens: number; turns: number; steps: number; toolCalls: number; sessions: number }>
  hours: Record<string, number>
  firstAt?: number
  lastAt?: number
}
