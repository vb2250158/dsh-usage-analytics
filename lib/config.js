/** Validated deployment settings for the local skill-count observer. */
import Schema from '@deepseek-ai/schemastery'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

/** Cordis configuration; paths and refresh timing belong to the deployment. */
export const Config = Schema.object({
  dataDir: Schema.string().default('').description('Derived cache directory; empty uses $DSH_HOME/cache/skill-usage.'),
  autoRefreshMs: Schema.number().min(1000).default(30000).description('Dashboard refresh interval in milliseconds.'),
  scanPollMs: Schema.number().min(100).default(2000).description('Dashboard polling interval while a scan is running.'),
  backgroundRefreshMs: Schema.number().min(1000).default(60000).description('Background session scan interval in milliseconds.'),
  flushRefreshMs: Schema.number().min(0).default(15000).description('Delay before scanning after a committed session event.'),
  foldConcurrency: Schema.number().min(1).max(32).step(1).default(4).description('Maximum simultaneous read-only session scans.'),
  catalogRefreshMs: Schema.number().min(1000).default(60000).description('Lifetime of current Skill metadata before revalidation.'),
  catalogConcurrency: Schema.number().min(1).max(32).step(1).default(4).description('Maximum simultaneous workspace Skill service lookups.'),
  catalogTimeoutMs: Schema.number().min(100).default(3000).description('Timeout for each workspace Skill service lookup.'),
  pageSize: Schema.number().min(5).max(100).step(1).default(20).description('Maximum Skill ranking rows mounted on one page.'),
})

/**
 * Resolve defaults before the observer starts.
 * @param input - Plugin configuration, validated at activation.
 * @returns Settings with an absolute cache directory.
 */
export function resolveConfig(input = {}) {
  const config = Config(input)
  const envHome = process.env.DSH_HOME?.trim()
  return {
    ...config,
    dataDir: resolve(config.dataDir || join(envHome || join(homedir(), '.dsh'), 'cache', 'skill-usage')),
  }
}

/**
 * Resolve a supported dashboard period to an inclusive lower bound.
 * @param period - all, today, 24h, 7, 30, or 90.
 * @param now - Current epoch milliseconds.
 * @returns Epoch milliseconds, or undefined for the complete retained log.
 */
export function periodStart(period, now = Date.now()) {
  if (period === 'all') return undefined
  if (period === 'today') {
    const date = new Date(now)
    date.setHours(0, 0, 0, 0)
    return date.getTime()
  }
  if (period === '24h') return now - 24 * 60 * 60 * 1000
  if (['7', '30', '90'].includes(period)) return now - Number(period) * 24 * 60 * 60 * 1000
  throw new RangeError('Unsupported skill statistics period')
}
