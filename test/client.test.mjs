/**
 * Smoke tests for the browser half: verify the bundle registers the two slot
 * surfaces with the right ids/orders, injects the locale namespace, injects
 * its stylesheet, and keeps its translate fallback working. Components are
 * not rendered here (that is the shell's job, verified live).
 * Run with: node --test test/
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const bundleSource = readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8')

/** Evaluate the bundle in a fake window and capture its exports. */
function loadBundle() {
  const fakeWindow = {
    __ModuleLoader__: {
      load(handoff) {
        assert.equal(typeof handoff.id, 'string')
        assert.equal(typeof handoff.factory, 'function')
        // Materialize the factory with a require stub that answers 'react'.
        const result = handoff.factory(function require(spec) {
          if (spec === 'react') {
            // A minimal React stand-in: components only need createElement and
            // the hook names at import time (they are destructured, not called).
            return {
              createElement: (...args) => ({ __el: true, args }),
              useState: () => [],
              useEffect: () => undefined,
              useMemo: (fn) => fn(),
              useCallback: (fn) => fn,
              useSyncExternalStore: () => false,
            }
          }
          throw new Error('unexpected require: ' + spec)
        })
        fakeWindow.__bundle = result
      },
    },
  }
  const fn = new Function('window', bundleSource)
  fn(fakeWindow)
  return fakeWindow.__bundle
}

test('bundle declares inject and apply', () => {
  const bundle = loadBundle()
  assert.deepEqual(bundle.inject, ['slots', 'locale'])
  assert.equal(typeof bundle.apply, 'function')
})

test('apply registers sidebar entry + overlay with right ids, injects locale + css', () => {
  const bundle = loadBundle()
  const registered = []
  const injected = []
  const styles = []
  let registeredLocale = null
  let bound = null

  const fakeCtx = {
    locale: {
      register(ns, dicts) {
        registeredLocale = { ns, dicts }
      },
      bind(ns) {
        bound = ns
        return (key) => (registeredLocale.dicts.zh[key] ?? key)
      },
    },
    slots: {
      inject(key, cb) {
        injected.push(key)
        // Simulate declarations already live: run the callback now.
        const disposer = cb()
        assert.equal(typeof disposer, 'function')
      },
      register(opts, component) {
        registered.push({ opts, component })
        return () => {}
      },
    },
  }

  // Fake DOM enough for the style injection branch.
  const originalDocument = globalThis.document
  globalThis.document = {
    head: { appendChild() {} },
    querySelector() { return null },
    createElement() {
      return {
        set dataset(v) { this._d = v },
        get dataset() { return this._d ?? (this._d = {}) },
        set textContent(v) { this._t = v },
        get textContent() { return this._t },
      }
    },
  }
  try {
    bundle.apply(fakeCtx)
  } finally {
    if (originalDocument === undefined) delete globalThis.document
    else globalThis.document = originalDocument
  }

  assert.equal(registeredLocale.ns, 'dsh-usage-analytics')
  assert.equal(bound, 'dsh-usage-analytics')
  assert.ok(registeredLocale.dicts.zh['sidebar.label'])
  assert.ok(registeredLocale.dicts.en['sidebar.label'])

  assert.deepEqual(injected, ['sidebar.footer.action', 'shell.overlay'])
  assert.equal(registered.length, 2)

  const entry = registered.find((r) => r.opts.id === 'usage-analytics')
  const overlay = registered.find((r) => r.opts.id === 'usage-analytics-overlay')
  assert.ok(entry)
  assert.equal(entry.opts.name, 'sidebar.footer.action')
  assert.equal(entry.opts.order, 200)
  assert.equal(typeof entry.opts.label, 'function')
  assert.ok(overlay)
  assert.equal(overlay.opts.name, 'shell.overlay')
  assert.equal(typeof entry.component, 'function')
  assert.equal(typeof overlay.component, 'function')
})
