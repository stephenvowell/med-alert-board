const charts = {};
const REFRESH_INTERVAL_MS = 60_000;

let refreshTimer = null;
let dashboardLoading = false;

const els = {
  banner: document.getElementById("banner"),
  connectPanel: document.getElementById("connect-panel"),
  dashboard: document.getElementById("dashboard"),
  connectBtn: document.getElementById("connect-btn"),
  logoutBtn: document.getElementById("logout-btn"),
  refreshBtn: document.getElementById("refresh-btn"),
  rangeDays: document.getElementById("range-days"),
  statsGrid: document.getElementById("stats-grid"),
  sectionNav: document.getElementById("section-nav"),
  chartsSection: document.getElementById("charts-section"),
  recoverySection: document.getElementById("recovery-section"),
  tablesSection: document.getElementById("tables-section"),
};

const RECOVERY_METRICS = [
  {
    id: "recovery-rhr",
    label: "Resting heart rate",
    unit: "bpm",
    lowerIsBetter: true,
    note: "Lower can reflect recovery — confirm with your cardiologist",
    getSeries: (payload) => getRestingHrSeries(payload),
    key: "average_heart_rate",
    color: "#ff7b7b",
  },
  {
    id: "recovery-readiness",
    label: "Readiness score",
    unit: "",
    lowerIsBetter: false,
    getSeries: (payload) => payload.metrics?.daily_readiness ?? [],
    key: "score",
    color: "#5ee1a2",
  },
  {
    id: "recovery-sleep",
    label: "Sleep score",
    unit: "",
    lowerIsBetter: false,
    getSeries: (payload) => payload.metrics?.daily_sleep ?? [],
    key: "score",
    color: "#7c9cff",
  },
  {
    id: "recovery-activity",
    label: "Activity score",
    unit: "",
    lowerIsBetter: false,
    getSeries: (payload) => payload.metrics?.daily_activity ?? [],
    key: "score",
    color: "#ffb86b",
  },
  {
    id: "recovery-hrv",
    label: "HRV (sleep)",
    unit: "ms",
    lowerIsBetter: false,
    note: "Varies with sleep, stress, and illness",
    getSeries: (payload) => aggregateSleepByDay(payload.metrics?.sleep ?? []),
    key: "average_hrv",
    color: "#c792ff",
  },
];

const CHART_DEFS = [
  {
    id: "chart-daily-sleep",
    title: "Daily sleep score",
    source: "daily_sleep",
    dayKey: "day",
    series: [{ key: "score", label: "Score", color: "#7c9cff" }],
  },
  {
    id: "chart-daily-readiness",
    title: "Daily readiness score",
    source: "daily_readiness",
    dayKey: "day",
    series: [{ key: "score", label: "Score", color: "#5ee1a2" }],
  },
  {
    id: "chart-daily-activity",
    title: "Daily activity score",
    source: "daily_activity",
    dayKey: "day",
    series: [{ key: "score", label: "Score", color: "#ffb86b" }],
  },
  {
    id: "chart-daily-stress",
    title: "Daily stress",
    source: "daily_stress",
    dayKey: "day",
    series: [
      { key: "stress_high", label: "Stress high (min)", color: "#ff7b7b" },
      { key: "recovery_high", label: "Recovery high (min)", color: "#5ee1a2" },
    ],
  },
  {
    id: "chart-daily-spo2",
    title: "Daily SpO2 average",
    source: "daily_spo2",
    dayKey: "day",
    series: [{ key: "spo2_percentage.average", label: "SpO2 %", color: "#64d2ff" }],
  },
  {
    id: "chart-vo2-max",
    title: "VO2 max",
    source: "vO2_max",
    dayKey: "day",
    series: [{ key: "vo2_max", label: "VO2 max", color: "#c792ff" }],
  },
  {
    id: "chart-cardiovascular-age",
    title: "Cardiovascular age",
    source: "daily_cardiovascular_age",
    dayKey: "day",
    series: [
      { key: "vascular_age", label: "Vascular age", color: "#f78fb3" },
      { key: "pulse_wave_velocity", label: "Pulse wave velocity", color: "#ffe066" },
    ],
  },
  {
    id: "chart-resilience",
    title: "Resilience contributors",
    source: "daily_resilience",
    dayKey: "day",
    series: [
      { key: "contributors.sleep_recovery", label: "Sleep recovery", color: "#7c9cff" },
      { key: "contributors.daytime_recovery", label: "Daytime recovery", color: "#5ee1a2" },
      { key: "contributors.stress", label: "Stress", color: "#ff7b7b" },
    ],
  },
  {
    id: "chart-heartrate",
    title: "Heart rate",
    source: "__timeseries.heartrate",
    dayKey: "timestamp",
    series: [{ key: "bpm", label: "BPM", color: "#ff7b7b" }],
    timeSeries: true,
  },
  {
    id: "chart-battery",
    title: "Ring battery level",
    source: "__timeseries.ring_battery_level",
    dayKey: "timestamp",
    series: [{ key: "level", label: "Battery %", color: "#ffe066" }],
    timeSeries: true,
  },
];

const TABLE_DEFS = [
  { id: "profile", title: "Personal info", subtitle: "Account profile from Oura", type: "object" },
  {
    id: "ring_configuration",
    title: "Ring configuration",
    subtitle: "Hardware and firmware details",
    source: "ring_configuration",
  },
  {
    id: "sleep",
    title: "Sleep sessions",
    subtitle: "Detailed nightly sleep records",
    source: "sleep",
    sortKey: "day",
  },
  {
    id: "daily_sleep",
    title: "Daily sleep summaries",
    subtitle: "Sleep score contributors by day",
    source: "daily_sleep",
    sortKey: "day",
  },
  {
    id: "daily_readiness",
    title: "Daily readiness",
    subtitle: "Readiness score and contributors",
    source: "daily_readiness",
    sortKey: "day",
  },
  {
    id: "daily_activity",
    title: "Daily activity",
    subtitle: "Steps, calories, MET, and activity breakdown",
    source: "daily_activity",
    sortKey: "day",
  },
  {
    id: "daily_stress",
    title: "Daily stress",
    subtitle: "Stress and recovery minutes",
    source: "daily_stress",
    sortKey: "day",
  },
  {
    id: "daily_resilience",
    title: "Daily resilience",
    subtitle: "Resilience level and contributors",
    source: "daily_resilience",
    sortKey: "day",
  },
  {
    id: "daily_spo2",
    title: "Daily SpO2",
    subtitle: "Overnight blood oxygen averages",
    source: "daily_spo2",
    sortKey: "day",
  },
  {
    id: "daily_cardiovascular_age",
    title: "Daily cardiovascular age",
    subtitle: "Vascular age and pulse wave velocity",
    source: "daily_cardiovascular_age",
    sortKey: "day",
  },
  {
    id: "vO2_max",
    title: "VO2 max",
    subtitle: "Cardio fitness estimates",
    source: "vO2_max",
    sortKey: "day",
  },
  {
    id: "sleep_time",
    title: "Sleep time recommendations",
    subtitle: "Bedtime guidance and status",
    source: "sleep_time",
    sortKey: "day",
  },
  {
    id: "workout",
    title: "Workouts",
    subtitle: "Auto-detected and manual workouts",
    source: "workout",
    sortKey: "day",
  },
  {
    id: "session",
    title: "Sessions",
    subtitle: "Breathing, meditation, and other sessions",
    source: "session",
    sortKey: "day",
  },
  {
    id: "tag",
    title: "Tags",
    subtitle: "User-entered tags",
    source: "tag",
    sortKey: "day",
  },
  {
    id: "enhanced_tag",
    title: "Enhanced tags",
    subtitle: "Structured tags with types and comments",
    source: "enhanced_tag",
    sortKey: "start_day",
  },
  {
    id: "rest_mode_period",
    title: "Rest mode periods",
    subtitle: "Rest mode episodes",
    source: "rest_mode_period",
    sortKey: "start_day",
  },
  {
    id: "heartrate",
    title: "Heart rate samples",
    subtitle: "Time-series BPM readings",
    source: "__timeseries.heartrate",
    sortKey: "timestamp",
  },
  {
    id: "ring_battery_level",
    title: "Ring battery samples",
    subtitle: "Battery level over time",
    source: "__timeseries.ring_battery_level",
    sortKey: "timestamp",
  },
];

const STAT_DEFS = [
  { label: "Sleep score", source: "daily_sleep", key: "score", dayKey: "day" },
  { label: "Readiness", source: "daily_readiness", key: "score", dayKey: "day" },
  { label: "Activity", source: "daily_activity", key: "score", dayKey: "day" },
  { label: "Steps", source: "daily_activity", key: "steps", dayKey: "day" },
  { label: "SpO2 avg", source: "daily_spo2", key: "spo2_percentage.average", dayKey: "day", alertKey: "spo2" },
  { label: "VO2 max", source: "vO2_max", key: "vo2_max", dayKey: "day" },
  { label: "Vascular age", source: "daily_cardiovascular_age", key: "vascular_age", dayKey: "day" },
  { label: "Stress high", source: "daily_stress", key: "stress_high", dayKey: "day", suffix: " min" },
  { label: "Resilience", source: "daily_resilience", key: "level", dayKey: "day" },
  { label: "Resting HR", getItems: (payload) => getRestingHrSeries(payload), key: "average_heart_rate", dayKey: "day", suffix: " bpm" },
  { label: "Latest HR", source: "__timeseries.heartrate", key: "bpm", dayKey: "timestamp", suffix: " bpm", alertKey: "heartrate", alwaysLatest: true },
  { label: "Avg HRV", source: "sleep", key: "average_hrv", dayKey: "day" },
  { label: "Battery", source: "__timeseries.ring_battery_level", key: "level", dayKey: "timestamp", suffix: "%", alwaysLatest: true, alertKey: "battery" },
];

function showBanner(message, isError = true) {
  els.banner.hidden = false;
  els.banner.textContent = message;
  els.banner.style.background = isError
    ? "rgba(255, 123, 123, 0.12)"
    : "rgba(94, 225, 162, 0.12)";
  els.banner.style.borderColor = isError
    ? "rgba(255, 123, 123, 0.35)"
    : "rgba(94, 225, 162, 0.35)";
  els.banner.style.color = isError ? "#ffd5d5" : "#d7ffe9";
}

function hideBanner() {
  els.banner.hidden = true;
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getPath(obj, path) {
  return path.split(".").reduce((acc, part) => (acc == null ? undefined : acc[part]), obj);
}

function resolveSource(payload, source) {
  if (source === "__timeseries.heartrate") return payload.timeseries?.heartrate ?? [];
  if (source === "__timeseries.ring_battery_level") return payload.timeseries?.ring_battery_level ?? [];
  return payload.metrics?.[source] ?? [];
}

function latestItem(items, dayKey = "day") {
  if (!items?.length) return null;
  return [...items].sort((a, b) => String(getPath(b, dayKey)).localeCompare(String(getPath(a, dayKey))))[0];
}

function pickStatItem(items, dayKey, payload, { alwaysLatest = false } = {}) {
  if (!items?.length) return null;

  if (alwaysLatest) {
    return latestItem(items, dayKey);
  }

  const rangeDays = payload.range?.days ?? 7;
  const endDate = payload.range?.end_date;
  if (rangeDays === 1 && endDate) {
    const todayItems = items.filter(
      (item) => String(getPath(item, dayKey)).slice(0, 10) === endDate
    );
    if (todayItems.length) return latestItem(todayItems, dayKey);
    return latestItem(items, dayKey);
  }

  return latestItem(items, dayKey);
}

function statMeta(item, dayKey, payload) {
  if (!item) return "No data";
  const when = getPath(item, dayKey);
  const formatted = formatDate(when);
  const rangeDays = payload.range?.days ?? 7;
  const endDate = payload.range?.end_date;
  if (rangeDays === 1 && endDate && String(when).slice(0, 10) !== endDate) {
    return `${formatted} · today not synced yet`;
  }
  return formatted;
}

function aggregateSleepByDay(sleepSessions) {
  const byDay = new Map();
  for (const session of sleepSessions) {
    if (!session.day) continue;
    if (!byDay.has(session.day)) {
      byDay.set(session.day, { heartRates: [], hrvs: [] });
    }
    const bucket = byDay.get(session.day);
    if (typeof session.average_heart_rate === "number") {
      bucket.heartRates.push(session.average_heart_rate);
    }
    if (typeof session.average_hrv === "number") {
      bucket.hrvs.push(session.average_hrv);
    }
  }

  return [...byDay.entries()]
    .map(([day, bucket]) => ({
      day,
      average_heart_rate: average(bucket.heartRates),
      average_hrv: average(bucket.hrvs),
    }))
    .filter((row) => row.average_heart_rate != null || row.average_hrv != null);
}

const RESTING_HR_SOURCES = new Set(["sleep", "rest"]);

function aggregateRestingHrFromTimeseries(samples) {
  const byDay = new Map();
  let usedRestingSources = false;

  for (const sample of samples) {
    if (!sample?.timestamp || typeof sample.bpm !== "number") continue;
    const day = sample.timestamp.slice(0, 10);
    if (!RESTING_HR_SOURCES.has(sample.source)) continue;
    usedRestingSources = true;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(sample.bpm);
  }

  if (!usedRestingSources) {
    for (const sample of samples) {
      if (!sample?.timestamp || typeof sample.bpm !== "number") continue;
      const day = sample.timestamp.slice(0, 10);
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(sample.bpm);
    }
  }

  return [...byDay.entries()]
    .map(([day, bpms]) => ({
      day,
      average_heart_rate: usedRestingSources ? average(bpms) : Math.min(...bpms),
    }))
    .filter((row) => row.average_heart_rate != null);
}

function filterItemsForRange(items, dayKey, payload) {
  if (!items?.length) return [];
  const start = payload.range?.start_date;
  const end = payload.range?.end_date;
  const rangeDays = payload.range?.days ?? 7;
  if (!start || !end) return items;

  const inRange = items.filter((item) => {
    const value = String(getPath(item, dayKey)).slice(0, 10);
    return value >= start && value <= end;
  });

  if (rangeDays === 1 && !inRange.length) {
    const latest = latestItem(items, dayKey);
    return latest ? [latest] : [];
  }

  return inRange;
}

function getRestingHrSeries(payload) {
  const fromSleep = aggregateSleepByDay(payload.metrics?.sleep ?? []);
  if (fromSleep.some((row) => row.average_heart_rate != null)) {
    return fromSleep.filter((row) => row.average_heart_rate != null);
  }
  return aggregateRestingHrFromTimeseries(payload.timeseries?.heartrate ?? []);
}

function average(values) {
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function compareHalves(items, dayKey, valueKey, lowerIsBetter = false) {
  const sorted = [...items]
    .filter((item) => typeof getPath(item, valueKey) === "number")
    .sort((a, b) => String(getPath(a, dayKey)).localeCompare(String(getPath(b, dayKey))));

  if (sorted.length < 4) {
    return { status: "insufficient", count: sorted.length };
  }

  const mid = Math.floor(sorted.length / 2);
  const early = sorted.slice(0, mid);
  const recent = sorted.slice(mid);
  const earlyAvg = average(early.map((item) => getPath(item, valueKey)));
  const recentAvg = average(recent.map((item) => getPath(item, valueKey)));
  const delta = Math.round((recentAvg - earlyAvg) * 10) / 10;
  const improved = lowerIsBetter ? delta < 0 : delta > 0;
  const flat = delta === 0;

  return {
    status: "ok",
    count: sorted.length,
    earlyAvg,
    recentAvg,
    delta,
    improved: flat ? null : improved,
    earlyFrom: getPath(early[0], dayKey),
    earlyTo: getPath(early.at(-1), dayKey),
    recentFrom: getPath(recent[0], dayKey),
    recentTo: getPath(recent.at(-1), dayKey),
  };
}

function smoothSeries(items, dayKey, valueKey, rangeDays) {
  const sorted = [...items]
    .filter((item) => typeof getPath(item, valueKey) === "number")
    .sort((a, b) => String(getPath(a, dayKey)).localeCompare(String(getPath(b, dayKey))));

  if (rangeDays <= 60 || sorted.length <= 60) {
    return sorted.map((item) => ({
      label: formatDate(getPath(item, dayKey)),
      value: getPath(item, valueKey),
    }));
  }

  const buckets = new Map();
  for (const item of sorted) {
    const day = getPath(item, dayKey);
    const date = new Date(day);
    if (Number.isNaN(date.getTime())) continue;
    date.setDate(date.getDate() - date.getDay());
    const weekKey = date.toISOString().slice(0, 10);
    if (!buckets.has(weekKey)) buckets.set(weekKey, []);
    buckets.get(weekKey).push(getPath(item, valueKey));
  }

  return [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([week, values]) => ({
      label: formatDate(week),
      value: average(values),
    }));
}

function trendBadge(comparison) {
  if (comparison.status !== "ok" || comparison.improved == null) {
    return `<span class="trend-badge flat">Stable</span>`;
  }
  if (comparison.improved) {
    return `<span class="trend-badge up">Improving</span>`;
  }
  return `<span class="trend-badge down">Declining</span>`;
}

function formatDelta(delta, unit, lowerIsBetter, improved) {
  const sign = delta > 0 ? "+" : "";
  const suffix = unit ? ` ${unit}` : "";
  return `${sign}${delta}${suffix}`;
}

function flattenObject(obj, prefix = "") {
  const out = {};
  for (const [key, value] of Object.entries(obj ?? {})) {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (value != null && typeof value === "object" && !Array.isArray(value)) {
      if ("items" in value && "interval" in value) {
        out[nextKey] = `[series: ${value.items?.length ?? 0} samples]`;
      } else {
        Object.assign(out, flattenObject(value, nextKey));
      }
    } else if (Array.isArray(value)) {
      out[nextKey] = value.join(", ");
    } else {
      out[nextKey] = value;
    }
  }
  return out;
}

function formatCell(value) {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return Number.isInteger(value) ? value : value.toFixed(2);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.includes("T") ? formatDateTime(value) : formatDate(value);
  }
  return String(value);
}

function destroyChart(id) {
  if (charts[id]) {
    charts[id].destroy();
    delete charts[id];
  }
}

function buildLineChart(canvasId, labels, datasets, options = {}) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  charts[canvasId] = new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "#9aa7c7" } } },
      scales: {
        x: {
          ticks: { color: "#9aa7c7", maxTicksLimit: 8 },
          grid: { color: "rgba(255,255,255,0.05)" },
        },
        y: {
          beginAtZero: options.beginAtZero ?? false,
          suggestedMax: options.suggestedMax,
          ticks: { color: "#9aa7c7" },
          grid: { color: "rgba(255,255,255,0.05)" },
        },
      },
    },
  });
}

function renderSectionNav() {
  const links = [
    { href: "#overview", label: "Overview" },
    { href: "#recovery", label: "Recovery trends" },
    { href: "#charts", label: "Charts" },
    ...TABLE_DEFS.map((table) => ({
      href: `#table-${table.id}`,
      label: table.title,
    })),
  ];

  els.sectionNav.innerHTML = links
    .map((link) => `<a class="section-link" href="${link.href}">${link.label}</a>`)
    .join("");
}

function renderStats(payload) {
  const alerts = payload.alerts ?? {};

  const cards = STAT_DEFS.map((stat) => {
    const items = stat.getItems ? stat.getItems(payload) : resolveSource(payload, stat.source);
    const latest = pickStatItem(items, stat.dayKey, payload, {
      alwaysLatest: Boolean(stat.alwaysLatest),
    });
    const value = latest ? getPath(latest, stat.key) : null;
    const alertInfo = stat.alertKey ? alerts[stat.alertKey] : null;
    let meta = statMeta(latest, stat.dayKey, payload);
    const criticalLow = Boolean(alertInfo?.critical_low);
    if (criticalLow && alertInfo?.critical_threshold != null) {
      meta = `${meta} · below ${alertInfo.critical_threshold} bpm`;
    } else if (alertInfo?.alert && stat.alertKey === "battery" && alertInfo.threshold != null) {
      meta = `${meta} · at or below ${alertInfo.threshold}%`;
    } else if (alertInfo?.alert && alertInfo.average_7d != null && alertInfo.threshold != null) {
      meta = `${meta} · below 7-day avg (${alertInfo.average_7d}, alert < ${alertInfo.threshold})`;
    }
    let alertClass = "";
    if (criticalLow) {
      alertClass = " alert-red";
    } else if (alertInfo?.alert) {
      alertClass = " alert-yellow";
    }
    return {
      label: stat.label,
      value: value != null ? `${value}${stat.suffix ?? ""}` : "—",
      meta,
      alertClass,
    };
  });

  if (payload.personal_info) {
    cards.unshift({
      label: "Profile",
      value: payload.personal_info.age ?? "—",
      meta: [
        payload.personal_info.biological_sex,
        payload.personal_info.height ? `${payload.personal_info.height} cm` : null,
        payload.personal_info.weight ? `${payload.personal_info.weight} kg` : null,
      ]
        .filter(Boolean)
        .join(" · ") || payload.personal_info.email || "Connected",
    });
  }

  els.statsGrid.innerHTML = cards
    .map(
      (card) => `
        <article class="stat-card${card.alertClass ?? ""}">
          <div class="stat-label">${card.label}</div>
          <div class="stat-value">${card.value}</div>
          <div class="stat-meta">${card.meta}</div>
        </article>
      `
    )
    .join("");
}

function renderRecoveryTrends(payload) {
  const rangeDays = payload.range?.days ?? 7;
  const comparisons = RECOVERY_METRICS.map((metric) => ({
    metric,
    comparison: compareHalves(
      metric.getSeries(payload),
      "day",
      metric.key,
      metric.lowerIsBetter
    ),
  }));

  const improvedCount = comparisons.filter(
    (entry) => entry.comparison.status === "ok" && entry.comparison.improved === true
  ).length;
  const decliningCount = comparisons.filter(
    (entry) => entry.comparison.status === "ok" && entry.comparison.improved === false
  ).length;

  let summaryText =
    "Compares the first half of your selected range with the second half. Wellness metrics only — not a clinical assessment.";
  if (improvedCount >= decliningCount && improvedCount > 0) {
    summaryText = `${improvedCount} of ${comparisons.length} recovery signals are trending better over this period. ${summaryText}`;
  } else if (decliningCount > improvedCount) {
    summaryText = `${decliningCount} of ${comparisons.length} signals dipped in the recent half — worth discussing with your care team if concerned. ${summaryText}`;
  }

  els.recoverySection.innerHTML = `
    <div class="section-heading" id="recovery">
      <h2>Recovery trends</h2>
      <p>${summaryText}</p>
    </div>
    <div class="recovery-summary-grid">
      ${comparisons
        .map(({ metric, comparison }) => {
          if (comparison.status !== "ok") {
            return `
              <article class="recovery-card">
                <div class="recovery-card-head">
                  <h3>${metric.label}</h3>
                  <span class="trend-badge flat">Not enough data</span>
                </div>
                <p class="empty-note">Need more nights/days in this range.</p>
              </article>
            `;
          }

          return `
            <article class="recovery-card">
              <div class="recovery-card-head">
                <h3>${metric.label}</h3>
                ${trendBadge(comparison)}
              </div>
              <div class="recovery-values">
                <div>
                  <span>Earlier avg</span>
                  <strong>${comparison.earlyAvg}${metric.unit ? ` ${metric.unit}` : ""}</strong>
                  <small>${formatDate(comparison.earlyFrom)} – ${formatDate(comparison.earlyTo)}</small>
                </div>
                <div>
                  <span>Recent avg</span>
                  <strong>${comparison.recentAvg}${metric.unit ? ` ${metric.unit}` : ""}</strong>
                  <small>${formatDate(comparison.recentFrom)} – ${formatDate(comparison.recentTo)}</small>
                </div>
              </div>
              <p class="recovery-delta ${
                comparison.improved === true
                  ? "positive"
                  : comparison.improved === false
                    ? "negative"
                    : "neutral"
              }">
                Change: ${formatDelta(comparison.delta, metric.unit, metric.lowerIsBetter, comparison.improved)}
              </p>
              ${metric.note ? `<p class="recovery-note">${metric.note}</p>` : ""}
            </article>
          `;
        })
        .join("")}
    </div>
    <div class="recovery-charts charts-grid"></div>
  `;

  const chartsHost = els.recoverySection.querySelector(".recovery-charts");
  const bucketLabel = rangeDays > 60 ? "Weekly averages" : "Daily values";

  for (const metric of RECOVERY_METRICS) {
    const series = metric.getSeries(payload);
    const points = smoothSeries(series, "day", metric.key, rangeDays);
    const panel = document.createElement("article");
    panel.className = "panel chart-panel";
    panel.innerHTML = `
      <div class="panel-head">
        <h3>${metric.label}</h3>
        <p>${bucketLabel}</p>
      </div>
      <canvas id="chart-${metric.id}"></canvas>
    `;
    chartsHost.appendChild(panel);

    if (!points.length) {
      panel.querySelector(".panel-head").insertAdjacentHTML(
        "beforeend",
        `<p class="empty-note">No data available.</p>`
      );
      continue;
    }

    buildLineChart(
      `chart-${metric.id}`,
      points.map((point) => point.label),
      [
        {
          label: metric.label,
          data: points.map((point) => point.value),
          borderColor: metric.color,
          backgroundColor: `${metric.color}22`,
          tension: 0.35,
          fill: true,
          pointRadius: points.length > 90 ? 0 : 2,
        },
      ],
      {
        beginAtZero: false,
        suggestedMax: metric.key === "score" ? 100 : undefined,
      }
    );
  }
}

function renderCharts(payload) {
  const timeseriesDays = payload.range?.timeseries_days ?? payload.range?.days;
  const timeseriesNote =
    payload.range?.days > timeseriesDays
      ? `Last ${timeseriesDays} days (time-series limited for longer ranges)`
      : null;

  els.chartsSection.innerHTML = `<div class="section-heading" id="charts"><h2>Charts</h2><p>Trends across your selected date range</p></div>`;

  for (const chart of CHART_DEFS) {
    const panel = document.createElement("article");
    panel.className = `panel chart-panel${chart.timeSeries ? " wide" : ""}`;
    const subtitle =
      chart.timeSeries && timeseriesNote ? `<p>${timeseriesNote}</p>` : "";
    panel.innerHTML = `
      <div class="panel-head">
        <h3>${chart.title}</h3>
        ${subtitle}
      </div>
      <canvas id="${chart.id}"></canvas>
    `;
    els.chartsSection.appendChild(panel);

    const items = filterItemsForRange(resolveSource(payload, chart.source), chart.dayKey, payload);
    const sorted = [...items].sort((a, b) =>
      String(getPath(a, chart.dayKey)).localeCompare(String(getPath(b, chart.dayKey)))
    );
    const plotted =
      chart.timeSeries && sorted.length > 250
        ? sorted.filter((_, index) => index % Math.ceil(sorted.length / 250) === 0)
        : sorted;

    if (!plotted.length) {
      panel.querySelector(".panel-head").insertAdjacentHTML(
        "beforeend",
        `<p class="empty-note">No data available for this metric.</p>`
      );
      continue;
    }

    const labels = plotted.map((item) =>
      chart.timeSeries ? formatDateTime(getPath(item, chart.dayKey)) : formatDate(getPath(item, chart.dayKey))
    );

    const datasets = chart.series.map((series, index) => ({
      label: series.label,
      data: plotted.map((item) => getPath(item, series.key)),
      borderColor: series.color,
      backgroundColor: `${series.color}22`,
      tension: 0.3,
      fill: chart.series.length === 1,
      pointRadius: chart.timeSeries ? 0 : 3,
    }));

    buildLineChart(chart.id, labels, datasets, {
      beginAtZero: chart.id === "chart-battery",
      suggestedMax: chart.id.includes("score") ? 100 : undefined,
    });
  }
}

function renderTableSection(tableDef, rows, error) {
  const section = document.createElement("section");
  section.className = "panel table-section";
  section.id = `table-${tableDef.id}`;

  section.innerHTML = `
    <div class="panel-head">
      <h2>${tableDef.title}</h2>
      <p>${tableDef.subtitle}</p>
    </div>
  `;

  if (error) {
    section.insertAdjacentHTML(
      "beforeend",
      `<p class="empty-note error-note">Unavailable: ${error}</p>`
    );
    return section;
  }

  if (tableDef.type === "object") {
    const profile = rows;
    if (!profile) {
      section.insertAdjacentHTML("beforeend", `<p class="empty-note">No profile data.</p>`);
      return section;
    }
    const flat = flattenObject(profile);
    section.insertAdjacentHTML(
      "beforeend",
      `<div class="kv-grid">${Object.entries(flat)
        .map(([key, value]) => `<div class="kv-row"><span>${key}</span><strong>${formatCell(value)}</strong></div>`)
        .join("")}</div>`
    );
    return section;
  }

  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    section.insertAdjacentHTML("beforeend", `<p class="empty-note">No records in this range.</p>`);
    return section;
  }

  const sorted = tableDef.sortKey
    ? [...list].sort((a, b) => String(getPath(b, tableDef.sortKey)).localeCompare(String(getPath(a, tableDef.sortKey))))
    : list;

  const flattenedRows = sorted.map((row) => flattenObject(row));
  const columns = [...new Set(flattenedRows.flatMap((row) => Object.keys(row)))];

  section.insertAdjacentHTML(
    "beforeend",
    `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>${columns.map((column) => `<th>${column}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${flattenedRows
              .map(
                (row) =>
                  `<tr>${columns.map((column) => `<td>${formatCell(row[column])}</td>`).join("")}</tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `
  );

  return section;
}

function renderTables(payload) {
  els.tablesSection.innerHTML = `<div class="section-heading" id="overview"><h2>All metrics</h2><p>Every Oura API data type for the selected range</p></div>`;

  for (const tableDef of TABLE_DEFS) {
    let rows;
    let error;

    if (tableDef.type === "object") {
      rows = payload.personal_info;
      error = payload.errors?.personal_info;
    } else if (tableDef.source?.startsWith("__timeseries.")) {
      rows = resolveSource(payload, tableDef.source);
      error = payload.errors?.[tableDef.source.replace("__timeseries.", "")];
    } else if (tableDef.source === "ring_configuration") {
      rows = payload.ring_configuration;
      error = payload.errors?.ring_configuration;
    } else {
      rows = payload.metrics?.[tableDef.source] ?? [];
      error = payload.errors?.[tableDef.source];
    }

    if (tableDef.sortKey) {
      rows = filterItemsForRange(Array.isArray(rows) ? rows : [], tableDef.sortKey, payload);
    }

    els.tablesSection.appendChild(renderTableSection(tableDef, rows, error));
  }

  const errorEntries = Object.entries(payload.errors ?? {});
  if (errorEntries.length) {
    const errorPanel = document.createElement("section");
    errorPanel.className = "panel";
    errorPanel.innerHTML = `
      <div class="panel-head">
        <h2>Why some metrics are missing</h2>
        <p>
          Oura splits data into permission groups. If you connected before an update,
          click <strong>Disconnect</strong> then <strong>Connect Oura</strong> again and approve all permissions.
          Some metrics also require a Gen 3/4 ring, Oura membership, or simply having no data yet.
        </p>
      </div>
      <ul class="error-list">
        ${errorEntries
          .map(
            ([key, message]) =>
              `<li><code>${key}</code>: ${message}</li>`
          )
          .join("")}
      </ul>
    `;
    els.tablesSection.appendChild(errorPanel);
  }
}

function stopAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

function startAutoRefresh() {
  stopAutoRefresh();
  refreshTimer = setInterval(() => {
    loadDashboard().catch((error) => showBanner(error.message));
  }, REFRESH_INTERVAL_MS);
}

function setConnected(connected) {
  els.connectPanel.hidden = connected;
  els.dashboard.hidden = !connected;
  els.connectBtn.hidden = connected;
  els.logoutBtn.hidden = !connected;
  els.refreshBtn.hidden = !connected;

  if (connected) {
    startAutoRefresh();
  } else {
    stopAutoRefresh();
  }
}

async function loadDashboard() {
  if (dashboardLoading) return;
  dashboardLoading = true;

  try {
    hideBanner();
    Object.keys(charts).forEach(destroyChart);

    const days = Number(els.rangeDays.value);
    const response = await fetch(`/api/dashboard?days=${days}`);
    const payload = await response.json();

    if (response.status === 401 || payload.error === "Not connected to Oura") {
      setConnected(false);
      return;
    }

    if (payload.error) {
      showBanner(payload.error);
      return;
    }

    setConnected(true);
    renderSectionNav();
    renderStats(payload);
    renderRecoveryTrends(payload);
    renderCharts(payload);
    renderTables(payload);
  } finally {
    dashboardLoading = false;
  }
}

els.refreshBtn.addEventListener("click", () => {
  loadDashboard().catch((error) => showBanner(error.message));
});

els.rangeDays.addEventListener("change", () => {
  loadDashboard().catch((error) => showBanner(error.message));
});

els.logoutBtn.addEventListener("click", async () => {
  stopAutoRefresh();
  await fetch("/auth/logout", { method: "POST" });
  setConnected(false);
  showBanner("Disconnected from Oura.", false);
});

const params = new URLSearchParams(window.location.search);
if (params.get("connected") === "1") {
  showBanner("Connected to Oura successfully.", false);
  window.history.replaceState({}, "", "/");
}
if (params.get("error")) {
  showBanner(params.get("error"));
  window.history.replaceState({}, "", "/");
}

loadDashboard().catch((error) => showBanner(error.message));
