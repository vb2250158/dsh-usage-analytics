/** Read-only skill invocation counts from persisted DSH sessions. */
import { AnalyticsStore } from './store.js'
import { Config, periodStart, resolveConfig } from './config.js'
import { SkillCatalogReader, historicalCatalog } from './catalog.js'

export { Config }
/** Cordis plugin identity. */
export const name = 'usage-analytics'
/** The observer can run without a browser carrier. */
export const inject = ['sessionPersistence', 'timer']
/** Same-origin statistics route consumed by the browser face. */
export const API = { stats: '/api/dsh-usage-analytics/stats', skill: '/api/dsh-usage-analytics/skill', catalog: '/api/dsh-usage-analytics/catalog' }

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
  const catalogReader = new SkillCatalogReader(store, config)
  let skills
  ctx.inject(['skills'], scope => scope.effect(() => {
    skills = scope.skills
    catalogReader.setProvider(skills)
    return () => { skills = undefined; catalogReader.setProvider(undefined) }
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
      if (force || (query.get('catalog') !== '0' && !store.built && store.sessions.size === 0)) await store.refresh({ force })
      else store.refreshAsync()
      const snapshot = store.snapshot({ from })
      const allUsage = from === undefined ? snapshot.skillUsage : store.snapshot().skillUsage
      const inactiveSkills = allUsage.rows.filter(row => row.name !== '(unknown skill)' && row.lastUsedAt !== null)
        .sort((a, b) => a.lastUsedAt - b.lastUsedAt || a.name.localeCompare(b.name)).slice(0, 10)
        .map(({ name, lastUsedAt }) => ({ name, lastUsedAt, inactiveMs: Math.max(0, snapshot.generatedAt - lastUsedAt) }))
      // The browser requests counts first; old clients may still await the current catalog.
      if (force) catalogReader.expires = 0
      const catalog = query.get('catalog') === '0' ? catalogReader.snapshot() : await catalogReader.refresh({ force })
      writeJson(response, 200, {
        generatedAt: snapshot.generatedAt,
        period,
        from: from ?? null,
        skillUsage: snapshot.skillUsage,
        inactiveSkills,
        catalog,
        refreshIntervalMs: config.autoRefreshMs,
        pageSize: config.pageSize,
        // Only an unfinished history build hides an otherwise valid cached zero.
        scan: { ...store.lastScan, pending: !store.built && store.refreshPromise !== undefined, pollAfterMs: config.scanPollMs },
      })
    },
  })))
  ctx.inject(['webServer', 'connection'], scope => scope.effect(() => scope.webServer.register({
    kind: 'exact', path: API.catalog,
    handler: async (request, response) => {
      const rejection = scope.connection.requestRejection(request)
      if (rejection) return writeJson(response, rejection, { error: 'Authentication or origin rejected' })
      if (request.method !== 'GET') return writeJson(response, 405, { error: 'method not allowed' })
      await ready
      writeJson(response, 200, await catalogReader.refresh())
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
      try {
        await ready
        const skill = await catalogReader.get(name)
        if (!skill) {
          const historical = historicalCatalog(store).get(name)
          if (historical) return writeJson(response, 200, { name, title: name, description: historical.description, content: '', origin: 'history', observedAt: historical.observedAt })
          return writeJson(response, skills ? 404 : 503, { error: skills ? 'Skill no longer available' : 'Skill catalog unavailable' })
        }
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
