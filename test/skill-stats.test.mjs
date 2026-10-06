import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aggregateSession, buildSkillUsage, createSessionStats, dayKey, foldEvents } from '../lib/aggregate.js'

const at = Date.parse('2026-10-06T12:00:00+08:00')

function header(id = 's1') {
  return { id, createdAt: at, isSeeded: false }
}

function call(seq, name, time = at, callId = `call-${seq}`) {
  return { seq, time, type: 'tool/call', data: { name: 'skill', callId, arguments: JSON.stringify({ name }) } }
}

function loaded(seq, name, time = at) {
  return {
    seq, time, type: 'user/message',
    data: { role: 'user', id: `message-${seq}`, source: { kind: 'skill-invocation', name, form: 'instructions' }, content: [{ type: 'text', text: 'PRIVATE_SKILL_BODY' }] },
  }
}

function result(seq, callId, isError = false, time = at) {
  return {
    seq, time, type: 'tool/result',
    data: { message: { role: 'tool', toolCallId: callId, isError, content: [{ type: 'text', text: 'PRIVATE_RESULT' }] } },
  }
}

test('skill usage ranks model attempts and confirmed user loads across distinct sessions', () => {
  const sessions = new Map([
    ['s1', aggregateSession(header('s1'), [call(0, 'review'), result(1, 'call-0'), loaded(2, 'review', at + 1), call(3, 'design', at + 2)])],
    ['s2', aggregateSession(header('s2'), [loaded(0, 'review', at + 3)])],
  ])
  const usage = buildSkillUsage(sessions)
  assert.equal(usage.totalCalls, 4)
  assert.equal(usage.uniqueSkills, 2)
  assert.equal(usage.sessionCount, 2)
  assert.equal(usage.modelCalls, 2)
  assert.equal(usage.userCalls, 2)
  assert.deepEqual(usage.rows[0], {
    name: 'review', calls: 3, sessionCount: 2, lastUsedAt: at + 3,
    modelCalls: 1, userCalls: 2, failedCalls: 0, pendingCalls: 0,
  })
  assert.equal(usage.rows[1].name, 'design')
  assert.equal(usage.rows[1].pendingCalls, 1)
  assert.equal(usage.days[dayKey(at)].sessionCount, 2)
  assert.equal(usage.days[dayKey(at)].calls, 4)
})

test('skill usage filters exact timestamps with an inclusive start and exclusive end', () => {
  const stats = aggregateSession(header(), [
    call(0, 'old', at - 24 * 3600000 - 1),
    call(1, 'review', at - 24 * 3600000),
    loaded(2, 'design', at - 1),
    call(3, 'next', at),
  ])
  const usage = buildSkillUsage({ s1: stats }, { from: at - 24 * 3600000, to: at })
  assert.equal(usage.totalCalls, 2)
  assert.deepEqual(usage.rows.map(row => row.name), ['design', 'review'])
  assert.equal(usage.modelCalls, 1)
  assert.equal(usage.userCalls, 1)
  assert.equal(Object.values(usage.days).reduce((sum, day) => sum + day.calls, 0), 2)
  assert.equal(buildSkillUsage({ s1: stats }, { from: at, to: at }).totalCalls, 0)
})

test('plain slash text, skill catalogs, unknown sources and non-instruction forms are not confirmed loads', () => {
  const stats = aggregateSession(header(), [
    { seq: 0, time: at, type: 'user/message', data: { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '/review do this' }] } },
    { seq: 1, time: at, type: 'user/message', data: { source: { kind: 'skill-catalog', name: 'review', form: 'instructions' } } },
    { seq: 2, time: at, type: 'user/message', data: { source: { kind: 'skill-invocation', name: 'review', form: 'notice' } } },
    { seq: 3, time: at, type: 'user/message', data: { source: { kind: 'external', name: 'review', form: 'instructions' } } },
    { seq: 4, time: at, type: 'user/message', data: { source: { kind: 'skill-invocation', name: 'Invalid Name', form: 'instructions' } } },
    loaded(5, 'review'),
  ])
  assert.equal(buildSkillUsage({ s1: stats }).totalCalls, 1)
  assert.equal(buildSkillUsage({ s1: stats }).userCalls, 1)
})

test('failed model calls count as attempts and change status when their durable result arrives', () => {
  const stats = createSessionStats(header())
  foldEvents(stats, [call(0, 'review', at, 'failed'), call(1, 'review', at + 1, 'ok'), call(2, 'review', at + 2, 'pending')])
  assert.equal(buildSkillUsage({ s1: stats }).pendingCalls, 3)
  foldEvents(stats, [result(3, 'failed', true), result(4, 'ok'), result(5, 'other', true)])
  const usage = buildSkillUsage({ s1: stats })
  assert.equal(usage.totalCalls, 3)
  assert.equal(usage.failedCalls, 1)
  assert.equal(usage.pendingCalls, 1)
  assert.equal(usage.rows[0].failedCalls, 1)
  assert.equal(usage.days[dayKey(at)].failedCalls, 1)
  assert.equal(stats.skillInvocations[1].status, 'succeeded')
})

test('skill fold retains metadata only and leaves durable inputs unchanged', () => {
  const events = [loaded(0, 'review'), call(1, 'review'), result(2, 'call-1')]
  events[1].data.arguments = JSON.stringify({ name: 'review', extra: 'PRIVATE_ARGS' })
  const before = JSON.stringify(events)
  const stats = aggregateSession(header(), events)
  const serialized = JSON.stringify(stats)
  assert.equal(serialized.includes('PRIVATE_SKILL_BODY'), false)
  assert.equal(serialized.includes('PRIVATE_RESULT'), false)
  assert.equal(serialized.includes('PRIVATE_ARGS'), false)
  assert.equal(serialized.includes('content'), false)
  assert.equal(JSON.stringify(events), before)
  assert.equal(JSON.stringify(buildSkillUsage({ s1: stats })).includes('call-1'), false)
})

test('unparseable or invalid names remain unattributed model attempts without becoming named skills', () => {
  const stats = aggregateSession(header(), [
    { seq: 0, time: at, type: 'tool/call', data: { name: 'skill', callId: 'c1', arguments: '{broken' } },
    call(1, ''),
    call(2, 'PRIVATE_ARBITRARY_TEXT'),
    { seq: 3, time: at, type: 'tool/call', data: { name: 'read', callId: 'c4', arguments: JSON.stringify({ name: 'review' }) } },
  ])
  const usage = buildSkillUsage({ s1: stats })
  assert.equal(usage.totalCalls, 3)
  assert.equal(usage.uniqueSkills, 0)
  assert.equal(usage.unattributedCalls, 3)
  assert.equal(usage.rows[0].name, '(unknown skill)')
  assert.equal(JSON.stringify(stats).includes('PRIVATE_ARBITRARY_TEXT'), false)
})

test('folding an overlapping tail and repeating the same session cannot duplicate skill calls', () => {
  const stats = createSessionStats(header())
  foldEvents(stats, [call(0, 'review'), loaded(1, 'review')])
  foldEvents(stats, [call(0, 'review'), loaded(1, 'review'), call(2, 'design')])
  assert.equal(stats.skillInvocations.length, 3)
  assert.equal(stats.tools.skill, 2)
  assert.equal(buildSkillUsage({ original: stats, repeated: stats }).totalCalls, 3)
})

test('own fork-tail events contribute once even when the parent has the same skill', () => {
  const parentEvents = [call(0, 'review', at - 100), loaded(1, 'review', at - 50)]
  const forkEvents = [...parentEvents, call(2, 'review', at + 100)]
  const inheritedEventCount = parentEvents.length
  const parent = aggregateSession(header('parent'), parentEvents)
  const fork = aggregateSession({ ...header('fork'), parentSession: 'parent', isSeeded: true }, forkEvents.filter(event => event.seq >= inheritedEventCount))
  const usage = buildSkillUsage({ parent, fork })
  assert.equal(usage.totalCalls, 3)
  assert.equal(usage.rows[0].sessionCount, 2)
  assert.equal(usage.rows[0].lastUsedAt, at + 100)
})

test('a successful model attempt without a timestamp is all-time-only with no invented last-use date', () => {
  const invocation = call(0, 'review')
  delete invocation.time
  const stats = aggregateSession(header(), [invocation, result(1, 'call-0')])
  const usage = buildSkillUsage({ s1: stats })
  assert.equal(usage.totalCalls, 1)
  assert.equal(usage.rows[0].lastUsedAt, null)
  assert.deepEqual(usage.days, {})
  assert.equal(buildSkillUsage({ s1: stats }, { from: 0 }).totalCalls, 0)
})

test('a skill named constructor stays a numeric counter through aggregation and cache serialization', () => {
  const stats = aggregateSession(header(), [call(0, 'constructor'), loaded(1, 'constructor')])
  assert.equal(stats.skills.constructor, 2)
  const cached = JSON.parse(JSON.stringify(stats))
  assert.equal(buildSkillUsage({ s1: cached }).rows[0].calls, 2)
})

test('skill period options reject invalid cutoffs and do not mutate cached metadata', () => {
  const stats = aggregateSession(header(), [call(0, 'review')])
  const before = JSON.stringify(stats)
  assert.throws(() => buildSkillUsage({ s1: stats }, { from: NaN }), TypeError)
  assert.throws(() => buildSkillUsage({ s1: stats }, { to: Infinity }), TypeError)
  assert.throws(() => buildSkillUsage({ s1: stats }, { from: at + 1, to: at }), RangeError)
  buildSkillUsage({ s1: stats }, { from: at - 1, to: at + 1 })
  assert.equal(JSON.stringify(stats), before)
})
