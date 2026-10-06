/** Loader registration smoke and interactive DOM tests with the real DSH primitives. */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const packageName = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).name
const dom = new JSDOM('<!doctype html><html lang="zh-CN"><body><div id="root"></div></body></html>', { url: 'https://dsh.example.test' })
const previousGlobals = new Map()
for (const [name, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true })) {
  previousGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}
let server, React, UI, createRoot, act

before(async () => {
  const modulePath = process.env.DSH_UI_PRIMITIVES_PATH || fileURLToPath(import.meta.resolve('@deepseek-ai/dsh-client-ui-primitives'))
  const runtime = createRequire(modulePath)
  React = await import(pathToFileURL(runtime.resolve('react')).href)
  ;({ createRoot } = await import(pathToFileURL(runtime.resolve('react-dom/client')).href))
  act = React.act
  server = await createServer({
    configFile: false,
    server: { middlewareMode: true },
    appType: 'custom',
    ssr: { noExternal: ['@deepseek-ai/dsh-client-ui-primitives'] }
  })
  UI = await server.ssrLoadModule(modulePath)
})

after(async () => {
  await server?.close()
  dom.window.close()
  for (const [name, descriptor] of previousGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else delete globalThis[name]
  }
})

function loadBundle() {
  let result
  const loaderWindow = { __ModuleLoader__: { load(handoff) {
    assert.equal(handoff.id, packageName)
    result = handoff.factory(spec => {
      if (spec === 'react') return React
      if (spec === '@deepseek-ai/dsh-client-ui-primitives') return UI
      throw new Error('Unexpected module: ' + spec)
    })
  } } }
  new Function('window', source)(loaderWindow)
  return result
}

function context() {
  const registrations = []
  const injected = []
  const disposers = []
  let dictionaries
  const t = (key, params = {}) => dictionaries.zh[key].replace(/\{([^}]+)\}/g, (_, name) => String(params[name] ?? ''))
  const ctx = {
    effect(effect) { const disposer = effect(); if (typeof disposer === 'function') disposers.push(disposer) },
    locale: {
      register(ns, dicts) { assert.equal(ns, 'dsh-usage-analytics'); dictionaries = dicts; return () => { dictionaries = undefined } },
      bind() { return t }
    },
    slots: {
      inject(key, callback) { injected.push(key); ctx.effect(callback) },
      register(options, component) {
        const entry = { options, component }
        registrations.push(entry)
        return () => registrations.splice(registrations.indexOf(entry), 1)
      }
    }
  }
  return { ctx, registrations, injected, t, dispose: () => disposers.reverse().forEach(fn => fn()) }
}

function payload(rows = [
  { name: 'alpha', calls: 2, sessionCount: 1, modelCalls: 1, userCalls: 1, failedCalls: 0, pendingCalls: 0, lastUsedAt: 1780000000000 },
  { name: 'beta', calls: 5, sessionCount: 2, modelCalls: 5, userCalls: 0, failedCalls: 1, pendingCalls: 1, lastUsedAt: 1780000001000 }
]) {
  return {
    generatedAt: 1780000002000, refreshIntervalMs: 30000, scan: { pending: false },
    skillUsage: { totalCalls: rows.reduce((total, row) => total + row.calls, 0), uniqueSkills: rows.length, sessionCount: rows.length ? 2 : 0, modelCalls: 6, userCalls: 1, failedCalls: 1, pendingCalls: 1, unattributedCalls: 0, rows }
  }
}

async function mount(fetcher, { storage } = {}) {
  localStorage.clear()
  if (storage) localStorage.setItem('dshua.skillPeriod.v1', storage)
  const bundle = loadBundle()
  const harness = context()
  bundle.apply(harness.ctx)
  const originalFetch = globalThis.fetch
  globalThis.fetch = fetcher
  const root = createRoot(document.getElementById('root'))
  const entry = harness.registrations.find(row => row.options.name === 'sidebar.footer.action')
  const overlay = harness.registrations.find(row => row.options.name === 'shell.overlay')
  await act(async () => root.render(React.createElement(React.Fragment, null, React.createElement(entry.component, { t: harness.t, wide: true }), React.createElement(overlay.component, { t: harness.t }))))
  const trigger = document.querySelector('[aria-label="技能统计"]')
  const dispose = async () => {
    await act(async () => root.unmount())
    harness.dispose()
    globalThis.fetch = originalFetch
  }
  return { trigger, dispose, open: async () => { trigger.focus(); await act(async () => trigger.click()) } }
}

async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve() }) }
async function clickText(text) {
  const button = [...document.querySelectorAll('button')].find(button => button.textContent === text)
  assert.ok(button, 'Button exists: ' + text)
  await act(async () => button.click())
}
function rowNames() { return [...document.querySelectorAll('tbody tr td:first-child')].map(cell => cell.textContent) }
function respond(data) { return Promise.resolve({ ok: true, json: async () => data }) }


test('registers locale-aware sidebar and overlay entries and releases effects', () => {
  const bundle = loadBundle()
  const harness = context()
  assert.deepEqual(bundle.inject, ['slots', 'locale'])
  bundle.apply(harness.ctx)
  assert.deepEqual(harness.injected, ['sidebar.footer.action', 'shell.overlay'])
  assert.equal(harness.registrations.length, 2)
  assert.ok(harness.registrations.every(entry => entry.options.locale === 'dsh-usage-analytics'))
  assert.equal(harness.registrations[0].options.label(), '技能统计')
  assert.ok(document.querySelector('style[data-plugin-css="dsh-usage-analytics"]'))
  harness.dispose()
  assert.equal(harness.registrations.length, 0)
  assert.equal(document.querySelector('style[data-plugin-css="dsh-usage-analytics"]'), null)
})

test('ranks real Host counts, searches without changing totals, and exposes only requested periods', async () => {
  const requests = []
  const mounted = await mount(url => { requests.push(url); return respond(payload()) }, { storage: 'bad-period' })
  try {
    await mounted.open()
    await flush()
    assert.deepEqual(rowNames(), ['beta', 'alpha'])
    assert.deepEqual([...document.querySelectorAll('.dshua-statValue')].map(item => item.textContent), ['7', '2', '2'])
    assert.deepEqual([...document.querySelectorAll('[role="tab"]')].map(item => item.textContent), ['总次数', '最近七天', '最近一个月'])
    assert.equal(requests[0], '/api/dsh-usage-analytics/stats?period=all')
    assert.match(document.querySelector('.dshua-calls').textContent, /5失败 1待结果 1/)
    const input = document.querySelector('input[type="search"]')
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, 'ALPHA')
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    })
    assert.deepEqual(rowNames(), ['alpha'])
    assert.equal(document.querySelector('.dshua-statValue').textContent, '7')
    await clickText('清除搜索')
    assert.deepEqual(rowNames(), ['beta', 'alpha'])
    await clickText('最近七天')
    await flush()
    assert.equal(requests.at(-1), '/api/dsh-usage-analytics/stats?period=7')
    await clickText('最近一个月')
    await flush()
    assert.equal(requests.at(-1), '/api/dsh-usage-analytics/stats?period=30')
    assert.equal(localStorage.getItem('dshua.skillPeriod.v1'), '30')
  } finally { await mounted.dispose() }
})

test('shows initial loading and read failure, then retries to a real zero result', async () => {
  let rejectRequest
  const mounted = await mount(() => new Promise((_, reject) => { rejectRequest = reject }))
  try {
    await mounted.open()
    assert.match(document.querySelector('[role="dialog"]').textContent, /正在读取 Skill 使用记录/)
    assert.equal(document.querySelector('.dshua-statValue'), null)
    await act(async () => rejectRequest(new Error('Unavailable')))
    assert.match(document.querySelector('[role="dialog"]').textContent, /未能读取统计/)
    globalThis.fetch = () => respond(payload([]))
    await clickText('重试')
    await flush()
    assert.deepEqual([...document.querySelectorAll('.dshua-statValue')].map(item => item.textContent), ['0', '0', '0'])
    assert.match(document.querySelector('[role="dialog"]').textContent, /这个时间范围内没有 Skill 使用记录/)
    assert.equal(document.querySelector('table'), null)
  } finally { await mounted.dispose() }
})

test('refuses missing statistics, retains rows on refresh failure, and recovers on a later refresh', async () => {
  let fail = false
  const requests = []
  const mounted = await mount(url => { requests.push(url); return fail ? Promise.reject(new Error('Down')) : respond(payload()) })
  try {
    await mounted.open()
    await flush()
    fail = true
    await clickText('刷新')
    await flush()
    assert.equal(requests.at(-1), '/api/dsh-usage-analytics/stats?period=all&force=1')
    assert.deepEqual(rowNames(), ['beta', 'alpha'])
    assert.match(document.querySelector('[role="alert"]').textContent, /上次成功读取/)
    fail = false
    await clickText('刷新')
    await flush()
    assert.equal(document.querySelector('[role="alert"]'), null)
    globalThis.fetch = () => respond({ generatedAt: 1, refreshIntervalMs: 30000 })
    await clickText('最近七天')
    await flush()
    assert.equal(document.querySelector('.dshua-statValue'), null)
    assert.match(document.querySelector('[role="dialog"]').textContent, /未能读取统计/)
  } finally { await mounted.dispose() }
})

test('uses Host polling delays, forces only explicit refresh, and restores focus on Escape', async () => {
  let calls = 0
  const requests = []
  const timers = new Map()
  let nextTimer = 1
  const originalSetTimeout = globalThis.setTimeout, originalClearTimeout = globalThis.clearTimeout
  const mounted = await mount(url => { requests.push(url); calls += 1; const data = payload(); data.scan = { pending: calls === 1, pollAfterMs: 2500 }; return respond(data) })
  try {
    globalThis.setTimeout = (callback, delay) => { const id = nextTimer++; timers.set(id, { callback, delay }); return id }
    globalThis.clearTimeout = id => timers.delete(id)
    await mounted.open()
    await flush()
    assert.equal(calls, 1)
    assert.ok([...timers.values()].some(timer => timer.delay === 2500))
    assert.match(document.querySelector('[role="dialog"]').textContent, /正在扫描历史会话/)
    assert.ok(document.querySelector('[role="dialog"]').contains(document.activeElement))
    const polling = [...timers.entries()].find(([, timer]) => timer.delay === 2500)
    timers.delete(polling[0])
    await act(async () => polling[1].callback())
    await flush()
    assert.equal(calls, 2)
    assert.equal(requests.at(-1), '/api/dsh-usage-analytics/stats?period=all')
    assert.ok([...timers.values()].some(timer => timer.delay === 30000))
    await clickText('刷新')
    await flush()
    assert.equal(calls, 3)
    assert.equal(requests.at(-1), '/api/dsh-usage-analytics/stats?period=all&force=1')
    await act(async () => document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    assert.equal(document.querySelector('[role="dialog"]'), null)
    assert.equal(document.activeElement, mounted.trigger)
    assert.equal([...timers.values()].filter(timer => timer.delay === 2500 || timer.delay === 30000).length, 0)
  } finally {
    globalThis.setTimeout = originalSetTimeout
    globalThis.clearTimeout = originalClearTimeout
    await mounted.dispose()
  }
})

test('does not present incomplete or pending scans as an observed zero', async () => {
  let scan = { pending: false, stale: true, failed: 1 }
  const mounted = await mount(() => { const data = payload([]); data.scan = scan; return respond(data) })
  try {
    await mounted.open()
    await flush()
    assert.match(document.querySelector('[role="alert"]').textContent, /统计不完整/)
    assert.equal(document.querySelector('.dshua-statValue'), null)
    assert.doesNotMatch(document.querySelector('[role="dialog"]').textContent, /这个时间范围内没有 Skill 使用记录/)
    assert.match(document.querySelector('[role="dialog"]').textContent, /包含失败/)
    scan = { pending: true, stale: false, failed: 0 }
    await clickText('刷新')
    await flush()
    assert.match(document.querySelector('[role="dialog"]').textContent, /正在扫描历史会话/)
    assert.equal(document.querySelector('.dshua-statValue'), null)
    assert.doesNotMatch(document.querySelector('[role="dialog"]').textContent, /这个时间范围内没有 Skill 使用记录/)
    scan = { pending: false, stale: false, failed: 0 }
    await clickText('刷新')
    await flush()
    assert.equal(document.querySelector('.dshua-statValue').textContent, '0')
    assert.match(document.querySelector('[role="dialog"]').textContent, /这个时间范围内没有 Skill 使用记录/)
  } finally { await mounted.dispose() }
})

test('ignores obsolete responses after period changes and records unknown timestamps honestly', async () => {
  let settleAll
  const mounted = await mount(url => url.endsWith('all') ? new Promise(resolve => { settleAll = resolve }) : respond(payload([{ name: '(unknown skill)', calls: 1, sessionCount: 1, modelCalls: 1, userCalls: 0, failedCalls: 0, pendingCalls: 0, lastUsedAt: null }])))
  try {
    await mounted.open()
    await clickText('最近七天')
    await flush()
    assert.deepEqual(rowNames(), ['未知 Skill'])
    assert.match(document.querySelector('tbody').textContent, /时间未知/)
    await act(async () => settleAll({ ok: true, json: async () => payload() }))
    await flush()
    assert.deepEqual(rowNames(), ['未知 Skill'])
    assert.equal(document.querySelector('.dshua-statValue').textContent, '1')
  } finally { await mounted.dispose() }
})
