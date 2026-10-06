/** Rebuildable metadata cache over read-only DSH persistence handles. */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { buildSkillUsage, createSessionStats, foldEvents } from './aggregate.js'

// New invocation metadata requires rebuilding predecessor caches from logs.
const CACHE_VERSION = 10

/** Run a bounded pool without launching background child processes. */
async function mapLimit(items, limit, worker) {
  let next = 0
  const results = new Array(items.length)
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await worker(items[index])
    }
  }))
  return results
}

/** Stored cache is untrusted; invalid rows trigger a log rebuild. */
function validCachedSession(stats) {
  return stats !== null && typeof stats === 'object'
    && typeof stats.id === 'string' && Array.isArray(stats.skillInvocations)
    && stats.skillInvocations.every(item => item !== null && typeof item === 'object'
      && typeof item.name === 'string' && Number.isSafeInteger(item.seq)
      && (item.time === undefined || item.time === null || Number.isFinite(item.time))
      && ['model', 'user'].includes(item.source)
      && ['pending', 'succeeded', 'failed'].includes(item.status))
}

/** Owner of derived counts and persistence watermarks, never of session data. */
export class AnalyticsStore {
  /**
   * @param options - Persistence service, cache directory, refresh settings,
   *   and optional logger. Config resolves all deployment defaults first.
   */
  constructor({ persistence, dataDir, flushRefreshMs, foldConcurrency, logger = console }) {
    this.persistence = persistence
    this.dataDir = dataDir
    this.flushRefreshMs = flushRefreshMs
    this.foldConcurrency = foldConcurrency
    this.logger = logger
    this.sessions = new Map()
    this.folds = new Map()
    this.built = false
    this.lastScan = undefined
    this.refreshPromise = undefined
    this.persistPromise = Promise.resolve()
    this.refreshTimer = undefined
    this.disposed = false
  }

  /** Load validated metadata; service-instance revision tokens are never reused. */
  async load() {
    try {
      const raw = JSON.parse(await readFile(join(this.dataDir, 'agg.json'), 'utf8'))
      if (raw?.version !== CACHE_VERSION || !Array.isArray(raw.sessions)
        || !raw.sessions.every(validCachedSession)) return
      this.sessions = new Map(raw.sessions.map(stats => [stats.id, stats]))
      // A reopened service must read once before treating cached rows as fresh.
    } catch (error) {
      if (error.code !== 'ENOENT') this.logger.warn('[skill-usage] rebuilding unreadable cache:', error.message)
    }
  }

  /**
   * Serialize atomic cache writes, including the final unload write.
   * @param options - Final unload writes may run after disposal begins.
   * @returns Completion of this cache write.
   */
  async persist({ final = false } = {}) {
    if (this.disposed && !final) return
    const payload = JSON.stringify({ version: CACHE_VERSION, sessions: [...this.sessions.values()] })
    this.persistPromise = this.persistPromise.then(async () => {
      try {
        await mkdir(this.dataDir, { recursive: true, mode: 0o700 })
        const target = join(this.dataDir, 'agg.json')
        const temporary = `${target}.${randomUUID()}.tmp`
        await writeFile(temporary, payload, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
        await rename(temporary, target)
      } catch (error) {
        this.logger.warn('[skill-usage] cache write failed:', error.message)
      }
    })
    return this.persistPromise
  }

  /** Stop scheduling; the lifecycle owner then awaits scans and the final write. */
  dispose() {
    this.disposed = true
    clearTimeout(this.refreshTimer)
    this.refreshTimer = undefined
  }

  /**
   * Fold changed own-session tails. Concurrent readers share one scan.
   * @param options - Force a complete re-read instead of revision-based tails.
   * @returns Scan completion metadata; failed rows remain visibly stale.
   */
  async refresh({ force = false } = {}) {
    if (this.disposed) return this.lastScan
    if (this.refreshPromise) return this.refreshPromise
    this.refreshPromise = this.scan(force).finally(() => { this.refreshPromise = undefined })
    return this.refreshPromise
  }

  /** Schedule a scan without making the agent wait for analytics. */
  refreshAsync() {
    this.refresh().catch(error => this.logger.warn('[skill-usage] scan failed:', error.message))
  }

  /** Read metadata, close every handle, and advance watermarks after folding. */
  async scan(force) {
    let snapshots
    try { snapshots = await this.persistence.list() }
    catch (error) {
      this.logger.warn('[skill-usage] session list failed:', error.message)
      return this.lastScan = { stale: true, failed: 1, error: 'Session listing failed' }
    }
    const seen = new Set(snapshots.map(snapshot => snapshot.header.id))
    let removed = 0
    for (const id of this.sessions.keys()) {
      if (!seen.has(id)) { this.sessions.delete(id); this.folds.delete(id); removed += 1 }
    }
    const work = snapshots.filter(snapshot => force || this.folds.get(snapshot.header.id)?.revision !== snapshot.revision)
    const results = await mapLimit(work, this.foldConcurrency, async snapshot => {
      const id = snapshot.header.id
      try {
        const previous = force ? undefined : this.folds.get(id)
        const handle = await this.persistence.open(id, 'read')
        let events, from
        try {
          from = previous?.seq ?? handle.inheritedEventCount
          const read = await handle.read(from)
          events = read.events
        } finally { await handle.close() }
        const stats = previous ? this.sessions.get(id) : createSessionStats(snapshot.header)
        const seq = events.length ? foldEvents(stats, events) : from
        this.sessions.set(id, stats)
        this.folds.set(id, { revision: snapshot.revision, seq })
        return true
      } catch (error) {
        this.logger.warn(`[skill-usage] session ${id} scan failed:`, error.message)
        return false
      }
    })
    const folded = results.filter(Boolean).length
    const failed = results.length - folded
    if (folded || removed || force) await this.persist()
    this.built = failed === 0
    this.lastScan = { folded, skipped: snapshots.length - work.length, failed, stale: failed > 0 }
    return this.lastScan
  }

  /** Debounce scans triggered by committed session events. */
  scheduleRefreshSoon() {
    if (this.disposed || this.refreshTimer !== undefined) return
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined
      this.refreshAsync()
    }, this.flushRefreshMs)
  }

  /**
   * Return counts filtered by exact invocation timestamps.
   * @param options - Inclusive from and exclusive to epoch-ms cutoffs.
   * @returns Skill-only statistics with scan generation time.
   */
  snapshot(options = {}) {
    return { generatedAt: Date.now(), skillUsage: buildSkillUsage(this.sessions, options) }
  }
}
