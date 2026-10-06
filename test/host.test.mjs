import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, isAbsolute } from 'node:path'
import { API, apply } from '../lib/index.js'

function invocation(seq, name, time = Date.now()) {
  return {
    seq, time, type: 'user/message',
    data: { role: 'user', id: 'message-' + seq, source: { kind: 'skill-invocation', name, form: 'instructions' }, content: [] },
  }
}

async function fixture(t, events = [invocation(0, 'review')]) {
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
      assert.deepEqual(dependencies, ['webServer', 'connection'])
      return mount(ctx)
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
        assert.equal(route.path, API.stats)
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
