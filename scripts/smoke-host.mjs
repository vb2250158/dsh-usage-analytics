/**
 * Host wiring smoke test: boots the real JSONL persistence backend, mounts the
 * plugin's apply() with stubbed webServer/timer services, exercises the stats
 * route handler end-to-end, and prints the payload the dashboard receives.
 * Dev tool — not shipped in the bundle.
 *
 * Run: node scripts/smoke-host.mjs
 */
import { Context } from '@deepseek-ai/cordis'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { SessionStore } from '@deepseek-ai/dsh-session'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { apply } from '../lib/index.js'

const here = dirname(fileURLToPath(import.meta.url))
// scripts → dsh-usage-analytics → plugins → web → profiles → data → deepseek-harness
const root = join(here, '..', '..', '..', '..', '..', '..', 'data', 'sessions')

const ctx = new Context()
new SessionStore(ctx)
new JsonlSessionPersistence(ctx, { root })

// --- stub the services apply() injects ---
const routes = []
ctx.provide('webServer', {
  register(route) {
    routes.push(route)
    return () => { routes.splice(routes.indexOf(route), 1) }
  },
})
ctx.provide('timer', {
  interval() { return () => {} },
})

// --- mount the plugin ---
apply(ctx)
console.log('routes registered:', routes.map((r) => `${r.kind} ${r.path}`).join(', '))
if (routes.length === 0) throw new Error('no route registered')

// --- invoke the stats route handler with a fake request/response ---
const route = routes[0]
function fakeReq(overrides = {}) {
  return {
    method: 'GET',
    url: '/api/dsh-usage-analytics/stats',
    socket: { remoteAddress: '127.0.0.1' },
    headers: { host: '127.0.0.1:3080' },
    ...overrides,
  }
}
function fakeRes() {
  const chunks = []
  return {
    writeHead(status, headers) { this.status = status; this.headers = headers },
    end(payload) { chunks.push(payload) },
    get body() { return chunks.join('') },
  }
}

const res = fakeRes()
await route.handler(fakeReq(), res)
const payload = JSON.parse(res.body)
console.log('HTTP status:', res.status)

console.log('--- payload summary ---')
console.log('scan:', JSON.stringify(payload.scan))
console.log('sessions:', payload.sessions, '| subagent:', payload.subagentSessions)
console.log('tokens total:', payload.tokens.total)
console.log('turns:', payload.turns, '| steps:', payload.steps, '| toolCalls:', payload.toolCalls)
console.log('activeDays:', payload.insights.activeDays, '| currentStreak:', payload.insights.currentStreakDays)
console.log('topModel:', payload.insights.topModel?.name)
console.log('days buckets:', Object.keys(payload.days).length)
console.log('models:', Object.keys(payload.models).length)
console.log('tools:', Object.keys(payload.tools).length)
console.log('skills:', Object.keys(payload.skills).length)
console.log('plugins:', Object.keys(payload.plugins).length)

// --- also check the non-loopback fence returns 403 ---
const resForbidden = fakeRes()
await route.handler(fakeReq({ socket: { remoteAddress: '10.0.0.1' } }), resForbidden)
console.log('non-loopback status (expect 403):', resForbidden.status)

// --- re-run: second call should use the cached/incremental path ---
const res2 = fakeRes()
await route.handler(fakeReq(), res2)
const payload2 = JSON.parse(res2.body)
console.log('second call scan:', JSON.stringify(payload2.scan))
console.log('second call tokens total:', payload2.tokens.total)

process.exit(0)
