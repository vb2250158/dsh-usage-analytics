import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, isAbsolute } from 'node:path'
import { API, apply } from '../lib/index.js'
import { createSessionStats, foldEvents } from '../lib/aggregate.js'

function invocation(seq, name, time = Date.now()) {
  return {
    seq, time, type: 'user/message',
    data: { role: 'user', id: 'message-' + seq, source: { kind: 'skill-invocation', name, form: 'instructions' }, content: [] },
  }
}

async function fixture(t, events = [invocation(0, 'review')], cached) {
  const tempBase = tmpdir()
  const tempRoot = await mkdtemp(join(tempBase, 'dsh-skill-host-test-'))
  const displacement = relative(tempBase, tempRoot)
  assert.ok(displacement && !displacement.startsWith('..') && !isAbsolute(displacement))
  const effects = []
  const routes = new Map()
  const observations = { lists: 0, opens: [], reads: [], closed: [], rejected: [], intervals: [] }
  const source = { header: { id: 's1', createdAt: Date.now(), isSeeded: false }, revision: 'revision-1', events }
  const listeners = new Map()
  const ctx = {
    effect(setup) {
      const disposer = setup()
      effects.push(disposer)
      return disposer
    },
    on(name, listener) {
      listeners.set(name, listener)
      return ctx.effect(() => () => listeners.delete(name))
    },
    inject(dependencies, mount) {
      assert.ok(JSON.stringify(dependencies) === JSON.stringify(['webServer', 'connection']) || JSON.stringify(dependencies) === JSON.stringify(['skills']))
      return mount(ctx)
    },
    skills: {
      async list() { return [{ name: 'review', description: 'Review changes' }] },
      async get(name) { return name === 'review' ? { name, description: 'Review changes', content: '# Code review\n\nInspect changes.\n' } : undefined },
    },
    timer: {
      interval(callback, delay) {
        observations.intervals.push({ callback, delay })
        return ctx.effect(() => () => { observations.intervals.length = 0 })
      },
    },
    sessionPersistence: {
      async list() {
        observations.lists += 1
        return [{ header: source.header, revision: source.revision }]
      },
      async open(id, access) {
        assert.equal(id, 's1')
        assert.equal(access, 'read')
        observations.opens.push(id)
        return {
          id, header: source.header, access, inheritedEventCount: 0,
          async read(offset = 0) {
            observations.reads.push(offset)
            if (source.beforeRead) await source.beforeRead()
            return { eventState: 'owned', events: source.events.filter(event => event.seq >= offset) }
          },
          async close() { observations.closed.push(id) },
        }
      },
    },
    webServer: {
      register(route) {
        assert.equal(route.kind, 'exact')
        assert.ok(Object.values(API).includes(route.path))
        assert.equal(routes.has(route.path), false)
        routes.set(route.path, route)
        return () => routes.delete(route.path)
      },
    },
    connection: {
      requestRejection(request) {
        observations.rejected.push(request.method)
        if (request.headers.origin && request.headers.origin !== 'http://' + request.headers.host) return 403
        if (request.headers.cookie !== 'test-auth=accepted') return 401
        return undefined
      },
    },
  }
  const server = createServer((request, response) => {
    const route = routes.get(new URL(request.url, 'http://localhost').pathname)
    if (!route) { response.writeHead(404); response.end(); return }
    Promise.resolve(route.handler(request, response)).catch(error => {
      response.writeHead(500)
      response.end(error.message)
    })
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const baseUrl = 'http://127.0.0.1:' + server.address().port
  let disposed = false
  const dispose = async () => {
    if (disposed) return
    disposed = true
    for (const effect of [...effects].reverse()) if (typeof effect === 'function') await effect()
  }
  t.after(async () => {
    await dispose()
    server.closeAllConnections()
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    await rm(tempRoot, { recursive: true, force: true })
  })
  if (cached) await writeFile(join(tempRoot, 'agg.json'), JSON.stringify({ version: 10, sessions: [cached] }))
  apply(ctx, { dataDir: tempRoot, autoRefreshMs: 30000, backgroundRefreshMs: 60000, flushRefreshMs: 15000, foldConcurrency: 2 })
  const request = async (query = '', options = {}) => {
    const { authenticated = true, headers, ...rest } = options
    const response = await fetch(baseUrl + API.stats + query, {
      ...rest,
      headers: { ...(authenticated ? { Cookie: 'test-auth=accepted' } : {}), ...headers },
    })
    return { response, body: await response.json() }
  }
  return { request, source, observations, tempRoot, dispose, routes, ctx, baseUrl }
}

test('first authorized HTTP read waits for the session scan and returns real skill counts', async t => {
  const f = await fixture(t)
  let entered
  const readEntered = new Promise(resolve => { entered = resolve })
  let release
  const readReleased = new Promise(resolve => { release = resolve })
  f.source.beforeRead = async () => { entered(); await readReleased }
  let answered = false
  const pending = f.request().then(result => { answered = true; return result })
  await readEntered
  assert.equal(answered, false)
  release()
  const { response, body } = await pending
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(body.skillUsage.totalCalls, 1)
  assert.equal(body.skillUsage.rows[0].name, 'review')
  assert.equal(body.period, 'all')
  assert.equal(body.from, null)
  assert.equal(body.refreshIntervalMs, 30000)
  assert.equal(body.scan.stale, false)
  assert.equal(body.scan.pending, false)
  assert.deepEqual(f.observations.reads, [0])
  assert.equal(f.observations.closed.length, 1)
  assert.equal(f.observations.intervals[0].delay, 60000)
})

test('a completed zero-count scan remains visible during an ordinary background tail refresh', async t => {
  const f = await fixture(t, [])
  const first = await f.request()
  assert.equal(first.body.skillUsage.totalCalls, 0)
  assert.equal(first.body.scan.pending, false)
  f.source.revision = 'revision-2'
  let entered
  const readEntered = new Promise(resolve => { entered = resolve })
  let release
  const readReleased = new Promise(resolve => { release = resolve })
  f.source.beforeRead = async () => { entered(); await readReleased }
  try {
    const { response, body } = await f.request()
    await readEntered
    assert.equal(response.status, 200)
    assert.equal(body.skillUsage.totalCalls, 0)
    assert.equal(body.scan.failed, 0)
    assert.equal(body.scan.stale, false)
    assert.equal(body.scan.pending, false)
    assert.equal(f.observations.reads.length, 2)
  } finally { release() }
})

test('HTTP authentication and origin rejections prevent any session scan, including unsupported methods', async t => {
  const f = await fixture(t)
  assert.equal((await f.request('', { authenticated: false })).response.status, 401)
  assert.equal((await f.request('', { headers: { Origin: 'https://untrusted.example' } })).response.status, 403)
  assert.equal((await f.request('', { authenticated: false, method: 'POST' })).response.status, 401)
  assert.equal(f.observations.lists, 0)
  assert.equal(f.observations.opens.length, 0)
})

test('authorized unsupported methods and invalid periods return errors without scanning', async t => {
  const f = await fixture(t)
  assert.equal((await f.request('', { method: 'POST' })).response.status, 405)
  assert.equal((await f.request('?period=invalid')).response.status, 400)
  assert.equal((await f.request('?period=-7')).response.status, 400)
  assert.equal(f.observations.lists, 0)
})

test('HTTP all-time and 7, 30, 90-day ranges filter invocation times with distinct counts', async t => {
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  const f = await fixture(t, [
    invocation(0, 'recent', now - day),
    invocation(1, 'recent', now - 6 * day),
    invocation(2, 'monthly', now - 20 * day),
    invocation(3, 'quarterly', now - 60 * day),
    invocation(4, 'old', now - 100 * day),
  ])
  for (const [period, count] of [['all', 5], ['7', 2], ['30', 3], ['90', 4]]) {
    const { response, body } = await f.request('?period=' + period + '&force=1')
    assert.equal(response.status, 200)
    assert.equal(body.period, period)
    assert.equal(body.skillUsage.totalCalls, count)
    if (period === 'all') assert.equal(body.from, null)
    else {
      assert.equal(typeof body.from, 'number')
      assert.ok(body.from >= now - Number(period) * day)
      assert.ok(body.from <= Date.now() - Number(period) * day)
    }
  }
  assert.deepEqual(f.observations.reads, [0, 0, 0, 0])
})

test('today and 24-hour HTTP periods return supported finite cutoffs', async t => {
  const f = await fixture(t, [invocation(0, 'review')])
  for (const period of ['today', '24h']) {
    const { response, body } = await f.request('?period=' + period)
    assert.equal(response.status, 200)
    assert.equal(body.period, period)
    assert.ok(Number.isFinite(body.from))
    assert.equal(body.skillUsage.totalCalls, 1)
  }
})

test('force refresh rereads unchanged-revision logs without doubling earlier skill counts', async t => {
  const f = await fixture(t)
  assert.equal((await f.request()).body.skillUsage.totalCalls, 1)
  f.source.events.push(invocation(1, 'design'))
  const { response, body } = await f.request('?force=1')
  assert.equal(response.status, 200)
  assert.equal(body.skillUsage.totalCalls, 2)
  assert.deepEqual(f.observations.reads, [0, 0])
  const repeated = await f.request('?force=1')
  assert.equal(repeated.body.skillUsage.totalCalls, 2)
})

test('Host disposal unregisters the route and awaits a final readable metadata cache', async t => {
  const f = await fixture(t)
  await f.request()
  await rm(join(f.tempRoot, 'agg.json'))
  await f.dispose()
  assert.equal(f.routes.size, 0)
  assert.equal(f.observations.intervals.length, 0)
  const cache = JSON.parse(await readFile(join(f.tempRoot, 'agg.json'), 'utf8'))
  assert.equal(cache.sessions[0].skillInvocations.length, 1)
  assert.equal((await fetch(f.baseUrl + API.stats)).status, 404)
})

test('current catalog descriptions and on-demand definitions share the authenticated read-only provider', async t => {
  const f = await fixture(t)
  assert.deepEqual((await f.request()).body.catalog, { available: true, pending: false, stale: false, entries: [{ name: 'review', description: 'Review changes', origin: 'current' }] })
  const read = async (query, options = {}) => fetch(f.baseUrl + API.skill + query, { ...options, headers: { Cookie: 'test-auth=accepted', ...options.headers } })
  const response = await read('?name=review')
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { name: 'review', title: 'Code review', description: 'Review changes', content: '# Code review\n\nInspect changes.\n' })
  assert.equal((await fetch(f.baseUrl + API.skill + '?name=review')).status, 401)
  assert.equal((await read('?name=review', { headers: { Origin: 'https://untrusted.example' } })).status, 403)
  assert.equal((await read('?name=../secrets')).status, 400)
  assert.equal((await read('?name=review', { method: 'POST' })).status, 405)
  assert.equal((await read('?name=removed')).status, 404)
  f.ctx.skills.get = async () => { throw new Error('Provider offline') }
  assert.equal((await read('?name=review')).status, 503)
  f.ctx.skills.list = async () => { throw new Error('Provider offline') }
  const fallback = await f.request('?force=1')
  assert.equal(fallback.body.skillUsage.totalCalls, 1)
  assert.deepEqual(fallback.body.catalog, { available: false, pending: false, stale: true, entries: [{ name: 'review', description: 'Review changes', origin: 'current' }] })
})

test('cached counts remain readable during a slow initial scan and Skill lookup uses the observed workspace', { timeout: 3000 }, async t => {
  const cached = createSessionStats({ id: 's1', createdAt: Date.now(), cwd: 'C:/example/project' })
  foldEvents(cached, [invocation(0, 'review')])
  const f = await fixture(t, [invocation(0, 'review')], cached)
  let release
  const pendingRead = new Promise(resolve => { release = resolve })
  f.source.beforeRead = async () => pendingRead
  const observed = []
  f.ctx.skills.list = async options => { observed.push(options.cwd); return options.cwd === cached.cwd ? [{ name: 'review', description: 'Project review' }] : [] }
  f.ctx.skills.get = async (name, options) => options.cwd === cached.cwd ? { name, description: 'Project review', content: '# Project review' } : undefined
  try {
    const { body } = await f.request()
    assert.equal(body.skillUsage.totalCalls, 1)
    assert.equal(body.scan.pending, true)
    assert.deepEqual(body.catalog.entries, [{ name: 'review', description: 'Project review', origin: 'current' }])
    assert.ok(observed.includes(cached.cwd))
    const response = await fetch(f.baseUrl + API.skill + '?name=review', { headers: { Cookie: 'test-auth=accepted' } })
    assert.equal(response.status, 200)
    assert.equal((await response.json()).title, 'Project review')
  } finally { release() }
})

test('counts paint independently of slow Skill discovery and subsequent catalogs reuse service results', { timeout: 3000 }, async t => {
  const f = await fixture(t)
  await f.request()
  let release, lists = 0
  f.ctx.skills.list = async () => { lists++; await new Promise(resolve => { release = resolve }); return [] }
  const waiting = f.request('?force=1')
  while (!release) await new Promise(resolve => setTimeout(resolve, 1))
  try {
    const counts = await f.request('?catalog=0')
    assert.equal(counts.response.status, 200)
    assert.equal(counts.body.skillUsage.totalCalls, 1)
    assert.equal(counts.body.catalog.pending, true)
  } finally { release() }
  await waiting
  await f.request()
  assert.equal(lists, 1)
  const response = await fetch(f.baseUrl + API.catalog, { headers: { Cookie: 'test-auth=accepted' } })
  assert.equal(response.status, 200)
  assert.equal(lists, 1)
  assert.equal((await fetch(f.baseUrl + API.catalog)).status, 401)
  assert.equal((await fetch(f.baseUrl + API.catalog, { method: 'POST', headers: { Cookie: 'test-auth=accepted' } })).status, 405)
})

test('retired exact names show structured historical descriptions and a historical detail instead of a guessed current Skill', async t => {
  const catalog = { seq: 0, time: Date.now(), type: 'user/message', data: { source: { kind: 'skill-catalog', form: 'catalog', entries: [{ name: 'retired', description: 'Historical instructions summary' }] }, content: [{ type: 'text', text: 'PRIVATE_BODY' }] } }
  const f = await fixture(t, [catalog, invocation(1, 'retired')])
  const { body } = await f.request()
  assert.equal(body.skillUsage.totalCalls, 1)
  assert.deepEqual(body.catalog.entries.find(entry => entry.name === 'retired'), { name: 'retired', description: 'Historical instructions summary', origin: 'history', observedAt: catalog.time })
  const response = await fetch(f.baseUrl + API.skill + '?name=retired', { headers: { Cookie: 'test-auth=accepted' } })
  const detail = await response.json()
  assert.equal(detail.origin, 'history')
  assert.equal(detail.content, '')
  assert.equal(detail.description, 'Historical instructions summary')
  assert.doesNotMatch(JSON.stringify(detail), /PRIVATE_BODY/)
})

test('longest-unused ranking uses all history while period counts retain exact cutoffs', async t => {
  const now = Date.now()
  const f = await fixture(t, [invocation(0, 'oldest', now - 40 * 86400000), invocation(1, 'recent', now - 3600000), invocation(2, 'oldest', now - 20 * 86400000)])
  const { body } = await f.request('?period=7')
  assert.equal(body.skillUsage.totalCalls, 1)
  assert.deepEqual(body.inactiveSkills.map(row => row.name), ['oldest', 'recent'])
  assert.equal(body.inactiveSkills[0].lastUsedAt, now - 20 * 86400000)
  assert.ok(body.inactiveSkills[0].inactiveMs >= 20 * 86400000)
})
