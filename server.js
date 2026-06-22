import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import express from "express";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_FILE = path.join(__dirname, ".tokens.json");
const OURA_AUTH_URL = "https://cloud.ouraring.com/oauth/authorize";
const OURA_TOKEN_URL = "https://api.ouraring.com/oauth/token";
const OURA_API_BASE = "https://api.ouraring.com/v2/usercollection";
const SCOPES = [
  "email",
  "personal",
  "daily",
  "heartrate",
  "workout",
  "tag",
  "session",
  "spo2",
  "stress",
  "heart_health",
  "ring_configuration",
].join(" ");

const SCOPE_HINTS = {
  daily_spo2: "spo2",
  vO2_max: "heart_health",
  daily_cardiovascular_age: "heart_health",
  daily_resilience: "stress",
  ring_configuration: "ring_configuration",
  ring_battery_level: "ring_configuration",
  heartrate: "heartrate",
};

const DATE_RANGE_ENDPOINTS = [
  "daily_activity",
  "daily_cardiovascular_age",
  "daily_readiness",
  "daily_resilience",
  "daily_sleep",
  "daily_spo2",
  "daily_stress",
  "enhanced_tag",
  "rest_mode_period",
  "session",
  "sleep",
  "sleep_time",
  "tag",
  "vO2_max",
  "workout",
];

const {
  OURA_CLIENT_ID,
  OURA_CLIENT_SECRET,
  OURA_REDIRECT_URI = "http://localhost:3000/auth/callback",
  PORT = "3000",
} = process.env;

if (!OURA_CLIENT_ID || !OURA_CLIENT_SECRET) {
  console.error(
    "Missing OURA_CLIENT_ID or OURA_CLIENT_SECRET. Copy .env.example to .env and fill in your Oura app credentials."
  );
  process.exit(1);
}

const app = express();
const oauthStates = new Map();

async function readTokens() {
  try {
    const raw = await fs.readFile(TOKEN_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeTokens(tokens) {
  await fs.writeFile(TOKEN_FILE, JSON.stringify(tokens, null, 2), "utf8");
}

async function clearTokens() {
  try {
    await fs.unlink(TOKEN_FILE);
  } catch {
    // no tokens yet
  }
}

function isExpired(tokens) {
  if (!tokens?.expires_at) return true;
  return Date.now() >= tokens.expires_at - 60_000;
}

async function refreshAccessToken(tokens) {
  if (!tokens?.refresh_token) {
    throw new Error("No refresh token available. Please sign in again.");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokens.refresh_token,
    client_id: OURA_CLIENT_ID,
    client_secret: OURA_CLIENT_SECRET,
  });

  const response = await fetch(OURA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || "Token refresh failed");
  }

  const updated = {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token ?? tokens.refresh_token,
    expires_at: Date.now() + payload.expires_in * 1000,
  };

  await writeTokens(updated);
  return updated;
}

async function getValidTokens() {
  let tokens = await readTokens();
  if (!tokens?.access_token) return null;
  if (isExpired(tokens)) {
    tokens = await refreshAccessToken(tokens);
  }
  return tokens;
}

async function ouraFetch(endpoint, searchParams = {}) {
  const tokens = await getValidTokens();
  if (!tokens) {
    const error = new Error("Not connected to Oura");
    error.status = 401;
    throw error;
  }

  const url = new URL(`${OURA_API_BASE}/${endpoint}`);
  for (const [key, value] of Object.entries(searchParams)) {
    if (value != null && value !== "") {
      url.searchParams.set(key, value);
    }
  }

  let response = await fetch(url, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (response.status === 401) {
    const refreshed = await refreshAccessToken(tokens);
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${refreshed.access_token}` },
    });
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      payload.detail ||
      payload.title ||
      payload.message ||
      `Oura API error (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return payload;
}

async function safeOuraFetch(endpoint, searchParams = {}) {
  try {
    const payload = await ouraFetch(endpoint, searchParams);
    if (Array.isArray(payload.data)) {
      return { ok: true, data: payload.data, next_token: payload.next_token ?? null };
    }
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      return { ok: true, data: payload, next_token: null };
    }
    return { ok: true, data: [], next_token: null };
  } catch (error) {
    return { ok: false, data: [], error: error.message };
  }
}

async function safeOuraFetchAll(endpoint, searchParams = {}) {
  try {
    let allData = [];
    let nextToken = null;

    do {
      const params = { ...searchParams };
      if (nextToken) params.next_token = nextToken;

      const payload = await ouraFetch(endpoint, params);
      if (Array.isArray(payload.data)) {
        allData = allData.concat(payload.data);
        nextToken = payload.next_token ?? null;
      } else if (payload && typeof payload === "object") {
        return { ok: true, data: payload, next_token: null };
      } else {
        break;
      }
    } while (nextToken);

    return { ok: true, data: allData, next_token: null };
  } catch (error) {
    const hint = SCOPE_HINTS[endpoint];
    let message = error.message;
    if (/30 days/i.test(message)) {
      message = "Heart rate API allows max 30 days per request (handled automatically after server restart).";
    } else if (hint && /scope|authorized/i.test(message)) {
      message = `Missing "${hint}" permission — disconnect and reconnect Oura to grant it.`;
    }
    return { ok: false, data: [], error: message };
  }
}

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toLocalISO(date) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const offset = `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offset}`;
}

function dateRange(days = 7) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));
  return {
    start_date: formatLocalDate(start),
    end_date: formatLocalDate(end),
  };
}

function datetimeRange(days = 7) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);
  return {
    start_datetime: toLocalISO(start),
    end_datetime: toLocalISO(end),
  };
}

const ALERT_DROP_POINTS = 10;
const ALERT_WINDOW_DAYS = 7;

function averageNumbers(values) {
  const nums = values.filter((value) => typeof value === "number" && Number.isFinite(value));
  if (!nums.length) return null;
  return Math.round((nums.reduce((sum, value) => sum + value, 0) / nums.length) * 10) / 10;
}

function spo2Average(row) {
  return row?.spo2_percentage?.average ?? null;
}

function computeAlerts(metrics, heartrateSamples) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - ALERT_WINDOW_DAYS);
  cutoff.setHours(0, 0, 0, 0);
  const windowStartDate = formatLocalDate(cutoff);

  const hrSamples = (heartrateSamples ?? [])
    .filter(
      (sample) =>
        typeof sample.bpm === "number" &&
        sample.timestamp &&
        new Date(sample.timestamp) >= cutoff
    )
    .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));

  const latestHr = hrSamples.length ? hrSamples[hrSamples.length - 1].bpm : null;
  const avgHr = averageNumbers(hrSamples.map((sample) => sample.bpm));
  const heartrateAlert =
    latestHr != null && avgHr != null && latestHr < avgHr - ALERT_DROP_POINTS;

  const spo2Rows = (metrics?.daily_spo2 ?? [])
    .filter((row) => row.day && typeof spo2Average(row) === "number")
    .filter((row) => row.day >= windowStartDate)
    .sort((a, b) => String(a.day).localeCompare(String(b.day)));

  const latestSpo2 = spo2Rows.length ? spo2Average(spo2Rows[spo2Rows.length - 1]) : null;
  const avgSpo2 = averageNumbers(spo2Rows.map(spo2Average));
  const spo2Alert =
    latestSpo2 != null && avgSpo2 != null && latestSpo2 < avgSpo2 - ALERT_DROP_POINTS;

  return {
    heartrate: {
      latest: latestHr,
      average_7d: avgHr,
      alert: heartrateAlert,
      threshold: avgHr != null ? avgHr - ALERT_DROP_POINTS : null,
    },
    spo2: {
      latest: latestSpo2,
      average_7d: avgSpo2,
      alert: spo2Alert,
      threshold: avgSpo2 != null ? avgSpo2 - ALERT_DROP_POINTS : null,
    },
    ring_color: heartrateAlert || spo2Alert ? "yellow" : "green",
  };
}

async function fetchAlertInputs() {
  const fetchRange = dateRange(ALERT_WINDOW_DAYS);
  const alertTimes = datetimeRange(ALERT_WINDOW_DAYS);
  const [dailySpo2, heartrate] = await Promise.all([
    safeOuraFetchAll("daily_spo2", fetchRange),
    safeOuraFetchAll("heartrate", alertTimes),
  ]);

  return computeAlerts(
    { daily_spo2: dailySpo2.ok ? dailySpo2.data : [] },
    heartrate.ok ? heartrate.data : []
  );
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/status", async (_req, res) => {
  try {
    const tokens = await getValidTokens();
    if (!tokens) {
      return res.json({ connected: false });
    }

    const profile = await ouraFetch("personal_info");
    res.json({
      connected: true,
      profile: profile.data ?? profile,
    });
  } catch (error) {
    res.status(error.status || 500).json({
      connected: false,
      error: error.message,
    });
  }
});

app.get("/auth/login", (_req, res) => {
  const state = crypto.randomBytes(16).toString("hex");
  oauthStates.set(state, Date.now());

  const params = new URLSearchParams({
    client_id: OURA_CLIENT_ID,
    redirect_uri: OURA_REDIRECT_URI,
    response_type: "code",
    scope: SCOPES,
    state,
  });

  res.redirect(`${OURA_AUTH_URL}?${params}`);
});

app.get("/auth/callback", async (req, res) => {
  const { code, state, error, error_description: errorDescription } = req.query;

  if (error) {
    return res.redirect(`/?error=${encodeURIComponent(errorDescription || error)}`);
  }

  if (!code || typeof code !== "string") {
    return res.redirect("/?error=Missing+authorization+code");
  }

  if (!state || typeof state !== "string" || !oauthStates.has(state)) {
    return res.redirect("/?error=Invalid+OAuth+state");
  }
  oauthStates.delete(state);

  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: OURA_REDIRECT_URI,
      client_id: OURA_CLIENT_ID,
      client_secret: OURA_CLIENT_SECRET,
    });

    const response = await fetch(OURA_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error_description || payload.error || "OAuth failed");
    }

    await writeTokens({
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
      expires_at: Date.now() + payload.expires_in * 1000,
    });

    res.redirect("/?connected=1");
  } catch (err) {
    res.redirect(`/?error=${encodeURIComponent(err.message)}`);
  }
});

app.post("/auth/logout", async (_req, res) => {
  await clearTokens();
  res.json({ ok: true });
});

app.get("/api/dashboard", async (req, res) => {
  try {
    const tokens = await getValidTokens();
    if (!tokens) {
      return res.status(401).json({ error: "Not connected to Oura" });
    }

    const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 730);
    const range = dateRange(days);
    const fetchDays = days === 1 ? 30 : days;
    const fetchRange = dateRange(fetchDays);
    const timeseriesDays = Math.min(days === 1 ? 2 : days, 30);
    const times = datetimeRange(timeseriesDays);
    const errors = {};

    const dateFetches = DATE_RANGE_ENDPOINTS.map(async (endpoint) => {
      const result = await safeOuraFetchAll(endpoint, fetchRange);
      if (!result.ok) errors[endpoint] = result.error;
      return [endpoint, result.ok ? result.data : []];
    });

    const [dateResults, personalInfo, ringConfiguration, heartrate, ringBattery] =
      await Promise.all([
        Promise.all(dateFetches),
        safeOuraFetch("personal_info"),
        safeOuraFetchAll("ring_configuration"),
        safeOuraFetchAll("heartrate", times),
        safeOuraFetchAll("ring_battery_level", times),
      ]);

    for (const [key, result] of [
      ["personal_info", personalInfo],
      ["ring_configuration", ringConfiguration],
      ["heartrate", heartrate],
      ["ring_battery_level", ringBattery],
    ]) {
      if (!result.ok) {
        errors[key] = result.error;
      }
    }

    const metrics = Object.fromEntries(dateResults);
    const alerts = await fetchAlertInputs();

    res.json({
      range: { ...range, days, timeseries_days: timeseriesDays },
      errors,
      alerts,
      personal_info: personalInfo.ok ? personalInfo.data : null,
      ring_configuration: ringConfiguration.ok ? ringConfiguration.data : [],
      timeseries: {
        heartrate: heartrate.ok ? heartrate.data : [],
        ring_battery_level: ringBattery.ok ? ringBattery.data : [],
      },
      metrics,
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.get("/api/ring-status", async (_req, res) => {
  try {
    const tokens = await getValidTokens();
    if (!tokens) {
      return res.json({ connected: false, ring_color: "green" });
    }

    const alerts = await fetchAlertInputs();
    res.json({ connected: true, ...alerts });
  } catch (error) {
    res.status(500).json({
      connected: false,
      ring_color: "green",
      error: error.message,
    });
  }
});

app.listen(Number(PORT), () => {
  console.log(`Med-Alert Board running at http://localhost:${PORT}`);
  console.log(`OAuth redirect URI: ${OURA_REDIRECT_URI}`);
});
