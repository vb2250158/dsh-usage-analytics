/** Configuration validated before the observer starts. */
import type Schema from '@deepseek-ai/schemastery'

export interface SkillUsageConfig {
  /** Absolute resolved directory for the rebuildable cache. */
  dataDir: string
  /** Browser refresh interval in milliseconds, at least 1000. */
  autoRefreshMs: number
  /** Browser polling interval during a scan, in milliseconds, at least 100. */
  scanPollMs: number
  /** Background scan interval in milliseconds, at least 1000. */
  backgroundRefreshMs: number
  /** Event-triggered scan delay in milliseconds, at least 0. */
  flushRefreshMs: number
  /** Maximum simultaneous read-only scans, an integer from 1 to 32. */
  foldConcurrency: number
  catalogRefreshMs: number
  catalogConcurrency: number
  catalogTimeoutMs: number
  pageSize: number
}

/** Omitted fields use the schema defaults; an empty dataDir uses DSH home. */
export type SkillUsageConfigInput = Partial<SkillUsageConfig>
/** Supported HTTP period keys; the default UI offers all, 7, and 30. */
export type SkillUsagePeriod = 'all' | 'today' | '24h' | '7' | '30' | '90'
export declare const Config: Schema<SkillUsageConfigInput, SkillUsageConfig>

/**
 * Validate settings and resolve the absolute cache directory.
 * @param input - Optional deployment overrides.
 * @returns Fully resolved observer settings.
 */
export declare function resolveConfig(input?: SkillUsageConfigInput): SkillUsageConfig
/**
 * Resolve a supported period or throw RangeError for an unsupported key.
 * @param period - HTTP period key.
 * @param now - Current epoch milliseconds.
 * @returns Inclusive lower bound, or undefined for all retained history.
 */
export declare function periodStart(period: SkillUsagePeriod | string, now?: number): number | undefined
