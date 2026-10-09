/** Read-only skill invocation counts from persisted DSH sessions. */
import { AnalyticsStore } from './store.js'
import { Config, periodStart, resolveConfig } from './config.js'

export { Config }
/** Cordis plugin identity. */
export const name = 'usage-analytics'
/** The observer can run without a browser carrier. */
export const inject = ['sessionPersistence', 'timer']
/** Same-origin statistics route consumed by the browser face. */
export const API = { stats: '/api/dsh-usage-analytics/stats', skill: '/api/dsh-usage-analytics/skill' }

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
  let skills
  ctx.inject(['skills'], scope => scope.effect(() => {
    skills = scope.skills
    return () => { skills = undefined }
  }))
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
      let catalog = { available: false, entries: [] }
      if (skills) {
        try {
          catalog = { available: true, entries: (await skills.list()).map(({ name, description }) => ({ name, description })) }
        } catch (error) { /* Statistics remain readable when the current Skill provider fails. */ }
      }
      writeJson(response, 200, {
        generatedAt: snapshot.generatedAt,
        period,
        from: from ?? null,
        skillUsage: snapshot.skillUsage,
        catalog,
        refreshIntervalMs: config.autoRefreshMs,
        // Only an unfinished history build hides an otherwise valid cached zero.
        scan: { ...store.lastScan, pending: !store.built && store.refreshPromise !== undefined, pollAfterMs: config.scanPollMs },
      })
    },
  })))
  ctx.inject(['webServer', 'connection'], scope => scope.effect(() => scope.webServer.register({
    kind: 'exact', path: API.skill,
    handler: async (request, response) => {
      const rejection = scope.connection.requestRejection(request)
      if (rejection) return writeJson(response, rejection, { error: 'Authentication or origin rejected' })
      if (request.method !== 'GET') return writeJson(response, 405, { error: 'method not allowed' })
      const name = new URL(request.url, 'http://localhost').searchParams.get('name')
      if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) return writeJson(response, 400, { error: 'Invalid Skill name' })
      if (!skills) return writeJson(response, 503, { error: 'Skill catalog unavailable' })
      try {
        const skill = await skills.get(name)
        if (!skill) return writeJson(response, 404, { error: 'Skill no longer available' })
        const title = /^#\s+(.+)$/m.exec(skill.content)?.[1] || skill.name
        writeJson(response, 200, { name: skill.name, title, description: skill.description, content: skill.content })
      } catch (error) { writeJson(response, 503, { error: 'Could not read Skill' }) }
    },
  })))
  ctx.effect(() => async () => {
    store.dispose()
    if (store.refreshPromise) await store.refreshPromise
    await store.persist({ final: true })
  })
}
