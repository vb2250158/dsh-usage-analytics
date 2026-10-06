/** Host plugin exports; browser responses contain Skill statistics only. */
import type { Context } from '@deepseek-ai/cordis'
import type { SkillUsageConfigInput } from './config.js'

export { Config } from './config.js'
export type { SkillUsageConfig, SkillUsageConfigInput, SkillUsagePeriod } from './config.js'
export type {
  ScanResult, SkillSourceCounts, SkillStatisticsResponse,
  SkillUsage, SkillUsageDay, SkillUsageRange, SkillUsageRow,
} from './types.js'

/** Cordis plugin identity. */
export declare const name: 'usage-analytics'
/** Services required by the observer; the Web route is an optional injection. */
export declare const inject: string[]
/** Statistics route consumed by the browser face. */
export declare const API: { stats: '/api/dsh-usage-analytics/stats' }

/**
 * Register the read-only observer and authenticated route as reversible effects.
 * @param ctx - DSH host plugin context.
 * @param input - Deployment settings, validated before activation.
 */
export declare function apply(ctx: Context, input?: SkillUsageConfigInput): void
