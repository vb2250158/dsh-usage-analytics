/** Browser Skill-frequency page with an optional shared statistics tab. The Host owns counts. */
window.__ModuleLoader__.load({
  id: "dsh-usage-analytics",
  factory: (require) => {
    var React = require("react");
    var UI = require("@deepseek-ai/dsh-client-ui-primitives");
    var h = React.createElement;
    var NS = "dsh-usage-analytics";
    var TAB_SLOT = "settings.usage-statistics.tab";
    var PERIODS = ["all", "7", "30"];
    var STR = {
      zh: {
        "sidebar.label": "技能统计", "sidebar.tooltip": "查看 Skill 使用次数",
        "title": "Skill 使用次数", "tab.label": "Skill 使用", "subtitle": "按使用次数排序 · 来自本机 DSH 会话记录", "close": "关闭",
        "period.label": "统计时间范围", "period.all": "总次数", "period.7": "最近七天", "period.30": "最近一个月",
        "refresh": "刷新", "refresh.busy": "刷新中…", "refresh.failed": "刷新失败，下面保留的是上次成功读取的统计。",
        "updated.at": "更新于 {time}", "autoRefresh": "每 {seconds} 秒自动刷新",
        "stat.calls": "使用次数", "stat.skills": "使用过的 Skill", "stat.sessions": "涉及会话",
        "search.label": "搜索 Skill 名称", "search.placeholder": "搜索 Skill…", "search.clear": "清除搜索",
        "table.name": "Skill 名称", "table.calls": "使用次数", "table.model": "模型调用", "table.user": "显式加载",
        "table.sessions": "会话", "table.lastUsed": "最近使用", "table.failed": "失败 {count}", "table.pending": "待结果 {count}",
        "table.unknown": "未知 Skill", "table.unknownTime": "时间未知",
        "loading": "正在读取 Skill 使用记录…", "scanning": "正在扫描历史会话，统计将自动更新。",
        "scan.failed": "部分会话记录读取失败，当前统计不完整。请刷新重试。",
        "error.title": "未能读取统计", "error.desc": "请确认插件 Host 已运行，再重试。", "error.retry": "重试",
        "empty.title": "这个时间范围内没有 Skill 使用记录", "empty.desc": "在 DSH 会话中调用或显式加载 Skill 后，这里会显示次数。",
        "search.empty": "没有匹配的 Skill", "search.emptyDesc": "尝试其他名称，或清除搜索查看全部记录。",
        "counting.note": "模型调用按 Skill 工具调用尝试计数，包含失败；显式加载仅统计已记录加载成功的用户 Skill 指令。同一会话重复使用会累计次数。最近一个月为滚动 30 天。",
        "unattributed.note": "有 {count} 次调用未记录可识别的 Skill 名称，列为未知 Skill，不计入 Skill 种类数。",
        "footer.note": "仅统计本机 DSH 会话。详情显示当前 Skill 定义。",
        "skill.view": "查看 {name}", "skill.descriptionMissing": "当前技能目录中未找到说明",
        "skill.catalogUnavailable": "技能目录暂不可用", "skill.detail": "Skill 详情", "skill.loading": "正在读取 Skill…",
        "skill.unavailable": "此 Skill 已移除或在当前目录中不可用。", "skill.failed": "未能读取 Skill，请重试。",
        "skill.current": "当前定义 · 使用次数来自历史记录", "skill.body": "技能正文",
        "skill.copy": "复制", "skill.copied": "已复制", "skill.more": "展开", "skill.less": "收起"
      },
      en: {
        "sidebar.label": "Skill statistics", "sidebar.tooltip": "View Skill usage counts",
        "title": "Skill usage counts", "tab.label": "Skill usage", "subtitle": "Ranked by usage · from local DSH session records", "close": "Close",
        "period.label": "Statistics period", "period.all": "Total count", "period.7": "Last seven days", "period.30": "Last month",
        "refresh": "Refresh", "refresh.busy": "Refreshing…", "refresh.failed": "Refresh failed. The last successfully loaded statistics remain below.",
        "updated.at": "Updated at {time}", "autoRefresh": "Refreshes every {seconds} seconds",
        "stat.calls": "Usage count", "stat.skills": "Skills used", "stat.sessions": "Sessions involved",
        "search.label": "Search Skill names", "search.placeholder": "Search Skills…", "search.clear": "Clear search",
        "table.name": "Skill name", "table.calls": "Usage count", "table.model": "Model calls", "table.user": "Explicit loads",
        "table.sessions": "Sessions", "table.lastUsed": "Last used", "table.failed": "Failed {count}", "table.pending": "Pending {count}",
        "table.unknown": "Unknown Skill", "table.unknownTime": "Unknown time",
        "loading": "Reading Skill usage records…", "scanning": "Scanning session history. Statistics will update automatically.",
        "scan.failed": "Some session records could not be read. These counts are incomplete. Refresh to retry.",
        "error.title": "Could not load statistics", "error.desc": "Check that the plugin Host is running, then retry.", "error.retry": "Retry",
        "empty.title": "No Skill usage in this period", "empty.desc": "Call or explicitly load a Skill in a DSH session to see its count here.",
        "search.empty": "No matching Skills", "search.emptyDesc": "Try another name or clear the search to show all records.",
        "counting.note": "Model counts include Skill tool-call attempts, including failures. Explicit loads count user Skill instructions recorded as successfully loaded. Repeated use in one session adds to the count. Last month means a rolling 30 days.",
        "unattributed.note": "{count} calls have no identifiable Skill name. They appear as Unknown Skill and do not increase the number of Skill types.",
        "footer.note": "Local DSH sessions only. Details show the current Skill definition.",
        "skill.view": "View {name}", "skill.descriptionMissing": "No description in the current catalog",
        "skill.catalogUnavailable": "Skill catalog unavailable", "skill.detail": "Skill details", "skill.loading": "Reading Skill…",
        "skill.unavailable": "This Skill was removed or is unavailable in the current catalog.", "skill.failed": "Could not read Skill. Please retry.",
        "skill.current": "Current definition · counts come from retained history", "skill.body": "Skill instructions",
        "skill.copy": "Copy", "skill.copied": "Copied", "skill.more": "Expand", "skill.less": "Collapse"
      }
    };
    var CSS = [
      ".dshua-modal{width:min(920px,100%);max-height:100%;padding:20px;gap:16px;color:var(--dsw-alias-label-primary)}",
      ".dshua-page{display:flex;flex-direction:column;min-height:0;gap:10px;color:var(--dsw-alias-label-primary)}.dshua-page>.dshua-subtitle{margin:0}",
      ".dshua-header{display:flex;align-items:flex-start;gap:12px}.dshua-heading{flex:1;min-width:0}.dshua-title{margin:0;font-size:20px;line-height:28px;font-weight:600}.dshua-subtitle{margin:4px 0 0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:20px}",
      ".dshua-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.dshua-periods{min-width:0;flex:0 1 360px}.dshua-summary{display:flex;align-items:center;gap:24px;flex-wrap:wrap;padding:10px 0}",
      ".dshua-metric{display:flex;align-items:baseline;gap:8px}.dshua-metricLabel{font-size:12px;color:var(--dsw-alias-label-secondary)}.dshua-metricValue{font-size:20px;line-height:26px;font-weight:600;font-variant-numeric:tabular-nums}",
      ".dshua-content{min-height:0;overflow:auto}.dshua-searchRow{display:flex;align-items:center;gap:8px;margin:2px 0 10px}.dshua-search{flex:1;min-width:0}.dshua-tableWrap{overflow:auto;border:0.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md)}",
      ".dshua-table{border-collapse:collapse;width:100%;font-size:12px;line-height:20px}.dshua-table th,.dshua-table td{padding:12px 14px;text-align:right;border-bottom:1px solid var(--dsw-alias-border-l1);font-variant-numeric:tabular-nums;white-space:nowrap}.dshua-table th{color:var(--dsw-alias-label-secondary);font-weight:500;background:var(--dsw-alias-bg-layer-1)}.dshua-table th:first-child,.dshua-table td:first-child{text-align:left}.dshua-table tbody tr:last-child td{border-bottom:0}.dshua-table tbody tr:hover{background:var(--dsw-alias-interactive-bg-hover)}",
      ".dshua-name{width:44%;min-width:200px;max-width:400px;overflow-wrap:anywhere;white-space:normal!important;font-weight:500}.dshua-nameButton{max-width:100%;height:auto!important;padding:0!important;justify-content:flex-start!important;text-align:left;white-space:normal!important;color:var(--dsw-alias-link)!important}.dshua-description{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin-top:3px;font-size:11px;line-height:16px;font-weight:400;color:var(--dsw-alias-label-secondary)}.dshua-calls{font-weight:600;font-size:14px}.dshua-rowNote{display:block;font-size:10px;font-weight:400;color:var(--dsw-alias-label-secondary)}.dshua-lastUsed{color:var(--dsw-alias-label-secondary)}",
      ".dshua-detail{width:min(800px,100%);max-height:85vh;padding:20px;display:flex;flex-direction:column;gap:12px;color:var(--dsw-alias-label-primary)}.dshua-detailBody{min-height:0;overflow:auto;overflow-wrap:anywhere}.dshua-detailDescription{margin:0;font-size:13px;line-height:21px;color:var(--dsw-alias-label-secondary)}.dshua-detailId{font-size:12px;color:var(--dsw-alias-label-secondary)}",
      ".dshua-name>.dshua-detailId{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;line-height:16px}",
      ".dshua-note{margin:12px 0 0;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:18px}.dshua-footer{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;border-top:1px solid var(--dsw-alias-border-l1);padding-top:12px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:18px}",
      ".dshua-status{padding:12px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);font-size:12px;color:var(--dsw-alias-label-secondary);margin-bottom:12px}.dshua-error{color:var(--dsw-alias-state-error-primary)}",
      ".dshua-empty{display:flex;align-items:center;flex-direction:column;text-align:center;justify-content:center;gap:10px;padding:36px 16px;min-height:140px}.dshua-emptyTitle{margin:0;font-size:14px;font-weight:500}.dshua-emptyDesc{margin:0;font-size:12px;line-height:20px;color:var(--dsw-alias-label-secondary)}",
      ".dshua-entry{width:100%;justify-content:flex-start;gap:8px}.dshua-entryNarrow{width:36px;padding:0;justify-content:center}.dshua-entryLabel{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dshua-entryActive{background:var(--dsw-alias-interactive-bg-hover)}",
      "@media(max-width:600px){.dshua-modal,.dshua-detail{padding:16px;gap:12px}.dshua-title{font-size:18px}.dshua-summary{gap:14px;padding:8px 0}.dshua-metric{gap:5px}.dshua-metricValue{font-size:18px}.dshua-toolbar{align-items:stretch}.dshua-periods{flex:1}.dshua-table th,.dshua-table td{padding:10px}.dshua-name{min-width:180px}.dshua-footer{display:block}}"
    ].join("\n");
    var openState = false;
    var listeners = new Set();
    function setOpen(value) {
      if (openState === value) return;
      openState = value;
      listeners.forEach(function (listener) { listener(); });
    }
    function subscribe(listener) { listeners.add(listener); return function () { listeners.delete(listener); }; }
    function getOpen() { return openState; }
    function integer(value) { return Number.isInteger(value) && value >= 0; }
    /** Refuse an incompatible Host response instead of displaying fabricated zeros. */
    function validatePayload(payload) {
      var usage = payload && payload.skillUsage;
      if (!usage || !Array.isArray(usage.rows)
        || !["totalCalls", "uniqueSkills", "sessionCount", "modelCalls", "userCalls", "failedCalls", "pendingCalls"].every(function (key) { return integer(usage[key]); })
        || !Number.isFinite(payload.generatedAt) || !Number.isFinite(payload.refreshIntervalMs) || payload.refreshIntervalMs <= 0) {
        throw new Error("Incompatible Skill statistics response");
      }
      usage.rows.forEach(function (row) {
        if (!row || typeof row.name !== "string" || row.name.length === 0
          || !["calls", "sessionCount", "modelCalls", "userCalls", "failedCalls", "pendingCalls"].every(function (key) { return integer(row[key]); })
          || (row.lastUsedAt !== null && (!Number.isFinite(row.lastUsedAt) || !Number.isFinite(new Date(row.lastUsedAt).getTime())))) {
          throw new Error("Invalid Skill usage row");
        }
      });
      if (payload.catalog && (typeof payload.catalog.available !== "boolean" || !Array.isArray(payload.catalog.entries) || !payload.catalog.entries.every(function (entry) { return entry && typeof entry.name === "string" && typeof entry.description === "string"; }))) throw new Error("Invalid Skill catalog response");
      return payload;
    }
    function fetchStats(period, signal, force) {
      return fetch("/api/dsh-usage-analytics/stats?period=" + encodeURIComponent(period) + (force ? "&force=1" : ""), {
        headers: { accept: "application/json" }, credentials: "same-origin", signal: signal
      }).then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      }).then(validatePayload);
    }
    function initialPeriod() {
      try { var saved = localStorage.getItem("dshua.skillPeriod.v1"); if (PERIODS.includes(saved)) return saved; }
      catch (error) { /* Browser storage may be disabled; use the default period. */ }
      return "all";
    }
    function count(value) { return value.toLocaleString(); }
    function timestamp(value) { return new Date(value).toLocaleString(document.documentElement.lang || undefined, { hour12: false }); }
    function Stat(props) { return h("div", { className: "dshua-metric" }, h("div", { className: "dshua-metricLabel" }, props.label), h("div", { className: "dshua-metricValue" }, count(props.value))); }
    function Empty(props) { return h("div", { className: "dshua-empty", role: "status" }, h("p", { className: "dshua-emptyTitle" }, props.title), h("p", { className: "dshua-emptyDesc" }, props.description), props.children); }
    /** Load the current definition on demand; closing or switching tabs cancels the read. */
    function SkillDetail(props) {
      var t = props.t;
      var [state, setState] = React.useState({ data: null, error: null });
      var [retry, setRetry] = React.useState(0);
      React.useEffect(function () {
        if (!props.name) return undefined;
        var controller = new AbortController();
        var live = true;
        setState({ data: null, error: null });
        fetch("/api/dsh-usage-analytics/skill?name=" + encodeURIComponent(props.name), { credentials: "same-origin", signal: controller.signal, headers: { accept: "application/json" } })
          .then(function (response) { if (!response.ok) throw new Error(response.status === 404 ? "missing" : "failed"); return response.json(); })
          .then(function (data) {
            if (!data || data.name !== props.name || !["title", "description", "content"].every(function (key) { return typeof data[key] === "string"; })) throw new Error("failed");
            if (live) setState({ data: data, error: null });
          }).catch(function (error) { if (live && error.name !== "AbortError") setState({ data: null, error: error.message }); });
        return function () { live = false; controller.abort(); };
      }, [props.name, retry]);
      var data = state.data && state.data.name === props.name ? state.data : null;
      var labels = React.useMemo(function () { return { code: { copyLabel: t("skill.copy"), copiedLabel: t("skill.copied") }, footnotes: t("skill.body") }; }, [t]);
      return h(UI.Modal, { open: Boolean(props.name), onClose: props.onClose, title: t("skill.detail"), headless: true, className: "dshua-detail" },
        h("div", { className: "dshua-header" }, h("div", { className: "dshua-heading" }, h("h2", { className: "dshua-title" }, data ? data.title : props.name), data && data.title !== data.name ? h("div", { className: "dshua-detailId" }, data.name) : null, h("p", { className: "dshua-subtitle" }, t("skill.current"))), h(UI.Button, { size: "sm", variant: "ghost", onClick: props.onClose, "aria-label": t("close"), icon: h(UI.IconCloseOutlineRegular, { size: 16 }) })),
        h("div", { className: "dshua-detailBody", "aria-busy": !data && !state.error }, data ? h(React.Fragment, null, h("p", { className: "dshua-detailDescription" }, data.description), h(UI.MarkdownText, { text: data.content, labels: labels })) : state.error ? h(Empty, { title: t(state.error === "missing" ? "skill.unavailable" : "skill.failed"), description: "" }, state.error !== "missing" ? h(UI.Button, { size: "sm", variant: "outline", onClick: function () { setRetry(function (value) { return value + 1; }); } }, t("error.retry")) : null) : h("p", { role: "status" }, t("skill.loading"))));
    }
    /** Host totals stay unchanged; search and ordering affect only visible rows. */
    function SkillTable(props) {
      var t = props.t;
      var usage = props.usage;
      var rows = React.useMemo(function () {
        var query = props.query.trim().toLocaleLowerCase();
        return usage.rows.filter(function (row) { var skill = props.catalog && props.catalog.entries.find(function (entry) { return entry.name === row.name; }); return (row.name + " " + (skill ? skill.description : "")).toLocaleLowerCase().includes(query); })
          .sort(function (a, b) { return b.calls - a.calls || a.name.localeCompare(b.name); });
      }, [usage.rows, props.query, props.catalog]);
      return h(React.Fragment, null,
        h("div", { className: "dshua-summary" }, h(Stat, { label: t("stat.calls"), value: usage.totalCalls }), h(Stat, { label: t("stat.skills"), value: usage.uniqueSkills }), h(Stat, { label: t("stat.sessions"), value: usage.sessionCount })),
        h("div", { className: "dshua-searchRow" },
          h(UI.Input, { type: "search", value: props.query, onChange: function (event) { props.setQuery(event.target.value); }, "aria-label": t("search.label"), placeholder: t("search.placeholder"), className: "dshua-search", "data-modal-autofocus": true }),
          props.query ? h(UI.Button, { size: "sm", variant: "ghost", onClick: function () { props.setQuery(""); } }, t("search.clear")) : null),
        usage.totalCalls === 0 ? h(Empty, { title: t("empty.title"), description: t("empty.desc") })
          : rows.length === 0 ? h(Empty, { title: t("search.empty"), description: t("search.emptyDesc") })
          : h("div", { className: "dshua-tableWrap" }, h("table", { className: "dshua-table", "aria-label": t("title") },
            h("thead", null, h("tr", null, ["name", "calls", "model", "user", "sessions", "lastUsed"].map(function (key) { return h("th", { key: key, scope: "col", "aria-sort": key === "calls" ? "descending" : undefined }, t("table." + key)); }))),
            h("tbody", null, rows.map(function (row) {
              var skill = props.catalog && props.catalog.entries.find(function (entry) { return entry.name === row.name; });
              // Rabi catalog descriptions include an explicit [role] title prefix.
              var named = skill && /^\[[^\]\n]+\]\s+([^:\n]+):\s*([\s\S]*)$/.exec(skill.description);
              var label = named ? named[1] : row.name;
              return h("tr", { key: row.name },
                h("td", { className: "dshua-name" }, row.name === "(unknown skill)" ? t("table.unknown") : h(UI.Button, { size: "sm", variant: "ghost", className: "dshua-nameButton", "aria-label": t("skill.view", { name: label }), onClick: function () { props.onView(row.name); } }, label), named ? h("span", { className: "dshua-detailId" }, row.name) : null, props.catalog ? h("span", { className: "dshua-description" }, named ? named[2] : skill && skill.description || t(props.catalog.available ? "skill.descriptionMissing" : "skill.catalogUnavailable")) : null),
                h("td", { className: "dshua-calls" }, count(row.calls), row.failedCalls > 0 ? h("span", { className: "dshua-rowNote" }, t("table.failed", { count: count(row.failedCalls) })) : null, row.pendingCalls > 0 ? h("span", { className: "dshua-rowNote" }, t("table.pending", { count: count(row.pendingCalls) })) : null),
                h("td", null, count(row.modelCalls)), h("td", null, count(row.userCalls)), h("td", null, count(row.sessionCount)),
                h("td", { className: "dshua-lastUsed" }, row.lastUsedAt === null ? t("table.unknownTime") : h("time", { dateTime: new Date(row.lastUsedAt).toISOString() }, timestamp(row.lastUsedAt))));
            })))),
        h("p", { className: "dshua-note" }, t("counting.note")),
        usage.unattributedCalls > 0 ? h("p", { className: "dshua-note" }, t("unattributed.note", { count: count(usage.unattributedCalls) })) : null);
    }
    /** Keep selection and results mounted while an inactive shared tab stops its requests. */
    function useSkillUsage(active) {
      var [period, setPeriod] = React.useState(initialPeriod);
      var [query, setQuery] = React.useState("");
      var [nonce, setNonce] = React.useState(0);
      var forceRequested = React.useRef(false);
      var [state, setState] = React.useState({ data: null, period: null, loading: false, error: false });
      React.useEffect(function () {
        if (!active) return undefined;
        var live = true;
        var timer;
        var controller = new AbortController();
        var force = forceRequested.current;
        forceRequested.current = false;
        var retryDelay = state.period === period && state.data ? state.data.refreshIntervalMs : null;
        function load() {
          setState(function (previous) { return Object.assign({}, previous, { loading: true, error: false }); });
          var requestedForce = force;
          force = false;
          fetchStats(period, controller.signal, requestedForce).then(function (payload) {
            if (!live) return;
            setState({ data: payload, period: period, loading: false, error: false });
            retryDelay = payload.refreshIntervalMs;
            var delay = payload.scan && payload.scan.pending && Number.isFinite(payload.scan.pollAfterMs) && payload.scan.pollAfterMs > 0 ? payload.scan.pollAfterMs : payload.refreshIntervalMs;
            timer = setTimeout(load, delay);
          }).catch(function (error) {
            if (!live || error.name === "AbortError") return;
            setState(function (previous) { return Object.assign({}, previous, { loading: false, error: true }); });
            if (retryDelay !== null) timer = setTimeout(load, retryDelay);
          });
        }
        load();
        return function () { live = false; controller.abort(); clearTimeout(timer); };
      }, [active, period, nonce]);
      var data = state.period === period ? state.data : null;
      function refresh() { forceRequested.current = true; setNonce(function (value) { return value + 1; }); }
      function selectPeriod(value) {
        setPeriod(value);
        try { localStorage.setItem("dshua.skillPeriod.v1", value); } catch (error) { /* Selection remains usable when storage is disabled. */ }
      }
      return { period: period, query: query, setQuery: setQuery, state: state, data: data, refresh: refresh, selectPeriod: selectPeriod };
    }
    /** Shared page content and the standalone modal use the same request and rendering path. */
    function SkillUsageBody(props) {
      var t = props.t;
      var [selectedSkill, setSelectedSkill] = React.useState(null);
      var model = props.model;
      var state = model.state;
      var data = model.data;
      var period = model.period;
      var refresh = model.refresh;
      var incomplete = data && data.scan && (data.scan.stale || data.scan.failed > 0);
      var pendingEmpty = data && data.scan && data.scan.pending && data.skillUsage.totalCalls === 0;
      var body = !data
        ? state.error ? h(Empty, { title: t("error.title"), description: t("error.desc") }, h(UI.Button, { size: "sm", variant: "outline", onClick: refresh, disabled: state.loading }, t("error.retry")))
          : h("div", { className: "dshua-empty", role: "status", "aria-live": "polite" }, t("loading"))
        : h(React.Fragment, null,
          state.error ? h("div", { className: "dshua-status dshua-error", role: "alert" }, t("refresh.failed")) : null,
          incomplete ? h("div", { className: "dshua-status dshua-error", role: "alert" }, t("scan.failed")) : null,
          data.scan && data.scan.pending ? h("div", { className: "dshua-status", role: "status" }, t("scanning")) : null,
          (incomplete || pendingEmpty) && data.skillUsage.totalCalls === 0
            ? h("p", { className: "dshua-note" }, t("counting.note"))
            : h(SkillTable, { usage: data.skillUsage, catalog: data.catalog, t: t, query: model.query, setQuery: model.setQuery, onView: setSelectedSkill }));
      return h("div", { className: "dshua-page" },
        h("p", { className: "dshua-subtitle" }, t("subtitle")),
        h("div", { className: "dshua-toolbar" }, h(UI.SegmentedControl, { id: "dshua-period", value: period, options: PERIODS.map(function (value) { return { value: value, label: t("period." + value) }; }), onChange: model.selectPeriod, label: t("period.label"), className: "dshua-periods" }), h(UI.Button, { size: "sm", variant: "outline", onClick: refresh, disabled: state.loading }, state.loading ? t("refresh.busy") : t("refresh"))),
        h("div", { className: "dshua-content", id: "dshua-period-" + period + "-panel", role: "tabpanel", "aria-labelledby": "dshua-period-" + period, "aria-busy": state.loading }, body),
        h("div", { className: "dshua-footer" }, h("span", null, t("footer.note")), data ? h("span", null, t("updated.at", { time: timestamp(data.generatedAt) }) + " · " + t("autoRefresh", { seconds: data.refreshIntervalMs / 1000 })) : null),
        h(SkillDetail, { name: props.active ? selectedSkill : null, t: t, onClose: function () { setSelectedSkill(null); } }));
    }
    /** A shared statistics tab receives visibility from its owner through runtime props. */
    function SkillUsagePage(props) {
      var model = useSkillUsage(props.active);
      return h(SkillUsageBody, { t: props.t, model: model, active: props.active });
    }
    function Overlay(props) {
      var open = React.useSyncExternalStore(subscribe, getOpen, getOpen);
      var model = useSkillUsage(open);
      return h(UI.Modal, { open: open, onClose: function () { setOpen(false); }, title: props.t("title"), headless: true, className: "dshua-modal" },
        h("div", { className: "dshua-header" }, h("div", { className: "dshua-heading" }, h("h2", { className: "dshua-title" }, props.t("title"))), h(UI.Button, { size: "sm", variant: "ghost", "aria-label": props.t("close"), onClick: function () { setOpen(false); }, icon: h(UI.IconCloseOutlineRegular, { size: 16 }) })),
        h(SkillUsageBody, { t: props.t, model: model, active: open }));
    }
    function SidebarEntry(props) {
      var open = React.useSyncExternalStore(subscribe, getOpen, getOpen);
      return h(UI.Button, { size: "md", variant: "ghost", className: "dshua-entry" + (props.wide ? "" : " dshua-entryNarrow") + (open ? " dshua-entryActive" : ""), onClick: function () { setOpen(!open); }, title: props.t("sidebar.tooltip"), "aria-label": props.t("sidebar.label"), "aria-expanded": open, icon: h(UI.IconSkillOutlineRegular, { size: 16 }) }, props.wide ? h("span", { className: "dshua-entryLabel" }, props.t("sidebar.label")) : null);
    }
    return {
      inject: ["slots", "locale"],
      apply: function (ctx) {
        ctx.effect(function () { return ctx.locale.register(NS, STR); }, "skill-usage: dictionaries");
        ctx.effect(function () {
          var tag = document.createElement("style");
          tag.dataset.plugin = "dsh-usage-analytics";
          tag.dataset.pluginCss = "dsh-usage-analytics";
          tag.textContent = CSS;
          document.head.appendChild(tag);
          return function () { tag.remove(); };
        }, "skill-usage: stylesheet");
        ctx.effect(function () {
          var closed = false;
          var stopFooter;
          var stopOverlay;
          function stopStandalone() {
            if (stopFooter) stopFooter();
            if (stopOverlay) stopOverlay();
            stopFooter = undefined;
            stopOverlay = undefined;
            setOpen(false);
          }
          function reconcile() {
            if (closed) return;
            if (ctx.slots.spec(TAB_SLOT) !== undefined) {
              stopStandalone();
              return;
            }
            if (!stopFooter) stopFooter = ctx.slots.inject("sidebar.footer.action", function () { return ctx.slots.register({ name: "sidebar.footer.action", id: "usage-analytics", order: 200, locale: NS, label: function () { return ctx.locale.bind(NS)("sidebar.label"); } }, SidebarEntry); });
            if (!stopOverlay) stopOverlay = ctx.slots.inject("shell.overlay", function () { return ctx.slots.register({ name: "shell.overlay", id: "usage-analytics-overlay", order: 200, locale: NS }, Overlay); });
          }
          var unsubscribe = ctx.slots.subscribe(TAB_SLOT, reconcile);
          var stopTab = ctx.slots.inject(TAB_SLOT, function () {
            return ctx.slots.register({ name: TAB_SLOT, id: "skill-usage", order: 10, locale: NS, label: function () { return ctx.locale.bind(NS)("tab.label"); } }, SkillUsagePage);
          });
          reconcile();
          return function () {
            closed = true;
            unsubscribe();
            stopTab();
            stopStandalone();
          };
        }, "skill-usage: standalone or shared tab");
      }
    };
  }
});
