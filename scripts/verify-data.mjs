/** Read-only check against a chosen DSH profile's installed persistence backend. */
import { parseArgs } from 'node:util'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { resolve, join } from 'node:path'
import { aggregateSession, buildSkillUsage } from '../lib/aggregate.js'
import { periodStart } from '../lib/config.js'

const { values } = parseArgs({ options: {
  'profile-dir': { type: 'string' },
  'sessions-root': { type: 'string' },
  period: { type: 'string', default: 'all' },
} })
if (!values['profile-dir'] || !values['sessions-root']) {
  throw new Error('Usage: node scripts/verify-data.mjs --profile-dir <profile> --sessions-root <sessions> [--period all|7|30]')
}
const require = createRequire(join(resolve(values['profile-dir']), 'package.json'))
const { Context } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')))
const { default: Persistence } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-session-persistence-jsonl')))
const context = new Context()
const persistence = new Persistence(context, { root: resolve(values['sessions-root']) })
const sessions = new Map()
let errors = 0
try {
  for (const { header } of await persistence.list()) {
    let handle
    try {
      handle = await persistence.open(header.id, 'read')
      const { events } = await handle.read(handle.inheritedEventCount)
      sessions.set(header.id, aggregateSession(header, events))
    } catch (error) {
      errors += 1
      console.error(JSON.stringify({ sessionId: header.id, error: error.message }))
    } finally { await handle?.close() }
  }
  const usage = buildSkillUsage(sessions, { from: periodStart(values.period) })
  console.log(JSON.stringify({ period: values.period, scannedSessions: sessions.size, errors, ...usage }))
  if (errors) process.exitCode = 1
} finally { await context.fiber.dispose() }
