import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, isAbsolute } from 'node:path'
import { AnalyticsStore } from '../lib/store.js'

const at = Date.parse('2026-10-06T12:00:00+08:00')

function invocation(seq, name, time = at) {
  return {
    seq, time, type: 'user/message',
    data: {
      role: 'user', id: 'message-' + seq,
      source: { kind: 'skill-invocation', name, form: 'instructions' },
      content: [{ type: 'text', text: 'PRIVATE_SKILL_BODY' }],
    },
  }
}

function session(id, events, inheritedEventCount = 0) {
  return {
    header: { id, createdAt: at, isSeeded: inheritedEventCount > 0 },
    revision: 'revision-1', inheritedEventCount, events,
  }
}

function persistenceFor(initial = []) {
  const entries = new Map(initial.map(item => [item.header.id, item]))
  const observations = { lists: 0, opens: [], reads: [], closed: [] }
  const persistence = {
    async list() {
      observations.lists += 1
      if (persistence.listError) throw persistence.listError
      return [...entries.values()].map(({ header, revision }) => ({ header, revision }))
    },
    async open(id, access) {
      assert.equal(access, 'read')
      const item = entries.get(id)
      assert.ok(item, 'the read handle addresses a listed session')
      observations.opens.push(id)
      let closed = false
      return {
        id, header: item.header, access,
        inheritedEventCount: item.inheritedEventCount,
        async read(offset = 0) {
          assert.equal(closed, false)
          observations.reads.push({ id, offset })
          if (item.readError) throw item.readError
          return { eventState: 'owned', events: item.events.filter(event => event.seq >= offset) }
        },
        async close() {
          if (!closed) observations.closed.push(id)
          closed = true
        },
      }
    },
  }
  return { persistence, entries, observations }
}

async function fixture(t, initial = []) {
  const tempBase = tmpdir()
  const tempRoot = await mkdtemp(join(tempBase, 'dsh-skill-store-test-'))
  const displacement = relative(tempBase, tempRoot)
  assert.ok(displacement && !displacement.startsWith('..') && !isAbsolute(displacement))
  const source = persistenceFor(initial)
  const messages = []
  const options = {
    persistence: source.persistence, dataDir: tempRoot, flushRefreshMs: 1000,
    foldConcurrency: 2, logger: { warn: (...args) => messages.push(args) },
  }
  const store = new AnalyticsStore(options)
  t.after(async () => {
    store.dispose()
    if (store.refreshPromise) await store.refreshPromise
    await store.persistPromise
    await rm(tempRoot, { recursive: true, force: true })
  })
  return { ...source, store, options, tempRoot, messages }
}

test('first scan counts only each fork own tail and unchanged refreshes do not repeat invocations', async t => {
  const parentEvents = [invocation(0, 'review'), invocation(1, 'design')]
  const parent = session('parent', parentEvents)
  const fork = session('fork', [...parentEvents, invocation(2, 'review')], parentEvents.length)
  const f = await fixture(t, [parent, fork])
  await f.store.load()
  assert.equal(f.store.built, false)
  assert.deepEqual(await f.store.refresh(), { folded: 2, skipped: 0, failed: 0, stale: false })
  assert.deepEqual(f.observations.reads, [{ id: 'parent', offset: 0 }, { id: 'fork', offset: 2 }])
  assert.equal(f.store.snapshot().skillUsage.totalCalls, 3)
  assert.equal(f.store.snapshot().skillUsage.rows.find(row => row.name === 'review').sessionCount, 2)

  assert.deepEqual(await f.store.refresh(), { folded: 0, skipped: 2, failed: 0, stale: false })
  assert.equal(f.observations.reads.length, 2)
  assert.equal(f.store.snapshot().skillUsage.totalCalls, 3)

  fork.events.push(invocation(3, 'review', at + 1))
  fork.revision = 'revision-2'
  await f.store.refresh()
  assert.deepEqual(f.observations.reads.at(-1), { id: 'fork', offset: 3 })
  assert.equal(f.store.snapshot().skillUsage.totalCalls, 4)
  await f.store.refresh({ force: true })
  assert.equal(f.store.snapshot().skillUsage.totalCalls, 4)
  assert.deepEqual(f.observations.reads.slice(-2), [{ id: 'parent', offset: 0 }, { id: 'fork', offset: 2 }])
  assert.equal(f.observations.closed.length, f.observations.opens.length)
})

test('a failed read closes its handle and marks counts stale until that tail is retried', async t => {
  const item = session('s1', [invocation(0, 'review')])
  const f = await fixture(t, [item])
  await f.store.refresh()
  item.events.push(invocation(1, 'design'))
  item.revision = 'revision-2'
  item.readError = new Error('session read failed')

  assert.deepEqual(await f.store.refresh(), { folded: 0, skipped: 0, failed: 1, stale: true })
  assert.equal(f.store.snapshot().skillUsage.totalCalls, 1)
  assert.equal(f.observations.closed.length, 2)
  assert.equal(f.store.folds.get('s1').revision, 'revision-1')
  assert.equal(f.store.built, false)
  delete item.readError
  assert.deepEqual(await f.store.refresh(), { folded: 1, skipped: 0, failed: 0, stale: false })
  assert.equal(f.store.snapshot().skillUsage.totalCalls, 2)
  assert.deepEqual(f.observations.reads.slice(-2), [{ id: 's1', offset: 1 }, { id: 's1', offset: 1 }])
})

test('a failed session listing preserves known counts and reports a stale scan', async t => {
  const f = await fixture(t, [session('s1', [invocation(0, 'review')])])
  await f.store.refresh()
  f.persistence.listError = new Error('catalog unavailable')
  assert.deepEqual(await f.store.refresh(), { stale: true, failed: 1, error: 'Session listing failed' })
  assert.equal(f.store.snapshot().skillUsage.totalCalls, 1)
  assert.equal(f.observations.opens.length, 1)
  assert.ok(f.messages.some(args => args.join(' ').includes('catalog unavailable')))
})

test('deleting a session removes its counts and watermark from subsequent snapshots and cache', async t => {
  const f = await fixture(t, [session('s1', [invocation(0, 'review')]), session('s2', [invocation(0, 'design')])])
  await f.store.refresh()
  f.entries.delete('s2')
  assert.deepEqual(await f.store.refresh(), { folded: 0, skipped: 1, failed: 0, stale: false })
  assert.equal(f.store.snapshot().skillUsage.totalCalls, 1)
  assert.equal(f.store.snapshot().skillUsage.sessionCount, 1)
  assert.equal(f.store.folds.has('s2'), false)
  assert.deepEqual(JSON.parse(await readFile(join(f.tempRoot, 'agg.json'), 'utf8')).sessions.map(item => item.id), ['s1'])
})

test('reload reads logs again even if a different persistence instance repeats a revision token', async t => {
  const f = await fixture(t, [session('s1', [invocation(0, 'review')])])
  await f.store.refresh()
  const replacement = persistenceFor([session('s1', [invocation(0, 'review'), invocation(1, 'design')])])
  const reopened = new AnalyticsStore({ ...f.options, persistence: replacement.persistence })
  t.after(async () => {
    reopened.dispose()
    if (reopened.refreshPromise) await reopened.refreshPromise
    await reopened.persistPromise
  })
  await reopened.load()
  assert.equal(reopened.snapshot().skillUsage.totalCalls, 1)
  assert.equal(reopened.built, false)
  assert.equal(reopened.folds.size, 0)
  await reopened.refresh()
  assert.deepEqual(replacement.observations.reads, [{ id: 's1', offset: 0 }])
  assert.equal(reopened.snapshot().skillUsage.totalCalls, 2)
})

test('the lifecycle final write works after disposal and persists metadata without skill bodies', async t => {
  const f = await fixture(t, [session('s1', [invocation(0, 'review')])])
  await f.store.refresh()
  await rm(join(f.tempRoot, 'agg.json'))
  const callsBeforeDisposal = f.observations.lists
  f.store.dispose()
  await f.store.refresh({ force: true })
  assert.equal(f.observations.lists, callsBeforeDisposal)
  await f.store.persist({ final: true })
  const serialized = await readFile(join(f.tempRoot, 'agg.json'), 'utf8')
  assert.equal(JSON.parse(serialized).sessions[0].skillInvocations.length, 1)
  assert.equal(serialized.includes('PRIVATE_SKILL_BODY'), false)
})
