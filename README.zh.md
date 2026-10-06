# dsh-usage-analytics

[English README](./README.md) · [Apache-2.0](./LICENSE)

此 fork 的 1.2.0 版本为 DeepSeek Harness Web GUI 增加 Skill 使用统计界面。同时安装兼容的 `dsh-usage-plugin` 时，打开「设置 → 使用情况统计 → Skill 使用」；只安装本插件时，点击设置旁的「技能统计」。两处均可查看使用次数、Skill 数量、使用会话数，以及可搜索的次数排行榜；每行包含模型调用、用户显式加载和最近使用时间。

此 fork 维护于 [vb2250158/dsh-usage-analytics](https://github.com/vb2250158/dsh-usage-analytics)，基于 lemon 编写的 [2327644800/dsh-usage-analytics](https://github.com/2327644800/dsh-usage-analytics)。保留上游许可证与作者归属。

## 安装

使用本仓库已公开提交的完整 40 位 Git SHA 固定安装版本，替换命令中的 `<40-character-commit-sha>`。

```sh
dsh plugin --profile web add github:vb2250158/dsh-usage-analytics#<40-character-commit-sha>
```

确认 profile 的 `dsh.profile.bundles` 列表已选择 `dsh-usage-analytics`；已安装但未启用的 bundle 可在 DSH 插件管理中启用。重启对应 profile 后，打开上述组合统计页面或独立侧边栏入口。此 fork 使用 DSH 0.2 的持久化与浏览器扩展 API，目标包代际为 `0.2.1-alpha.1`。桌面封装需要提供相同 API 与插件解析能力；不据此声明其他版本兼容。

## 使用

默认选择「总次数」（`all`），另提供「最近七天」（`7`）与「最近一个月」（`30`）。后两项从当前时间向前计算连续 7 天、30 天，不按自然周或自然月计算。次数、排行榜、使用会话数和最近使用时间均跟随所选区间。搜索只筛选显示的 Skill 名称，不改变区间汇总数字。

排行榜按次数降序、Skill 名称排序。「刷新」等待扫描保留的会话日志后返回；界面也会自动刷新，并显示扫描中或数据过期状态。

保留的日志没有 Skill 工具调用尝试或已确认的用户加载记录时，界面显示 0 次和空排行榜。

## 组合统计页面

`dsh-usage-plugin` 1.22.0 在「使用情况统计」设置页中声明 root 范围的 list slot `settings.usage-statistics.tab`。本插件以 `skill-usage`、顺序 10 贡献标签，保留自身的本地化标签与词典。父页面通过 runtime props 传入 `active` 与 `close`。SlotMap 声明由 `dsh-usage-plugin/usage-statistics-slots` 拥有；本插件不重复声明，也不要求用量插件存在才能运行。

子槽存在时，独立侧边栏入口与 overlay 注册会撤销；父插件卸载后恢复，两种插件加载顺序均可使用。已访问的子标签隐藏后保留时间范围、搜索与已读取记录，同时停止请求和浏览器轮询。Host 观察器与缓存保持原有生命周期。

## 计数口径

| 来源 | 计入的事件 | 含义 |
| --- | --- | --- |
| 模型 | `tool/call`，且 `data.name === 'skill'` | Skill 工具调用尝试，包括失败；配对的 `tool/result` 标明已报告的失败。 |
| 用户 | `user/message`，且 `data.source.kind === 'skill-invocation'`、`form === 'instructions'` | 用户显式调用后，DSH 已确认并注入的 Skill 正文。 |

普通斜杠指令文本、提示词提及、读取任意 `SKILL.md` 和 Skill 目录展示不作为已确认的用户加载次数。加载或调用记录不能证明后续任务执行成功。参数中没有有效 Skill 名称的调用归入「未知 Skill」，不增加已命名的 Skill 数量。

每行会话数是所选区间内使用该 Skill 的不同会话数量；最近使用是区间内最后一次调用或加载的时间。读取从持久化 handle 的准确 `inheritedEventCount` 后开始，因此 fork 复制的历史只在原会话计数。删除的会话在成功扫描后移出统计；扫描失败时保留之前的记录并标记数据过期。

## 配置

在 profile 的 Cordis 配置中为 `usage-analytics` 插件行设置以下字段。

| 字段 | 默认值 | 用途 |
| --- | --- | --- |
| `dataDir` | 空 | 派生缓存目录；空值使用 `<DSH_HOME>/cache/skill-usage`，未设置该环境变量时使用默认 DSH home。 |
| `autoRefreshMs` | `30000` | 浏览器自动刷新间隔，最少 1000 毫秒。 |
| `scanPollMs` | `2000` | 扫描中的浏览器轮询间隔，最少 100 毫秒。 |
| `backgroundRefreshMs` | `60000` | 后台会话扫描间隔，最少 1000 毫秒。 |
| `flushRefreshMs` | `15000` | 会话事件触发扫描前的等待时间，最少 0 毫秒。 |
| `foldConcurrency` | `4` | 同时读取会话的数量，1 至 32 的整数。 |

缓存可从保留的会话日志重建。缓存版本升级会自动重建旧版本数据；会话 revision 仅在当前持久化服务实例内比较。

## 数据与 API

观察器通过 `sessionPersistence.list()`、`open(id, 'read')` 和 `handle.read(offset)` 读取会话，并关闭每个只读 handle。它不追加会话事件，不注册模型可见工具。缓存保存调用名称、时间、序号、来源分类、调用 ID 和结果状态，不保存提示词、Skill 正文、原始工具参数或结果内容。浏览器只收到汇总元数据。

`GET /api/dsh-usage-analytics/stats?period=all` 使用 Host connection 的身份认证与来源检查。追加 `force=1` 可在返回前重建。响应仅包含 `generatedAt`、`period`、`from`、`skillUsage`、`refreshIntervalMs` 和 `scan`。`from` 是包含该时刻的毫秒时间戳；统计全部保留历史时为 `null`。API 也支持 `today`、`24h` 和 `90`；默认界面提供 `all`、`7`、`30`。

`skillUsage` 包含总次数、来源与失败计数、排行榜 `rows` 和本地日历日期汇总 `days`。每行包含 `name`、`calls`、`sessionCount`、`lastUsedAt`、`modelCalls`、`userCalls`、`failedCalls`、`pendingCalls`。缺少时间戳的调用只计入总次数，不编造最近使用时间。`pendingCalls` 表示已观察日志中尚无配对结果，不能据此判断工具仍在运行。

`scan.pending` 表示历史统计尚未完成构建。完整扫描后，后台刷新保留已观察次数，包括零值；`scan.stale` 与 `scan.failed` 报告未完成的读取。

## 开发

```sh
npm ci
npm test
node scripts/verify-data.mjs --profile-dir <profile-directory> --sessions-root <session-log-directory>
```

验证脚本通过给定 DSH profile 解析持久化实现，从指定会话目录读取元数据计数，不启动 DSH 应用。`lib/aggregate.js` 负责纯函数聚合与排序，`lib/store.js` 负责可重建缓存，`lib/index.js` 注册观察器与路由，`lib/client.js` 通过受支持的浏览器 Slot 提供本地化共享标签或独立弹窗。

客户端测试使用已发布的 DSH SlotRegistry、Cordis effect 与 UI primitives。将 `DSH_USAGE_CLIENT_PATH` 设置为兼容用量插件的 `lib/client.js` 路径，再运行 `node --test test/client.test.mjs`，可包含可选的跨插件 DOM 测试。该测试验证标签文案、选择保留和卸载行为；JSDOM 不验证用量插件的 Canvas 图表。

## 许可证

Apache-2.0，见 [LICENSE](./LICENSE) 与[上游仓库](https://github.com/2327644800/dsh-usage-analytics)。
