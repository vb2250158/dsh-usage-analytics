/** Read-only skill invocation counts from persisted DSH sessions. */
import { AnalyticsStore } from './store.js'
import { Config, periodStart, resolveConfig } from './config.js'

export { Config }
/** Cordis plugin identity. */
export const name = 'usage-analytics'
/** The observer can run without a browser carrier. */
export const inject = ['sessionPersistence', 'timer']
/** Same-origin statistics route consumed by the browser face. */
export const API = { stats: '/api/dsh-usage-analytics/stats' }

/** Complete one JSON HTTP response. */
function writeJson(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
  })
  response.end(JSON.stringify(body))
}

/**
 * Register the observer and optional Web route as reversible effects.
 * @param ctx - Host plugin context.
 * @param input - Validated plugin configuration.
 */
export function apply(ctx, input) {
  const config = resolveConfig(input)
  const store = new AnalyticsStore({ persistence: ctx.sessionPersistence, ...config })
  const ready = store.load()
  ctx.on('session/event', () => store.scheduleRefreshSoon())
  ctx.timer.interval(() => { ready.then(() => store.refreshAsync()) }, config.backgroundRefreshMs)

  ctx.inject(['webServer', 'connection'], scope => scope.effect(() => scope.webServer.register({
    kind: 'exact', path: API.stats,
    handler: async (request, response) => {
      const rejection = scope.connection.requestRejection(request)
      if (rejection) return writeJson(response, rejection, { error: 'Authentication or origin rejected' })
      if (request.method !== 'GET') return writeJson(response, 405, { error: 'method not allowed' })
      const query = new URL(request.url, 'http://localhost').searchParams
      const period = query.get('period') || 'all'
      let from
      try { from = periodStart(period) }
      catch (error) { return writeJson(response, 400, { error: error.message }) }
      await ready
      const force = query.get('force') === '1'
      // Explicit refresh waits for its scan; periodic reads may use the
      // cached snapshot while changed session tails finish folding.
      if (force || !store.built) await store.refresh({ force })
      else store.refreshAsync()
      const snapshot = store.snapshot({ from })
      writeJson(response, 200, {
        generatedAt: snapshot.generatedAt,
        period,
        from: from ?? null,
        skillUsage: snapshot.skillUsage,
        refreshIntervalMs: config.autoRefreshMs,
        // Only an unfinished history build hides an otherwise valid cached zero.
        scan: { ...store.lastScan, pending: !store.built && store.refreshPromise !== undefined, pollAfterMs: config.scanPollMs },
      })
    },
  })))
  ctx.effect(() => async () => {
    store.dispose()
    if (store.refreshPromise) await store.refreshPromise
    await store.persist({ final: true })
  })
}
