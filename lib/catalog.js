/** Descriptions from the official Skill service and structured retained session catalogs. */

/** Observe only workspaces that actually used Skills, with newest use first. */
export function skillContexts(store, name) {
  const sessions = [...store.sessions.values()].filter(session => session.skillInvocations.some(item => !name || item.name === name))
  sessions.sort((a, b) => (b.lastAt || b.createdAt) - (a.lastAt || a.createdAt))
  return [...new Set(sessions.map(session => session.cwd).filter(Boolean)), undefined]
}

/** Keep exact historical names; a renamed Skill is never guessed from a similar identifier. */
export function historicalCatalog(store) {
  const entries = new Map()
  const used = new Set([...store.sessions.values()].flatMap(session => session.skillInvocations.map(item => item.name)))
  for (const session of store.sessions.values()) {
    for (const [name, entry] of Object.entries(session.skillCatalog || {})) {
      if (!used.has(name)) continue
      if (!entries.has(name) || entries.get(name).observedAt < entry.time) {
        entries.set(name, { name, description: entry.description, origin: 'history', observedAt: entry.time })
      }
    }
  }
  return entries
}

/** Bounded, expiring metadata cache; definitions still load only through skills.get(). */
export class SkillCatalogReader {
  constructor(store, config) {
    this.store = store
    this.config = config
    this.provider = undefined
    this.current = new Map()
    this.expires = 0
    this.pending = undefined
    this.available = false
    this.stale = false
    this.contextKey = undefined
  }

  /** A replaced or unloaded service cannot supply cached current definitions. */
  setProvider(provider) {
    this.provider = provider
    this.pending = undefined
    this.current.clear()
    this.available = false
    this.stale = false
    this.expires = 0
    this.contextKey = undefined
  }

  /** Return usable historical metadata immediately; current entries take precedence. */
  snapshot() {
    const entries = historicalCatalog(this.store)
    for (const [name, entry] of this.current) entries.set(name, entry)
    return { available: this.available, pending: Boolean(this.pending), stale: this.stale, entries: [...entries.values()].map(({ cwd, ...entry }) => entry) }
  }

  /** Concurrent callers share the same bounded service reads. */
  refresh({ force = false } = {}) {
    if (this.pending) return this.pending
    const contexts = skillContexts(this.store)
    const key = JSON.stringify(contexts)
    if (!this.provider || (!force && key === this.contextKey && Date.now() < this.expires)) return Promise.resolve(this.snapshot())
    const provider = this.provider
    const pending = this.collect(provider, contexts, key).then(() => { if (this.pending === pending) this.pending = undefined; return this.snapshot() }, error => { if (this.pending === pending) this.pending = undefined; throw error })
    this.pending = pending
    return this.pending
  }

  async collect(provider, contexts, key) {
    const catalogs = new Array(contexts.length)
    let next = 0
    await Promise.all(Array.from({ length: Math.min(contexts.length, this.config.catalogConcurrency) }, async () => {
      while (next < contexts.length) {
        const index = next++, cwd = contexts[index]
        const options = { cwd, signal: AbortSignal.timeout(this.config.catalogTimeoutMs) }
        try {
          // snapshot() reports discovery failures that list() intentionally hides.
          catalogs[index] = typeof provider.snapshot === 'function'
            ? await provider.snapshot(options)
            : { skills: await provider.list(options), complete: true }
        } catch (error) { catalogs[index] = { skills: [], complete: false } }
      }
    }))
    if (this.provider !== provider) return this.snapshot()
    const entries = new Map()
    for (let i = 0; i < catalogs.length; i++) {
      for (const { name, description } of catalogs[i].skills) {
        if (!entries.has(name)) entries.set(name, { name, description, origin: 'current', cwd: contexts[i] })
      }
    }
    this.stale = catalogs.some(catalog => !catalog.complete)
    // An incomplete provider read retains last-good metadata until revalidation.
    if (this.stale) for (const [name, entry] of this.current) if (!entries.has(name)) entries.set(name, entry)
    this.current = entries
    this.available = catalogs.some(catalog => catalog.complete)
    this.contextKey = key
    this.expires = this.stale ? 0 : Date.now() + this.config.catalogRefreshMs
    return this.snapshot()
  }

  /** Resolve a discovered name in its owning workspace without directory scanning. */
  async get(name) {
    if (!this.provider) return undefined
    const provider = this.provider
    await this.refresh()
    if (this.provider !== provider) return undefined
    const entry = this.current.get(name)
    if (!entry && this.available && !this.stale) return undefined
    const contexts = entry ? [entry.cwd] : skillContexts(this.store, name)
    for (const cwd of contexts) {
      const skill = await provider.get(name, { cwd, signal: AbortSignal.timeout(this.config.catalogTimeoutMs) })
      if (skill) return skill
    }
    return undefined
  }
}
