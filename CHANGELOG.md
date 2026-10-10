# Changelog

## 1.4.1 (2026-10-10)

- 共享标签新增独立展开视图，在窄屏中复用已加载的统计；关闭后保留筛选，标签隐藏时关闭视图并停止请求。
- Add an expanded statistics view using the existing request model, with Escape handling and shared-tab lifecycle support.

## 1.4.0 (2026-10-10)

- 增加使用趋势、来源占比、最常用 Top 10、最久未使用 Top 10，以及可搜索的分页明细；显示未使用时长与上次使用时间。
- 从 DSH Skill 服务读取当前定义，从结构化会话目录保留历史说明；不新增目录扫描。
- 次数优先显示，目录独立加载并限制并发、缓存时长和超时；保留旧缓存次数，后台补齐说明。
- Add usage trends, source shares, frequent and longest-unused rankings, paginated detail rows and explicit historical descriptions. Load counts independently of bounded, cached Skill-service discovery.

## 1.3.2 (2026-10-09)

- 避免父页面样式放大摘要数字与间距；目录提供明确标题时，名称与标识符分行显示。
- Keep compact metrics independent of parent page styling and show explicit catalog titles above identifiers.

## 1.3.1 (2026-10-09)

- 按历史会话工作区查询技能目录与定义；历史扫描期间先展示缓存统计。
- Resolve Skills in their observed workspaces and show cached counts during a history scan.

## 1.3.0 (2026-10-09)

- 顶部汇总改为紧凑摘要，Skill 名称下显示说明；搜索支持说明，点击名称查看当前定义，支持键盘关闭、加载错误和技能移除提示。
- Compact summary, catalog descriptions and description search; accessible current-definition dialogs with retry and missing-Skill states.

## 1.2.2 (2026-10-07)

- 缩小图标绘制内容约三分之一，增加方框内的留白。
- Reduce icon artwork by one third with a centered, padded viewBox.

## 1.2.1 (2026-10-07)

- 为插件列表提供中英文名称与说明，并发布独立的 SVG 图标。
- Publish English and Chinese plugin display metadata and a dedicated SVG icon.

## 1.2.0 — 2026-10-06

Skill usage contributes to the **Usage statistics** settings page through the optional `settings.usage-statistics.tab` slot provided by `dsh-usage-plugin` 1.22.0. The shared page offers **Usage & Cost** and **Skill usage** tabs. The standalone sidebar action and modal registrations are removed while the parent slot is declared and restored when it unloads, regardless of plugin load order.

Visited Skill tabs keep their period, search and loaded counts when hidden, and stop browser requests and polling until active again. The statistics API, counting rules, retained-log cache and all/seven/thirty-day filters are unchanged. Tests exercise the published SlotRegistry, Cordis lifecycle, real primitives, declaration reloads and an optional cross-plugin DOM path.

## 1.1.1 — 2026-10-06

Completed history scans retain their zero-count display while background tail refreshes run. The scanning status now describes an unfinished history build instead of every cached request's background refresh. Installation guidance explicitly includes enabling an already-installed bundle.

## 1.1.0 — 2026-10-06

This fork replaces the upstream general usage dashboard with a dedicated Skill usage page. The default view shows total counts, with rolling seven-day and thirty-day filters, name search, usage ranking, distinct-session counts, source counts, and the most recent use.

Model Skill tool attempts include failed calls. Explicit user loads require the confirmed `skill-invocation` instructions event; plain slash text and prompt mentions do not count. Per-invocation metadata supports exact time filtering without caching prompt text, Skill bodies, raw arguments, or result content.

The observer uses DSH 0.2 `list()` and read-only persistence handles, skips the exact inherited fork prefix, drops deleted sessions after scans, and exposes stale scan status. Browser contributions use the current sidebar and overlay slots. Refresh timing, cache directory, and scan concurrency are configurable.

Existing users must install this fork at a pinned Git commit and restart their profile. The statistics response is now Skill-only: `generatedAt`, `period`, `from`, `skillUsage`, `refreshIntervalMs`, and `scan`. Consumers of the upstream statistics response must update. The derived cache rebuilds from retained session logs after the cache-version change.

The original project is [2327644800/dsh-usage-analytics](https://github.com/2327644800/dsh-usage-analytics), authored by lemon and licensed under Apache-2.0; its attribution and license are retained.
