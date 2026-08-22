# dsh-usage-analytics

> DeepSeek Harness (dsh) Web GUI 的个人 Agent 使用统计与活动仪表盘。
> [English README](./README.md) | English

[![npm version](https://img.shields.io/npm/v/dsh-usage-analytics)](https://www.npmjs.com/package/dsh-usage-analytics)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](./LICENSE)
[![dsh-plugin](https://img.shields.io/badge/dsh-plugin-available-4f6ef7)](https://github.com/topics/dsh-plugin)

为 DeepSeek Harness 打造的**用量统计 / 活动仪表盘**插件。在侧边栏底部（Settings 旁）新增 **用量统计 / Usage** 入口，打开一个全屏 Dashboard，展示你**真实**的 Harness 使用记录：

- **Token 总量**（输入 / 输出 / 缓存命中 / 推理）、**会话活跃度**、GitHub 风格**活动热力图**、**Token 趋势**、**Token 构成**、**模型分布**，以及**个人洞察**（连续活跃、峰值日、最常用模型/工具/Skill 等）。
- 数据**完全来自本地会话事件日志**（`ctx.sessionPersistence`），**不修改任何 Harness 核心**，**不采集、不持久化、不上传任何 Prompt 内容**（只聚合事件元数据与数值）。

## 功能特性

- **完整仪表盘** — 活动热力图、Token 趋势（日/周/小时）、Token 构成、模型分布、推理强度 / 工具 / Skill / 动态插件排行、连续活跃天数与个人洞察。
- **时间段筛选** — 所有图表跟随右上角区间（`今天` / `24小时` / `近7天` / `近30天` / `近90天` / `全部`），头版与图表口径始终一致。
- **按真实模型名汇总** — 同一模型经多个 provider 提供（如 `aaa/…`、`acme-gateway/…`）时，按真实模型名合并为一行；provider 列表仅保留在悬停提示中，不占正文。
- **幽灵会话检测** — 复制后从未运行的 fork 会话被自动排除，重复日志不会虚增你的统计。
- **厂商口径记账** — 头版与热力图使用 raw 口径（输入含缓存命中，与计费控制台一致）；新 token 数字始终单独可见，方便区分"新增"与"上下文重读"。
- **本地且私密** — API 仅限回环访问，无遥测、无上传、不采集不持久化 Prompt 内容。
- **增量且秒开** — 每会话 revision 差分 + 可续折；仪表盘先返回缓存快照，后台完成扫描。

## 数字口径说明（重要）

DeepSeek 系 API 在控制台中把**缓存命中的输入 token 也计入"输入"**。长会话 + 大上下文时，每次工具调用都会重发整段对话，因此**"输入"里 99%+ 可能是缓存读取**——这就是为什么忙碌的一天 raw 口径能到*几十亿*，而你真正**新增**的 token 往往只有几千万。

本插件刻意沿用该约定（让仪表盘与厂商控制台对得上），但始终把三个数字分开：

| 术语 | 含义 |
| --- | --- |
| **输入** | 仅未缓存（新增）输入 token |
| **缓存命中** | 命中供应商缓存的 prompt token（重复读取） |
| **输出** | 生成 token |

如果 raw 总量显得过大，请看**新 token** 口径（日格子、小时桶、"输入"行）——那才是你直觉上"产生"的用量。

## 安装

### 通过 npm（推荐）

```bash
dsh plugin --profile <名称> add dsh-usage-analytics
```

然后重启 Web 服务（profile bundle 在启动时装载）。

### 手动 / 本地开发

1. 把包复制到 `data/profiles/web/plugins/dsh-usage-analytics/`（纯 JS，无需构建）。
2. 让 web profile 的 `node_modules/@local/dsh-usage-analytics` 可解析到该目录（用 junction/符号链接，或直接复制一份——两者皆可；**注意两个位置不会自动同步**，改动需保持一致）。
3. 在 `data/profiles/web/package.json` 的 `dsh.profile.bundles` 追加 `dsh-usage-analytics`（若用 `pnpm install` 还需加 `file:` 依赖）。
4. 重启 Web 服务。

重启后：

- 侧边栏底部出现「用量统计 / Usage」入口 → 打开全屏 Dashboard；
- `GET /api/dsh-usage-analytics/stats` 返回聚合 JSON（`?force=1` 全量重扫）；
- 浏览器包按 profile bundle roster 提供（`/plugins/@local/dsh-usage-analytics/client.js`）。

## 使用

点击侧边栏底部 **用量统计**。用头部的时间胶囊筛选所有图表（今天 / 24小时 / 近7天 / 近30天 / 近90天 / 全部）。悬停热力图格子查看每日详情。「刷新」按钮从会话日志重新同步（缓存版本升级后的首次打开会自动重建聚合，需几秒）。

## 数据与隐私

| 保证 | 实现 |
| --- | --- |
| 仅本地 | 通过 `ctx.sessionPersistence` 读会话日志；绝不写入会话；HTTP 路由仅限回环 + 同源围栏 |
| 仅元数据 | 只消费事件类型与数值 `usage` 字段——用户 Prompt 内容不采集、不持久化、不提供 |
| 故障隔离 | 每次折叠/监听均 try/catch 包裹；统计故障绝不影响 Agent 循环或 GUI（最坏情况：返回带 `stale: true` 的旧缓存） |

## 架构

```
Session events / sessions
   └─> lib/aggregate.js   聚合核心（纯函数：foldEvent / mergeInto / computeInsights / streaks）
          └─> lib/store.js 增量缓存：revision 差分 + readFrom(fromSeq) 单源折叠 + JSON 持久化
                 └─> lib/index.js 宿主插件：/api/dsh-usage-analytics/stats 路由 + 后台补折
                        └─> lib/client.js 浏览器端：sidebar.footer.action + shell.overlay 官方 Slot
```

- **单源折叠（v3）** — 只从持久化日志 `readFrom(fromSeq)` 折叠，水印仅由持久化读取推进，不可能重复计数。
- **增量** — `sessionPersistence.listSnapshots()` 提供每会话 stat revision（只读头）；未变化会话整跳过，变化会话只折叠尾部。
- **缓存** — 每会话折叠结果 + revision 水印持久化到 `<DSH_HOME>/usage-analytics/agg.json`（原子写）；`CACHE_VERSION` 变更自动全量重建。
- **模型按天桶（v9）** — 每个模型记录每日 新增/raw/输出/调用 计数，使模型分布图可跟随时间段筛选。
- **幽灵 fork 检测（v6）** — 全部 usage 早于自身创建时间的 fork 会话视为复制种子，自动排除。

## 开发

```bash
npm test                    # node --test：聚合核心 + 客户端 bundle 冒烟（零依赖）
node scripts/verify-data.mjs   # 用真实会话数据打印仪表盘将展示的统计
node scripts/smoke-host.mjs    # 端到端冒烟：真实 persistence + 插件 apply + 路由处理器
```

目录：`lib/`（宿主 + 客户端）、`test/`（单元测试）、`scripts/`（开发验证工具，不入包）。

## 已知边界

- **费用估算**：无本地定价表，不展示金额（未来可加 provider→price 映射扩展点）。
- **Skill 级 Token 归因**：只统计 skill 调用次数，无法把 Token 精确归属到单个 Skill。
- **会话时长**：以首个/最后一个事件的墙钟时间差近似。
- **删除会话不会立即减少统计**：聚合缓存保留已折叠结果，直到全量重建（`CACHE_VERSION` 升级，或删除 `agg.json` 后重启）。仪表盘本身在快照时已排除幽灵 fork。
- **多窗口实时性**：宿主端聚合在进程内；并发写缓存文件以原子重命名保证安全，但以最后写入为准。

## FAQ

**为什么某一天有几十亿 token？**
这是厂商 raw 口径：包含缓存命中的 prompt token。长会话 + 40万~80万上下文时，每次调用都在重读大部分上下文。当天真正的"新 token"通常小两个数量级——见[数字口径说明](#数字口径说明重要)。

**数字是伪造的吗？**
不是——每个数字都来自你自己会话日志中 `assistant/message.usage` 事件的逐次累加。没有任何估算、外推或注入。

**为什么删除对话后总量不减？**
删除只移除日志，统计缓存里已折叠的结果会保留到全量重建。这是已记录的限制（见上文）。

**什么是"幽灵会话"？**
创建后从未运行的会话 fork——其整段日志是父会话的复制种子。统计它们会重复计算父会话的 token，因此会被自动排除。

## License

Apache-2.0 — 见 [LICENSE](./LICENSE)。
