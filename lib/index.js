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

/** Query only workspaces observed in retained sessions, newest use first. */
function skillContexts(store, name) {
  const sessions = [...store.sessions.values()].filter(session => !name || session.skillInvocations.some(item => item.name === name))
  sessions.sort((a, b) => (b.lastAt || b.createdAt) - (a.lastAt || a.createdAt))
  return [...new Set(sessions.map(session => session.cwd).filter(Boolean)), undefined]
}

/** Merge current descriptions from the historical workspaces without reading bodies. */
async function skillCatalog(skills, store) {
  const catalogs = await Promise.all(skillContexts(store).map(async cwd => {
    try { return await skills.list({ cwd }) }
    catch (error) { return undefined }
  }))
  const entries = new Map()
  for (const catalog of catalogs) {
    if (!catalog) continue
    for (const { name, description } of catalog) if (!entries.has(name)) entries.set(name, { name, description })
  }
  return { available: catalogs.some(catalog => catalog !== undefined), entries: [...entries.values()] }
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
      if (force || (!store.built && store.sessions.size === 0)) await store.refresh({ force })
      else store.refreshAsync()
      const snapshot = store.snapshot({ from })
      let catalog = { available: false, entries: [] }
      if (skills) {
        try {
          catalog = await skillCatalog(skills, store)
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
        await ready
        let skill
        for (const cwd of skillContexts(store, name)) {
          skill = await skills.get(name, { cwd })
          if (skill) break
        }
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
