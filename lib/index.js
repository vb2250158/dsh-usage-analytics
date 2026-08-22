/**
 * dsh-usage-analytics — host half.
 *
 * Aggregates real Harness usage from session event logs (via
 * ctx.sessionPersistence) into a private analytics cache, and serves the
 * dashboard data over the /api/dsh-usage-analytics route family. The browser
 * half (./client) renders the sidebar entry and the full-screen dashboard.
 *
 * Principles (from the feature brief):
 * - Read-only & decoupled: analytics never appends to sessions, never touches
 *   the agent loop's hot path. Live listeners are fire-and-forget and fully
 *   contained; a failing fold degrades the dashboard, never the GUI or an
 *   agent.
 * - No prompt content: the aggregation consumes event metadata and numeric
 *   usage only. Nothing user-authored is collected, persisted, or served.
 * - Loopback fence: the data routes are served for the local GUI only, same
 *   trust fence as the other plugin route families.
 */
import { join } from 'node:path'
import { AnalyticsStore } from './store.js'

/** Stable cordis plugin name. */
export const name = 'usage-analytics'

/** Services required before the surfaces can mount. */
export const inject = ['webServer', 'sessionPersistence', 'timer']

/** Route family root (the client half fetches these exact paths). */
export const API = {
  stats: '/api/dsh-usage-analytics/stats',
}

/** Loopback literal check plus browser same-origin markers (mirrors the family fence). */
function isLoopbackRequest(request) {
  const address = request.socket.remoteAddress
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') return false
  const host = request.headers.host
  if (typeof host !== 'string') return false
  let hostUrl
  try {
    hostUrl = new URL(`http://${host}`)
  } catch {
    return false
  }
  if (hostUrl.hostname !== '127.0.0.1' && hostUrl.hostname !== 'localhost' && hostUrl.hostname !== '[::1]') return false
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = request.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

/** One JSON response. */
function writeJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'referrer-policy': 'no-referrer',
    'cache-control': 'no-store',
  })
  res.end(payload)
}

/** Resolve the analytics data dir from the persistence backend's root. */
function resolveDataDir(persistence) {
  const root = persistence?.config?.root ?? process.env.DSH_HOME
  if (typeof root === 'string' && root !== '') {
    try {
      return join(root, '..', 'usage-analytics')
    } catch { /* fall through */ }
  }
  return join(process.cwd(), '.dsh-usage-analytics')
}

/**
 * Mount the analytics store, routes, and live listeners.
 * @param ctx - host plugin context (webServer / sessionPersistence / timer).
 */
export function apply(ctx) {
  const store = new AnalyticsStore({
    persistence: ctx.sessionPersistence,
    dataDir: resolveDataDir(ctx.sessionPersistence),
  })
  const loadPromise = store.load().catch(() => {})

  // One serialized refresh queue so concurrent dashboard tabs share scans.
  const refreshOnce = (force) => store.refresh({ force })

  // GET /api/dsh-usage-analytics/stats — serve the cached snapshot immediately
  // and re-fold changed sessions in the background, so opening the dashboard
  // never blocks on a full scan. The first request after a cache rebuild (or
  // `?force=1`) waits for the scan so the user sees real numbers, not zeros.
  const disposeStats = ctx.webServer.register({
    kind: 'exact',
    path: API.stats,
    handler: async (req, res) => {
      if (req.method !== 'GET') {
        writeJson(res, 405, { error: 'method not allowed' })
        return
      }
      if (!isLoopbackRequest(req)) {
        writeJson(res, 403, { error: 'forbidden: loopback-only' })
        return
      }
      const force = new URL(req.url ?? '/', 'http://localhost').searchParams.get('force') === '1'
      await loadPromise
      try {
        // Always serve the cached snapshot immediately and re-fold changed
        // sessions in the background — the dashboard never blocks on a scan
        // (the very first run shows an empty-but-instant dashboard that the
        // background build fills within seconds).
        const payload = store.snapshot()
        payload.scan = store.lastScan ?? { pending: true, stale: false, note: 'background refresh' }
        if (store.refreshPromise !== undefined) payload.scan.pending = true
        refreshOnce(force).catch((error) => {
          // Snapshot is already served; just log the background failure.
          console.warn('[dsh-usage-analytics] background refresh failed:', error?.message ?? error)
        })
        writeJson(res, 200, payload)
      } catch (error) {
        // Serve whatever we have — stale is better than an empty dashboard.
        const payload = store.snapshot()
        payload.scan = { stale: true, error: error?.message ?? String(error) }
        writeJson(res, 200, payload)
      }
    },
  })

  // Live activity: keep the in-memory stats current between refreshes. Both
  // listeners are fully contained — a throw here must never propagate into
  // the session store's dispatch.
  const disposeEvent = ctx.on('session/event', (session, event) => {
    try {
      store.onLiveEvent(session, event)
    } catch (error) {
      // store.onLiveEvent already contains; this is a belt-and-suspenders.
      console.warn('[dsh-usage-analytics] live event handler failed:', error)
    }
  })

  // A flush means the log caught up with new events — fold them soon so the
  // dashboard stays fresh without waiting for the next manual refresh.
  const disposeFlush = ctx.on('session/flush', (session) => {
    try {
      store.onLiveEvent(session, undefined)
    } catch { /* contained */ }
  })

  // Periodic durability + catch-up: persist dirty state and fold sessions
  // that changed since the last pass, even when no request arrives.
  const disposeTimer = ctx.timer.interval(() => {
    if (store.dirty) store.persist().catch(() => {})
    store.refreshAsync()
  }, 60000)

  // Tear-down: persist final state, stop timers.
  ctx.effect(() => () => {
    disposeStats()
    disposeEvent()
    disposeFlush()
    disposeTimer()
    store.dispose()
    store.persist().catch(() => {})
  }, 'dsh-usage-analytics: lifecycle')
}
