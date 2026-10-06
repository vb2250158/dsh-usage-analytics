/** Pure folds over current DSH session events; callers remove inherited prefixes. */
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type {
  Aggregate, AggregateInsights, CountEntry, FoldSessionHeader, SessionStats,
  SessionStatsCollection, SkillUsage, SkillUsageRange, Streaks, TokenCounters,
} from './types.js'

export declare const FOLD_TYPES: Set<string>
export declare const UNKNOWN_MODEL: '(unknown)'
export declare function isFoldType(type: string): boolean
export declare function dayKey(ms: number): string
export declare function weekKey(ms: number): string
export declare function emptyTokens(): TokenCounters
export declare function createSessionStats(header: FoldSessionHeader): SessionStats
export declare function addUsage(target: TokenCounters, usage: { inputTokens?: number; outputTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number; reasoningTokens?: number }): void
export declare function foldEvent(stats: SessionStats, event: SessionEvent): number | undefined
export declare function foldEvents(stats: SessionStats, events: readonly SessionEvent[]): number
export declare function aggregateSession(header: FoldSessionHeader, events: readonly SessionEvent[]): SessionStats
export declare function emptyAggregate(): Aggregate
export declare function mergeInto(aggregate: Aggregate, stats: SessionStats): void
/**
 * Derive rankings without modifying cached metadata. Failed model attempts count.
 * @param sessions - Session folds containing only their own events.
 * @param options - Inclusive from and exclusive to epoch-ms cutoffs.
 * @returns Source counts, ranked rows, and local-calendar day totals.
 */
export declare function buildSkillUsage(sessions: SessionStatsCollection, options?: SkillUsageRange): SkillUsage
export declare function isGhostSession(stats: SessionStats): boolean
export declare function aggregateFromSessions(sessions: SessionStatsCollection): Aggregate
export declare function activeDaySet(aggregate: Aggregate): Set<string>
export declare function streakEndingAt(active: Set<string>, endDay: string): number
export declare function computeStreaks(active: Set<string>, now?: number): Streaks
export declare function topN(counts: Record<string, number>, limit?: number): CountEntry[]
export declare function computeInsights(aggregate: Aggregate, sessions?: SessionStatsCollection, now?: number): AggregateInsights
