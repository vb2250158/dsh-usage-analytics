# Changelog

## 1.1.1 — 2026-10-06

Completed history scans retain their zero-count display while background tail refreshes run. The scanning status now describes an unfinished history build instead of every cached request's background refresh. Installation guidance explicitly includes enabling an already-installed bundle.

## 1.1.0 — 2026-10-06

This fork replaces the upstream general usage dashboard with a dedicated Skill usage page. The default view shows total counts, with rolling seven-day and thirty-day filters, name search, usage ranking, distinct-session counts, source counts, and the most recent use.

Model Skill tool attempts include failed calls. Explicit user loads require the confirmed `skill-invocation` instructions event; plain slash text and prompt mentions do not count. Per-invocation metadata supports exact time filtering without caching prompt text, Skill bodies, raw arguments, or result content.

The observer uses DSH 0.2 `list()` and read-only persistence handles, skips the exact inherited fork prefix, drops deleted sessions after scans, and exposes stale scan status. Browser contributions use the current sidebar and overlay slots. Refresh timing, cache directory, and scan concurrency are configurable.

Existing users must install this fork at a pinned Git commit and restart their profile. The statistics response is now Skill-only: `generatedAt`, `period`, `from`, `skillUsage`, `refreshIntervalMs`, and `scan`. Consumers of the upstream statistics response must update. The derived cache rebuilds from retained session logs after the cache-version change.

The original project is [2327644800/dsh-usage-analytics](https://github.com/2327644800/dsh-usage-analytics), authored by lemon and licensed under Apache-2.0; its attribution and license are retained.
