/** Loader registration smoke and interactive DOM tests with the real DSH primitives. */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'
import * as Cordis from '@deepseek-ai/cordis'
import * as Slots from '@deepseek-ai/dsh-client-ui-slots'

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const packageName = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).name
const dom = new JSDOM('<!doctype html><html lang="zh-CN"><body><div id="root"></div></body></html>', { url: 'https://dsh.example.test' })
const previousGlobals = new Map()
for (const [name, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true })) {
  previousGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}
let server, React, UI, createRoot, act, renderer, moduleRuntime

before(async () => {
  const modulePath = process.env.DSH_UI_PRIMITIVES_PATH || fileURLToPath(import.meta.resolve('@deepseek-ai/dsh-client-ui-primitives'))
  const runtime = createRequire(modulePath)
  moduleRuntime = runtime
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
  const rendererSource = readFileSync(fileURLToPath(import.meta.resolve('@deepseek-ai/dsh-client-ui-renderer/client')), 'utf8')
  new Function('window', rendererSource)({ __ModuleLoader__: { load(handoff) {
    renderer = handoff.factory(spec => {
      if (spec === '@deepseek-ai/cordis') return Cordis
      if (spec === '@deepseek-ai/dsh-client-ui-slots') return Slots
      return runtime(spec)
    })
  } } })
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
    effect(effect) {
      const cleanup = effect()
      let disposed = false
      const dispose = () => { if (disposed) return; disposed = true; if (typeof cleanup === 'function') cleanup() }
      disposers.push(dispose)
      return dispose
    },
    locale: {
      register(ns, dicts) { assert.equal(ns, 'dsh-usage-analytics'); dictionaries = dicts; return () => { dictionaries = undefined } },
      bind() { return t }
    },
    slots: {
      spec(key) { return ['sidebar.footer.action', 'shell.overlay'].includes(key) ? { kind: 'list', scope: 'root' } : undefined },
      subscribe() { return () => {} },
      inject(key, callback) { injected.push(key); return ctx.slots.spec(key) ? ctx.effect(callback) : () => {} },
      register(options, component) {
        const entry = { options, component }
        registrations.push(entry)
        return () => { const index = registrations.indexOf(entry); if (index !== -1) registrations.splice(index, 1) }
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
function rowNames() { return [...document.querySelectorAll('.dshua-table tbody tr td:first-child')].map(cell => cell.textContent) }
function respond(data) { return Promise.resolve({ ok: true, json: async () => data }) }


test('registers locale-aware sidebar and overlay entries and releases effects', () => {
  const bundle = loadBundle()
  const harness = context()
  assert.deepEqual(bundle.inject, ['slots', 'locale'])
  bundle.apply(harness.ctx)
  assert.deepEqual(harness.injected, ['settings.usage-statistics.tab', 'sidebar.footer.action', 'shell.overlay'])
  assert.equal(harness.registrations.length, 2)
  assert.ok(harness.registrations.every(entry => entry.options.locale === 'dsh-usage-analytics'))
  assert.equal(harness.registrations[0].options.label(), '技能统计')
  assert.ok(document.querySelector('style[data-plugin-css="dsh-usage-analytics"]'))
  harness.dispose()
  assert.equal(harness.registrations.length, 0)
  assert.equal(document.querySelector('style[data-plugin-css="dsh-usage-analytics"]'), null)
})

test('shows catalog descriptions, searches descriptions and opens the current Skill in a keyboard-dismissable dialog', async () => {
  const data = payload()
  data.catalog = { available: true, entries: [{ name: 'alpha', description: '[XinghaiBuilder] 配置检查: 检查变更与配置' }] }
  const requests = []
  const mounted = await mount(url => {
    requests.push(url)
    return respond(url.includes('/skill?') ? { name: 'alpha', title: '配置检查', description: '检查变更与配置', content: '# 配置检查\n\n只读检查。\n\n```js\nconsole.log("example")\n```' } : data)
  })
  try {
    await mounted.open()
    await flush()
    assert.equal(document.querySelector('[aria-label="查看 配置检查"]').textContent, '配置检查')
    assert.equal(document.querySelector('.dshua-name .dshua-detailId').textContent, 'alpha')
    assert.match(document.querySelector('.dshua-table').textContent, /检查变更与配置/)
    const input = document.querySelector('input[type="search"]')
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, '配置')
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    })
    assert.equal(document.querySelectorAll('.dshua-table tbody tr').length, 1)
    assert.equal(document.querySelector('.dshua-metricValue').textContent, '7')
    await clickText('配置检查')
    await flush()
    assert.equal(requests.at(-1), '/api/dsh-usage-analytics/skill?name=alpha')
    assert.equal(document.querySelector('.dshua-detail h2').textContent, '配置检查')
    assert.match(document.querySelector('.dshua-detailBody').textContent, /只读检查/)
    assert.match(document.querySelector('.dshua-detailBody').textContent, /console\.log/)
    await act(async () => document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    assert.equal(document.querySelector('.dshua-detail'), null)
    assert.ok(document.querySelector('.dshua-table'))
  } finally { await mounted.dispose() }
})

test('removed Skills keep historical counts and show a readable missing-definition state', async () => {
  const mounted = await mount(url => url.includes('/skill?') ? Promise.resolve({ ok: false, status: 404 }) : respond(payload()))
  try {
    await mounted.open()
    await flush()
    await clickText('alpha')
    await flush()
    assert.match(document.querySelector('.dshua-detail').textContent, /已移除/)
    assert.equal(document.querySelector('.dshua-metricValue').textContent, '7')
  } finally { await mounted.dispose() }
})

test('ranks real Host counts, searches without changing totals, and exposes only requested periods', async () => {
  const requests = []
  const mounted = await mount(url => { requests.push(url); return respond(payload()) }, { storage: 'bad-period' })
  try {
    await mounted.open()
    await flush()
    assert.deepEqual(rowNames(), ['beta', 'alpha'])
    assert.deepEqual([...document.querySelectorAll('.dshua-metricValue')].map(item => item.textContent), ['7', '2', '2'])
    assert.deepEqual([...document.querySelectorAll('[role="tab"]')].map(item => item.textContent), ['总次数', '最近七天', '最近一个月'])
    assert.equal(requests[0], '/api/dsh-usage-analytics/stats?period=all')
    assert.match(document.querySelector('.dshua-calls').textContent, /5失败 1待结果 1/)
    const input = document.querySelector('input[type="search"]')
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, 'ALPHA')
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    })
    assert.deepEqual(rowNames(), ['alpha'])
    assert.equal(document.querySelector('.dshua-metricValue').textContent, '7')
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
    assert.equal(document.querySelector('.dshua-metricValue'), null)
    await act(async () => rejectRequest(new Error('Unavailable')))
    assert.match(document.querySelector('[role="dialog"]').textContent, /未能读取统计/)
    globalThis.fetch = () => respond(payload([]))
    await clickText('重试')
    await flush()
    assert.deepEqual([...document.querySelectorAll('.dshua-metricValue')].map(item => item.textContent), ['0', '0', '0'])
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
    assert.equal(document.querySelector('.dshua-metricValue'), null)
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
    assert.equal(document.querySelector('.dshua-metricValue'), null)
    assert.doesNotMatch(document.querySelector('[role="dialog"]').textContent, /这个时间范围内没有 Skill 使用记录/)
    assert.match(document.querySelector('[role="dialog"]').textContent, /包含失败/)
    scan = { pending: true, stale: false, failed: 0 }
    await clickText('刷新')
    await flush()
    assert.match(document.querySelector('[role="dialog"]').textContent, /正在扫描历史会话/)
    assert.equal(document.querySelector('.dshua-metricValue'), null)
    assert.doesNotMatch(document.querySelector('[role="dialog"]').textContent, /这个时间范围内没有 Skill 使用记录/)
    scan = { pending: false, stale: false, failed: 0 }
    await clickText('刷新')
    await flush()
    assert.equal(document.querySelector('.dshua-metricValue').textContent, '0')
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
    assert.equal(document.querySelector('.dshua-metricValue').textContent, '1')
  } finally { await mounted.dispose() }
})

/** Exercise declaration cascades through the shipped Registry, Cordis effects, and React outlets. */
async function runtime(fetcher) {
  localStorage.clear()
  const originalFetch = globalThis.fetch
  globalThis.fetch = fetcher
  const ctx = new Cordis.Context()
  const dictionaries = new Map()
  const intervals = [], navigatedSessions = []
  let closedSettings = 0
  let snapshot = { active: 'zh', revision: 0 }
  const localeListeners = new Set()
  class TestLocale extends Cordis.Service {
    constructor(ctx) { super(ctx, 'locale') }
    register(ns, dicts) {
      assert.equal(dictionaries.has(ns), false)
      dictionaries.set(ns, dicts)
      return () => dictionaries.delete(ns)
    }
    bind(ns) { return (key, params = {}) => dictionaries.get(ns)[snapshot.active][key].replace(/\{([^}]+)\}/g, (_, name) => String(params[name] ?? '')) }
    getSnapshot() { return snapshot }
    getLocale() { return snapshot }
    subscribe(listener) { localeListeners.add(listener); return () => localeListeners.delete(listener) }
    setLanguage(active) {
      snapshot = { active, revision: snapshot.revision + 1 }
      this.ctx.emit('locale/change', snapshot)
      localeListeners.forEach(listener => listener())
    }
  }
  class TestTimer extends Cordis.Service {
    constructor(ctx) { super(ctx, 'timer') }
    interval(callback, delay) {
      const interval = { callback, delay, stopped: false }
      intervals.push(interval)
      return () => { interval.stopped = true }
    }
  }
  class TestUiWorkspace extends Cordis.Service {
    constructor(ctx) { super(ctx, 'uiWorkspace') }
    openSession(target) { assert.equal(target, 'session-test'); navigatedSessions.push(target) }
  }
  await ctx.plugin({ name: 'test-locale', apply: ctx => { new TestLocale(ctx) } }).await()
  await ctx.plugin({ name: 'test-timer', apply: ctx => { new TestTimer(ctx) } }).await()
  await ctx.plugin({ name: 'test-ui-workspace', apply: ctx => { new TestUiWorkspace(ctx) } }).await()
  await ctx.plugin({ name: 'test-renderer', apply: renderer.apply }).await()
  ctx.slots.installLocale(ctx.locale)
  const absentBinding = { key: undefined, hooks: {}, keyedHooks: {}, props: {} }
  const absent = { getSnapshot: () => absentBinding, subscribe: () => () => {} }
  ctx.slots.installScope('session', { current: absent, bindingSource: () => absent })
  const sessions = { byId: { 'session-test': { displayTitle: 'Known session' } } }
  ctx.slots.provideRoot({ hooks: { sessions: { getSnapshot: () => sessions, subscribe: () => () => {} } } })
  function Frame({ renderSlot }) {
    return React.createElement(React.Fragment, null,
      renderSlot('sidebar.footer.action', { wide: true }),
      renderSlot('shell.overlay', {}),
      renderSlot('settings.section', { close: () => { closedSettings += 1 } }))
  }
  await ctx.plugin({ name: 'test-frame', inject: ['slots'], apply(ctx) {
    ctx.slots.register({ name: 'root', children: {
      'sidebar.footer.action': { kind: 'list', scope: 'root' },
      'shell.overlay': { kind: 'list', scope: 'root' },
      'settings.section': { kind: 'list', scope: 'root' }
    } }, Frame)
  } }).await()
  const root = createRoot(document.getElementById('root'))
  await act(async () => root.render(ctx.slots.renderSlot('root', {})))
  let analytics, owner
  const mountAnalytics = async () => {
    analytics = ctx.plugin({ name: 'skill-analytics', ...loadBundle() })
    await act(async () => { await analytics.await(); await Promise.resolve() })
    return analytics
  }
  const mountOwner = async () => {
    function TabHost({ renderSlot, close }) {
      const [active, setActive] = React.useState(true)
      return React.createElement('div', { 'data-shared-statistics': '' },
        React.createElement('button', { onClick: () => setActive(!active) }, active ? 'Hide Skill test tab' : 'Show Skill test tab'),
        React.createElement('div', { hidden: !active }, renderSlot('settings.usage-statistics.tab', { active, close }, { only: 'skill-usage' })))
    }
    owner = ctx.plugin({ name: 'test-statistics-owner', inject: ['slots'], apply(ctx) {
      ctx.slots.register({ name: 'settings.section', id: 'usage-cost', children: {
        'settings.usage-statistics.tab': { kind: 'list', scope: 'root' }
      } }, TabHost)
    } })
    await act(async () => { await owner.await(); await Promise.resolve() })
    return owner
  }
  return {
    ctx, mountAnalytics, mountOwner,
    intervals, navigatedSessions,
    getClosedSettings: () => closedSettings,
    localeSubscriberCount: () => localeListeners.size,
    setLanguage: async language => { await act(async () => ctx.locale.setLanguage(language)) },
    mountUsage: async () => {
      let usage
      const previousLoader = dom.window.__ModuleLoader__
      dom.window.__ModuleLoader__ = { load(handoff) {
        usage = handoff.factory(spec => spec === 'react' ? React : spec === '@deepseek-ai/dsh-client-ui-primitives' ? UI : moduleRuntime(spec))
      } }
      try { new Function('window', readFileSync(process.env.DSH_USAGE_CLIENT_PATH, 'utf8'))(dom.window) }
      finally { dom.window.__ModuleLoader__ = previousLoader }
      const fiber = ctx.plugin({ name: 'real-usage-statistics', ...usage })
      await act(async () => { await fiber.await(); await Promise.resolve() })
      return fiber
    },
    dispose: async () => {
      await act(async () => { root.unmount(); await ctx.fiber.dispose() })
      globalThis.fetch = originalFetch
    }
  }
}

test('combines through the real Registry in either load order and restores standalone surfaces after owner unload', async () => {
  for (const ownerFirst of [false, true]) {
    const mounted = await runtime(() => respond(payload()))
    try {
      let owner
      if (ownerFirst) owner = await mounted.mountOwner()
      const analytics = await mounted.mountAnalytics()
      if (!ownerFirst) {
        assert.equal(mounted.ctx.slots.entries('sidebar.footer.action').length, 1)
        owner = await mounted.mountOwner()
      }
      await flush()
      assert.equal(mounted.ctx.slots.entries('sidebar.footer.action').length, 0)
      assert.equal(mounted.ctx.slots.entries('shell.overlay').length, 0)
      const tabs = mounted.ctx.slots.entries('settings.usage-statistics.tab')
      assert.equal(tabs.length, 1)
      assert.equal(tabs[0].options.id, 'skill-usage')
      assert.equal(tabs[0].options.label(), 'Skill 使用')
      assert.equal(document.querySelector('[role="dialog"]'), null)
      assert.deepEqual(rowNames(), ['beta', 'alpha'])
      await act(async () => {
        const collapsing = owner.dispose()
        const replacement = mounted.mountOwner()
        await collapsing
        owner = await replacement
      })
      assert.equal(mounted.ctx.slots.entries('sidebar.footer.action').length, 0)
      assert.equal(mounted.ctx.slots.entries('shell.overlay').length, 0)
      assert.equal(mounted.ctx.slots.entries('settings.usage-statistics.tab').length, 1)
      await act(async () => { await owner.dispose(); await Promise.resolve() })
      assert.equal(mounted.ctx.slots.spec('settings.usage-statistics.tab'), undefined)
      assert.equal(mounted.ctx.slots.entries('sidebar.footer.action').length, 1)
      assert.equal(mounted.ctx.slots.entries('shell.overlay').length, 1)
      const trigger = document.querySelector('[aria-label="技能统计"]')
      assert.ok(trigger)
      await act(async () => trigger.click())
      await flush()
      assert.equal(document.querySelectorAll('[role="dialog"]').length, 1)
      owner = await mounted.mountOwner()
      await flush()
      assert.equal(document.querySelector('[role="dialog"]'), null)
      assert.equal(mounted.ctx.slots.entries('sidebar.footer.action').length, 0)
      await act(async () => { await Promise.all([owner.dispose(), analytics.dispose()]); await Promise.resolve() })
      assert.equal(mounted.ctx.slots.entries('sidebar.footer.action').length, 0)
      assert.equal(mounted.ctx.slots.entries('shell.overlay').length, 0)
      owner = await mounted.mountOwner()
      await flush()
      assert.equal(mounted.ctx.slots.entries('settings.usage-statistics.tab').length, 0)
      assert.equal(mounted.ctx.slots.entries('sidebar.footer.action').length, 0)
    } finally { await mounted.dispose() }
  }
})

test('shared tab preserves period, search and results while inactive, aborts polling, and retries through the same API', async () => {
  const requests = []
  let failMonth = false
  const mounted = await runtime((url, options) => {
    requests.push({ url, signal: options.signal })
    return failMonth && url.endsWith('30') ? Promise.reject(new Error('Unavailable')) : respond(payload())
  })
  const originalSetTimeout = globalThis.setTimeout, originalClearTimeout = globalThis.clearTimeout
  const polling = new Map()
  try {
    await mounted.mountOwner()
    globalThis.setTimeout = (callback, delay, ...args) => {
      const id = originalSetTimeout(callback, delay, ...args)
      if (delay === 30000) polling.set(id, false)
      return id
    }
    globalThis.clearTimeout = id => { if (polling.has(id)) polling.set(id, true); return originalClearTimeout(id) }
    await mounted.mountAnalytics()
    await flush()
    assert.equal(requests[0].url, '/api/dsh-usage-analytics/stats?period=all')
    await clickText('最近七天')
    await flush()
    const search = document.querySelector('input[type="search"]')
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(search, 'alpha')
      search.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    })
    assert.deepEqual(rowNames(), ['alpha'])
    const beforeHide = requests.length
    const currentSignal = requests.at(-1).signal
    await clickText('Hide Skill test tab')
    await flush()
    assert.equal(currentSignal.aborted, true)
    assert.equal(requests.length, beforeHide)
    assert.ok([...polling.values()].every(cleared => cleared))
    assert.equal(document.querySelector('input[type="search"]'), search)
    assert.deepEqual(rowNames(), ['alpha'])
    await clickText('Show Skill test tab')
    await flush()
    assert.equal(requests.at(-1).url, '/api/dsh-usage-analytics/stats?period=7')
    assert.equal(document.querySelector('input[type="search"]').value, 'alpha')
    assert.deepEqual(rowNames(), ['alpha'])
    failMonth = true
    await clickText('最近一个月')
    await flush()
    assert.match(document.querySelector('[data-shared-statistics]').textContent, /未能读取统计/)
    await clickText('重试')
    await flush()
    assert.equal(requests.at(-1).url, '/api/dsh-usage-analytics/stats?period=30&force=1')
    assert.deepEqual(rowNames(), ['alpha'])
    assert.equal(document.querySelector('[role="dialog"]'), null)
  } finally {
    await mounted.dispose()
    globalThis.setTimeout = originalSetTimeout
    globalThis.clearTimeout = originalClearTimeout
  }
})

test('real usage-plugin and analytics share localized tabs, preserve selection and restore fallback on unload', { skip: !process.env.DSH_USAGE_CLIENT_PATH }, async () => {
  const requests = []
  const mounted = await runtime((url, options) => {
    requests.push(url)
    return url.startsWith('/api/dsh-usage-analytics/') ? respond(payload()) : respond({
      records: [{ sessionId: 'session-test', time: Date.now(), model: 'test-model', inputTokens: 1, outputTokens: 1 }],
      count: 1, days: [], currency: 'USD', persistOk: true
    })
  })
  try {
    await mounted.mountAnalytics()
    const standaloneSubscribers = mounted.localeSubscriberCount()
    const usage = await mounted.mountUsage()
    await flush()
    assert.equal(mounted.ctx.slots.entries('sidebar.footer.action').length, 0)
    assert.equal(mounted.ctx.slots.entries('shell.overlay').length, 0)
    assert.equal(mounted.ctx.slots.entries('settings.section')[0].options.label(), '使用情况统计')
    const labels = () => [...document.querySelectorAll('[data-dsh-usage-statistics] > [role="tablist"] [role="tab"]')].map(item => item.textContent)
    assert.deepEqual(labels(), ['用量与消耗', 'Skill 使用'])
    assert.ok(mounted.intervals.some(interval => interval.delay === 10000 && !interval.stopped), 'ctx.get(timer) reads the active provided service')
    const sessionLink = document.querySelector('[data-dsh-usage-sessionlink]')
    assert.ok(sessionLink)
    await act(async () => sessionLink.click())
    assert.deepEqual(mounted.navigatedSessions, ['session-test'], 'uiWorkspace.openSession invokes the public view-owner navigation service')
    assert.equal(mounted.getClosedSettings(), 1)
    assert.equal(requests.filter(url => url.startsWith('/api/dsh-usage-analytics/')).length, 0)
    await clickText('Skill 使用')
    await flush()
    assert.ok(mounted.intervals.every(interval => interval.stopped))
    assert.equal(document.querySelector('[role="dialog"]'), null)
    assert.deepEqual(rowNames(), ['beta', 'alpha'])
    await clickText('最近一个月')
    await flush()
    const input = document.querySelector('input[type="search"]')
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, 'alpha')
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    })
    await clickText('用量与消耗')
    const beforeHidden = requests.length
    await flush()
    assert.equal(requests.length, beforeHidden)
    await clickText('Skill 使用')
    await flush()
    assert.equal(document.querySelector('input[type="search"]'), input)
    assert.equal(input.value, 'alpha')
    assert.equal(requests.at(-1), '/api/dsh-usage-analytics/stats?period=30')
    assert.deepEqual(rowNames(), ['alpha'])
    await mounted.setLanguage('en')
    await flush()
    assert.deepEqual(labels(), ['Usage & Cost', 'Skill usage'])
    assert.equal(mounted.ctx.slots.entries('settings.section')[0].options.label(), 'Usage statistics')
    assert.match(document.querySelector('.dshua-page').textContent, /Last month/)
    assert.equal(input.value, 'alpha')
    await act(async () => { await usage.dispose(); await Promise.resolve() })
    assert.equal(mounted.localeSubscriberCount(), standaloneSubscribers, 'unloading releases the usage-plugin language subscription')
    assert.equal(mounted.ctx.slots.spec('settings.usage-statistics.tab'), undefined)
    assert.equal(mounted.ctx.slots.entries('sidebar.footer.action').length, 1)
    assert.equal(mounted.ctx.slots.entries('shell.overlay').length, 1)
    assert.ok(document.querySelector('[aria-label="Skill statistics"]'))
  } finally {
    await mounted.dispose()
    document.getElementById('dsh-usage-tok-style')?.remove()
  }
})
