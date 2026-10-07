# dsh-usage-analytics

[中文文档](./README.zh.md) · [Apache-2.0](./LICENSE)

Version 1.2.0 of this fork adds a Skill usage page to the DeepSeek Harness Web GUI. With a compatible `dsh-usage-plugin`, open **Settings → Usage statistics → Skill usage**. With this plugin alone, open **Skill statistics** beside Settings. Both show invocation counts, the number of Skills and sessions, and a searchable ranking with model calls, explicit user loads, and the most recent use.

This fork is maintained at [vb2250158/dsh-usage-analytics](https://github.com/vb2250158/dsh-usage-analytics). It derives from [2327644800/dsh-usage-analytics](https://github.com/2327644800/dsh-usage-analytics), originally authored by lemon. The upstream license and attribution remain in place.

## Install

Install the fork from an immutable Git commit into the Web profile. Replace `<40-character-commit-sha>` with a published commit from this repository.

```sh
dsh plugin --profile web add github:vb2250158/dsh-usage-analytics#<40-character-commit-sha>
```

Ensure `dsh-usage-analytics` is selected in the profile's `dsh.profile.bundles` list; an already-installed but disabled bundle can be enabled in DSH's plugin manager. Restart that profile, then open the shared statistics page or the standalone sidebar entry described above. This fork uses the DSH 0.2 persistence and browser extension APIs; its target package generation is `0.2.1-alpha.1`. Desktop carriers require those same APIs and plugin resolution support; no broader compatibility is implied.

## Use

The default period is **Total count** (`all`). **Last seven days** (`7`) and **Last month** (`30`) use rolling intervals of seven and thirty days measured from the current timestamp, rather than calendar weeks or months. Counts, rows, session totals, and the most recent use all follow the selected period. Search filters the displayed Skill names; it does not change the period totals.

The ranking sorts by usage count, then Skill name. **Refresh** waits for a scan of the retained session logs. The page also refreshes automatically and displays scanning or stale-data status.

If the retained logs contain no Skill tool attempts or confirmed user loads, the page shows zero counts and an empty ranking.

## Shared statistics page

`dsh-usage-plugin` 1.22.0 declares the root-scoped list slot `settings.usage-statistics.tab` in its **Usage statistics** settings section. This plugin contributes `skill-usage` at order 10, with its own localized label and dictionary. The parent supplies `active` and `close` as runtime props. The SlotMap declaration is owned by `dsh-usage-plugin/usage-statistics-slots`; this plugin does not duplicate that declaration or require the usage plugin to run.

While the slot exists, the standalone sidebar action and overlay registrations are removed. Unloading the parent restores them; either plugin load order is supported. A visited shared tab retains its selected period, search and loaded rows when hidden, while its requests and browser polling stop. The Host observer and cache keep their existing lifecycle.

## What counts

| Source | Counted event | Meaning |
| --- | --- | --- |
| Model | `tool/call` with `data.name === 'skill'` | A Skill tool attempt. Failed calls are included; a paired `tool/result` identifies reported failures. |
| User | `user/message` with `data.source.kind === 'skill-invocation'` and `form === 'instructions'` | A Skill body that DSH confirmed and injected after an explicit user invocation. |

Plain slash-command text, Skill mentions, reading an arbitrary `SKILL.md`, and the Skill catalog do not count as confirmed user loads. A load or attempt does not demonstrate that the subsequent task succeeded. Calls with no valid Skill name appear under **Unknown Skill** and do not increase the number of named Skills.

Each row counts distinct sessions that used that Skill in the selected interval. The most recent use is the invocation timestamp within that interval. The reader starts after each persistence handle's exact `inheritedEventCount`, so a fork's copied history is counted in its original session only. Deleted sessions disappear after a successful scan; failed scans retain previous rows and report stale data.

## Configuration

Set these fields on the `usage-analytics` plugin row in the profile's Cordis configuration.

| Field | Default | Purpose |
| --- | --- | --- |
| `dataDir` | Empty | Derived cache directory; empty resolves to `<DSH_HOME>/cache/skill-usage`, or the default DSH home when the environment variable is absent. |
| `autoRefreshMs` | `30000` | Browser refresh interval, at least 1000 ms. |
| `scanPollMs` | `2000` | Browser polling interval during a scan, at least 100 ms. |
| `backgroundRefreshMs` | `60000` | Background session scan interval, at least 1000 ms. |
| `flushRefreshMs` | `15000` | Delay before an event-triggered scan, at least 0 ms. |
| `foldConcurrency` | `4` | Simultaneous read-only session scans, an integer from 1 to 32. |

The cache can be rebuilt from retained session logs. A cache version change rebuilds predecessor data automatically. Session revision tokens are compared only within the current persistence service instance.

## Data and API

The observer reads sessions through `sessionPersistence.list()`, `open(id, 'read')`, and `handle.read(offset)`, and closes every read handle. It never appends session events or registers a model-facing tool. Its cache stores invocation names, times, sequence numbers, source categories, call IDs, and result status; it does not store prompt text, Skill bodies, raw tool arguments, or result content. The browser receives only aggregate metadata.

`GET /api/dsh-usage-analytics/stats?period=all` uses the Host connection's authentication and origin checks. Add `force=1` to rebuild before returning. The response contains only `generatedAt`, `period`, `from`, `skillUsage`, `refreshIntervalMs`, and `scan`. `from` is an inclusive epoch-ms cutoff or `null` for all retained history. The API also accepts `today`, `24h`, and `90`; the default interface offers `all`, `7`, and `30`.

`skillUsage` contains overall source and failure counts, ranked `rows`, and local-calendar `days`. Rows include `name`, `calls`, `sessionCount`, `lastUsedAt`, `modelCalls`, `userCalls`, `failedCalls`, and `pendingCalls`. An invocation without a timestamp is included only in all-time statistics and has no invented last-use date. `pendingCalls` means no paired result is present in the observed log, not that the tool is still running.

`scan.pending` describes an unfinished history build. After a completed scan, background tail refreshes retain the observed counts, including zero; `scan.stale` and `scan.failed` report incomplete reads.

## Development

```sh
npm ci
npm test
node scripts/verify-data.mjs --profile-dir <profile-directory> --sessions-root <session-log-directory>
```

The verification script uses the supplied DSH profile to resolve the persistence implementation and prints metadata counts from the supplied session root. It does not launch a DSH application. `lib/aggregate.js` owns the pure fold and ranking; `lib/store.js` owns the rebuildable cache; `lib/index.js` registers the observer and route; `lib/client.js` contributes the localized shared tab or standalone modal through supported browser slots.

Client tests use the published DSH SlotRegistry, Cordis effects and UI primitives. Set `DSH_USAGE_CLIENT_PATH` to a compatible usage-plugin `lib/client.js` before running `node --test test/client.test.mjs` to include the optional cross-plugin DOM test. The test provides the public view-owner navigation method `uiWorkspace.openSession`; `ISessions` has no `open` method. It checks tab labels, preserved selection, navigation calls and unload behavior; JSDOM does not validate the usage plugin's Canvas charts or a real Host session transition.

## License

Apache-2.0. See [LICENSE](./LICENSE) and the [upstream repository](https://github.com/2327644800/dsh-usage-analytics) for the original project.

## Plugin display metadata

The plugin list shows **Skill usage statistics** in English and **Skill 使用统计** in Chinese, following the DSH interface language. `locale/en.json` and `locale/zh.json` provide the title and description; `icon.svg` supplies self-contained artwork. The package exports and publishes these resources. The icon is adapted from Lucide; see [ICON_LICENSE.txt](ICON_LICENSE.txt).

The icon uses a centered 36 × 36 viewBox to leave more space around the artwork inside the plugin icon frame.
