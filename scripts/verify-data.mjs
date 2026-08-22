/**
 * Data verification / preview script: boots the real JSONL persistence
 * backend against the live DSH session store, folds every stored session
 * through the analytics aggregation core, and prints what the dashboard would
 * show. Dev tool — not shipped in the bundle.
 *
 * Run: node scripts/verify-data.mjs
 */
import { Context } from '@deepseek-ai/cordis'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { SessionStore } from '@deepseek-ai/dsh-session'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  aggregateSession,
  aggregateFromSessions,
  computeInsights,
  topN,
} from '../lib/aggregate.js'

const here = dirname(fileURLToPath(import.meta.url))
// scripts → dsh-usage-analytics → plugins → web → profiles → data → deepseek-harness
const root = join(here, '..', '..', '..', '..', '..', '..', 'data', 'sessions')

const ctx = new Context()
new SessionStore(ctx)
const sp = new JsonlSessionPersistence(ctx, { root })

const headers = await sp.list()
const sessionMap = new Map()
let foldedEvents = 0
let foldedSessions = 0
for (const h of headers) {
  const { events } = await sp.readFrom(h.id, 0)
  foldedEvents += events.length
  sessionMap.set(h.id, aggregateSession(h, events))
  foldedSessions += 1
}

const agg = aggregateFromSessions(sessionMap)
const insights = computeInsights(agg, sessionMap)

const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n))

console.log('=== dsh-usage-analytics data preview ===')
console.log(`persistence root : ${root}`)
console.log(`sessions folded  : ${foldedSessions} (${fmt(foldedEvents)} events)`)
console.log('')
console.log(`sessions         : ${agg.sessions}   (subagent ${agg.subagentSessions})`)
console.log(`turns            : ${agg.turns}`)
console.log(`steps            : ${agg.steps}`)
console.log(`user messages    : ${agg.userMessages}`)
console.log(`tool calls       : ${agg.toolCalls}  (skills ${agg.skillCalls}, plugins ${agg.pluginCalls})`)
console.log(`tokens           : input ${fmt(agg.tokens.input)} | output ${fmt(agg.tokens.output)} | cacheRead ${fmt(agg.tokens.cacheRead)} | cacheWrite ${fmt(agg.tokens.cacheWrite)} | reasoning ${fmt(agg.tokens.reasoning)}`)
console.log(`tokens total     : ${fmt(agg.tokens.total)}`)
console.log(`active days      : ${insights.activeDays}   span ${insights.firstDay} → ${insights.lastDay}`)
console.log(`streaks          : current ${insights.currentStreakDays}d, longest ${insights.longestStreakDays}d (${insights.longestStreakStart ?? '-'} → ${insights.longestStreakEnd ?? '-'})`)
console.log(`avg/session      : ${fmt(insights.avgTokensPerSession)} tokens, ${insights.avgStepsPerTurn.toFixed(2)} steps/turn`)
console.log(`peak day         : ${insights.peakDay?.day} (${fmt(insights.peakDay?.tokens ?? 0)} tokens)`)
console.log(`busiest hour     : ${insights.busyHour?.name}:00`)
console.log(`token mix        : in ${insights.inputPct}% / out ${insights.outputPct}% / cache ${insights.cachePct}% (cache ${insights.cacheShareOfInput}% of input)`)
console.log(`longest session  : ${insights.longestSession?.id} (${Math.round((insights.longestSession?.ms ?? 0) / 60000)} min, ${fmt(insights.longestSession?.tokens ?? 0)} tok)`)
console.log('')
console.log('models (by tokens):')
for (const m of topN(Object.fromEntries(Object.entries(agg.models).map(([k, v]) => [k, v.tokens.total])), 5)) {
  const detail = agg.models[m.name]
  console.log(`  ${m.name.padEnd(40)} ${fmt(m.count).padStart(7)} tok  (${detail.calls} calls, ${detail.sessions} sessions)`)
}
console.log('reasoning efforts:')
for (const e of topN(agg.reasoningEfforts, 5)) console.log(`  ${String(e.name).padEnd(12)} ${e.count}`)
console.log('top tools:')
for (const t of topN(agg.tools, 8)) console.log(`  ${t.name.padEnd(30)} ${t.count}`)
console.log('skills used:')
for (const s of topN(agg.skills, 8)) console.log(`  ${s.name.padEnd(30)} ${s.count}`)
console.log('dynamic plugin tools:')
for (const p of topN(agg.plugins, 8)) console.log(`  ${p.name.padEnd(30)} ${p.count}`)
console.log('presets:')
for (const p of topN(agg.presets, 8)) console.log(`  ${String(p.name).padEnd(30)} ${p.count}`)
console.log('last 14 days:')
const days = Object.keys(agg.days).sort().slice(-14)
for (const d of days) {
  const cell = agg.days[d]
  console.log(`  ${d}  tok ${fmt(cell.tokens).padStart(7)}  turns ${String(cell.turns).padStart(3)}  tools ${String(cell.toolCalls).padStart(4)}  sessions ${cell.sessions}`)
}

process.exit(0)
