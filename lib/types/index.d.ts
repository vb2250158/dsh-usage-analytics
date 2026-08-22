/**
 * dsh-usage-analytics — host half type surface.
 * Hand-written (the implementation is plain JS, no build step).
 */
import type { Context } from '@deepseek-ai/cordis'

/** Route family root (the client half fetches these exact paths). */
export declare const API: {
  readonly stats: '/api/dsh-usage-analytics/stats'
}

/** Stable cordis plugin name. */
export declare const name: 'usage-analytics'

/** Services required before the surfaces can mount. */
export declare const inject: string[]

/** Mount the analytics store, routes, and live listeners. */
export declare function apply(ctx: Context): void

export { AnalyticsStore } from './store.js'
export {
  aggregateSession,
  aggregateFromSessions,
  computeInsights,
  computeStreaks,
  createSessionStats,
  dayKey,
  emptyAggregate,
  foldEvent,
  foldEvents,
  mergeInto,
  topN,
  weekKey,
  activeDaySet,
  FOLD_TYPES,
  UNKNOWN_MODEL,
} from './aggregate.js'
export type { SessionStats } from './types.js'
