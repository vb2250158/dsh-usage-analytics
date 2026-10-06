/** Metadata and aggregate results derived from persisted DSH session events. */
import type { SessionHeader, SessionId } from '@deepseek-ai/dsh-session'
import type { SkillUsagePeriod } from './config.js'

/** Header fields read by the pure fold, including retained upstream metadata. */
export type FoldSessionHeader = Pick<SessionHeader, 'id' | 'createdAt' | 'cwd' | 'parentSession' | 'origin'> & {
  agentPreset?: string
  delegationDepth?: number
}

/** One invocation's cached metadata; no message content or raw arguments. */
export interface SkillInvocation {
  seq: number
  time: number | null
  name: string
  source: 'model' | 'user'
  status: 'pending' | 'succeeded' | 'failed'
  callId?: string
}

export interface SkillUsageRange {
  /** Inclusive epoch-ms cutoff. */
  from?: number
  /** Exclusive epoch-ms cutoff. */
  to?: number
}

export interface SkillSourceCounts {
  modelCalls: number
  userCalls: number
  failedCalls: number
  /** Observed model attempts with no paired durable result. */
  pendingCalls: number
}

export interface SkillUsageRow extends SkillSourceCounts {
  name: string
  /** Model attempts, including failures, plus confirmed user loads. */
  calls: number
  sessionCount: number
  /** Last invocation timestamp in the selected period, or null when absent. */
  lastUsedAt: number | null
}

export interface SkillUsageDay extends SkillSourceCounts {
  calls: number
  sessionCount: number
}

export interface SkillUsage extends SkillSourceCounts {
  totalCalls: number
  /** Named Skills; excludes the Unknown Skill placeholder. */
  uniqueSkills: number
  sessionCount: number
  unattributedCalls: number
  rows: SkillUsageRow[]
  /** Local-calendar YYYY-MM-DD totals after exact timestamp filtering. */
  days: Record<string, SkillUsageDay>
}

export interface ScanResult {
  folded?: number
  skipped?: number
  failed: number
  stale: boolean
  error?: string
}

/** Successful statistics endpoint response; authentication failures use errors. */
export interface SkillStatisticsResponse {
  generatedAt: number
  period: SkillUsagePeriod
  from: number | null
  skillUsage: SkillUsage
  refreshIntervalMs: number
  scan: Partial<ScanResult> & { pending: boolean; pollAfterMs: number }
}

/** Upstream fold state retained internally; not the statistics route response. */
export interface TokenCounters {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  reasoning: number
  total: number
}

export interface ModelBucket {
  calls: number
  tokens: TokenCounters
  dayTokens: Record<string, number>
  dayRaw: Record<string, number>
  dayOutput: Record<string, number>
  dayCalls: Record<string, number>
}

/** Resumable metadata fold over the session's own non-inherited events. */
export interface SessionStats {
  id: SessionId
  createdAt: number
  cwd?: string
  agentPreset?: string
  origin?: 'subagent'
  delegationDepth: number
  parentSession?: SessionId
  firstAt?: number
  lastAt?: number
  lastUsageAt?: number
  turns: number
  steps: number
  userMessages: number
  toolCalls: number
  tokens: TokenCounters
  tools: Record<string, number>
  skills: Record<string, number>
  skillInvocations: SkillInvocation[]
  plugins: Record<string, number>
  subagentToolCalls: number
  models: Record<string, ModelBucket>
  reasoningEfforts: Record<string, number>
  dayTokens: Record<string, number>
  dayTokensRaw: Record<string, number>
  dayOutput: Record<string, number>
  dayTurns: Record<string, number>
  daySteps: Record<string, number>
  dayToolCalls: Record<string, number>
  dayUserMessages: Record<string, number>
  hourTokens: Record<string, number>
  hourlyTokens: Record<string, number>
  hourlyOutput: Record<string, number>
  hourlyNewTokens: Record<string, number>
  currentModel: string
  currentEffort?: string
  foldedSeq?: number
}

export type SessionStatsCollection = Map<string, SessionStats> | Record<string, SessionStats>

export interface DayCell {
  tokens: number
  tokensRaw: number
  output: number
  turns: number
  steps: number
  toolCalls: number
  userMessages: number
  sessions: number
}

export interface WeekCell {
  tokens: number
  tokensRaw: number
  turns: number
  steps: number
  toolCalls: number
  sessions: number
}

/** Retained pure upstream aggregate, not returned by the current Web route. */
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
  models: Record<string, ModelBucket & { sessions: number }>
  reasoningEfforts: Record<string, number>
  tools: Record<string, number>
  skills: Record<string, number>
  plugins: Record<string, number>
  presets: Record<string, number>
  days: Record<string, DayCell>
  weeks: Record<string, WeekCell>
  hours: Record<string, number>
  hourlyTokens: Record<string, number>
  hourlyOutput: Record<string, number>
  hourlyNewTokens: Record<string, number>
  firstAt?: number
  lastAt?: number
}

export interface CountEntry { name: string; count: number }
export interface Streaks { current: number; longest: number; longestStart?: string; longestEnd?: string }
export interface AggregateInsights {
  activeDays: number
  firstDay?: string
  lastDay?: string
  spanDays: number
  avgTokensPerSession: number
  avgStepsPerTurn: number
  avgSessionMs: number
  currentStreakDays: number
  longestStreakDays: number
  longestStreakStart?: string
  longestStreakEnd?: string
  peakDay?: { day: string; tokens: number; turns: number }
  rawInput: number
  grandTotal: number
  topModel?: { name: string; tokens: number }
  topTool?: CountEntry
  topSkill?: CountEntry
  topPlugin?: CountEntry
  topEffort?: CountEntry
  inputPct: number
  outputPct: number
  cacheWritePct: number
  cacheShareOfInput: number
  reasoningShare: number
  subagentSessions: number
  subagentToolCalls: number
  skillCalls: number
  pluginCalls: number
  toolCalls: number
  longestSession?: { id: SessionId; ms: number; tokens: number; day: string }
  peakSession?: { id: SessionId; tokens: number; day: string }
  busyHour?: CountEntry
}
