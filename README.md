# Med-Alert Board

Personal wellness dashboard for Oura Ring data, with an optional ESP32 NeoPixel status light for at-a-glance alerts.

**Not a medical device.** This is for personal insight only. Do not use it for diagnosis or emergency decisions.

> **Quick start:** See [QUICKSTART.md](QUICKSTART.md) for a one-page cheat sheet.  
> **GoDaddy hosting:** See [deploy/GODADDY.md](deploy/GODADDY.md) and upload `deploy/med-alert-board-godaddy.zip`.

---

## What it does

### Web dashboard (`http://localhost:3000`)

- Connects to your Oura account via OAuth 2.0
- Shows sleep, readiness, activity, heart rate, SpO₂, stress, resilience, VO₂ max, ring battery, and more
- Charts, recovery trends, and detailed tables
- Auto-refreshes every **60 seconds** while connected
- Date ranges: **Today** through **2 years**
- Color-coded stat cards when alert rules trigger (see [Alert logic](#alert-logic))

### NeoPixel status ring (optional hardware)

Polls `/api/ring-status` over Wi-Fi every **60 seconds**.

| Ring color | Meaning |
|------------|---------|
| **Green** | No alert |
| **Yellow** | Latest HR or SpO₂ is 10+ points below 7-day average |
| **Blue** | Oura ring battery at or below 25% |
| **Red (flashing)** | Latest heart rate below 40 bpm (0.5 s on/off) |

**Priority (highest first):** red → yellow → blue → green

---

## Project structure

```
oura/
├── server.js              # Express API + Oura OAuth + alerts
├── package.json
├── .env                   # Oura API credentials (not committed)
├── .tokens.json           # OAuth tokens (not committed)
├── public/
│   ├── index.html         # Dashboard page
│   ├── app.js             # Frontend logic, charts, alerts UI
│   └── styles.css
├── deploy/
│   ├── GODADDY.md         # GoDaddy Node.js hosting guide
│   └── med-alert-board-godaddy.zip
└── esp32-neopixel/        # PlatformIO firmware for XIAO ESP32-C6
    ├── src/main.cpp
    ├── config.h           # Wi-Fi + server host (not committed)
    ├── config.h.example
    └── platformio.ini
```

---

## Requirements

- **Node.js** 18–24
- **Oura developer app** at [cloud.ouraring.com](https://cloud.ouraring.com)
- **ESP32 (optional):** Seeed Studio XIAO ESP32-C6, Adafruit 16-LED NeoPixel ring, PlatformIO

---

## Local setup

### 1. Oura API application

1. Go to [Oura Cloud → API Applications](https://cloud.ouraring.com/oauth/applications).
2. Create an application.
3. Set redirect URI to: `http://localhost:3000/auth/callback`
4. Copy the **Client ID** and **Client Secret**.

For GoDaddy or other hosted deploys, add a second redirect URI for your public URL (see [deploy/GODADDY.md](deploy/GODADDY.md)).

### 2. Environment file

```bash
cp .env.example .env
```

Edit `.env` — see [.env.example](.env.example) for all options.

### 3. Install and run

```bash
npm install
npm start
```

Open **http://localhost:3000** and click **Connect Oura**. Approve all requested permissions.

For development with auto-restart on file changes:

```bash
npm run dev
```

### 4. Reconnect after scope updates

If metrics are missing after code updates, click **Disconnect** then **Connect Oura** again so new API scopes are granted.

**OAuth scopes used:** `email`, `personal`, `daily`, `heartrate`, `workout`, `tag`, `session`, `spo2`, `stress`, `heart_health`, `ring_configuration`

---

## Using the dashboard

| Feature | Details |
|--------|---------|
| **Range** | Today, 7 days, 14 days, 30 days, up to 2 years |
| **Refresh** | Manual button, or automatic every 60 seconds |
| **Overview** | Key stats: sleep, readiness, activity, steps, SpO₂, HR, battery, etc. |
| **Recovery trends** | Compares first vs second half of selected range |
| **Charts** | Scores and time-series (heart rate limited to last 30 days for long ranges) |
| **Tables** | Full Oura API records for each metric type |

### Today view

- Uses your **local timezone** for date boundaries.
- If Oura has not synced today’s activity yet, the dashboard shows the most recent available day with a “today not synced yet” note.

### Missing data

Some sections may be empty because:

- The ring was not worn or not synced
- That feature was not used (e.g. workouts, sessions)
- A permission was not granted (reconnect Oura)
- Oura has no data for that period

---

## Alert logic

Alerts use the latest Oura samples unless noted. Configurable via `.env` (defaults in parentheses).

### Dashboard card colors

| Card | Color | Rule |
|------|-------|------|
| **Latest HR** | Yellow | Latest BPM is more than **10** (`ALERT_DROP_POINTS`) below 7-day average |
| **Latest HR** | **Red** | Latest BPM is below **40** (`HR_CRITICAL_LOW_BPM`) — overrides yellow |
| **SpO₂ avg** | Yellow | Latest daily average is more than **10** below 7-day daily SpO₂ average |
| **Battery** | Yellow | Ring battery at or below **25%** (`BATTERY_LOW_PERCENT`) |

### NeoPixel ring (`ring_color`)

| `ring_color` | LED behavior |
|--------------|--------------|
| `green` | Solid green |
| `yellow` | Solid yellow (HR or SpO₂ 7-day drop alert) |
| `blue` | Solid light blue (low ring battery) |
| `red` | Flashing red every **0.5 s** (critical low HR) |

**Priority:** critical HR (red) beats yellow beats blue beats green.

### Environment variables

```env
ALERT_DROP_POINTS=10
ALERT_WINDOW_DAYS=7
BATTERY_LOW_PERCENT=25
HR_CRITICAL_LOW_BPM=40
```

### Test mode (development)

Force alerts without changing real data:

```powershell
$env:ALERT_TEST_HEARTRATE = "1"    # yellow HR card + ring
$env:ALERT_TEST_SPO2 = "1"         # yellow SpO₂ card + ring
$env:ALERT_TEST_BATTERY = "1"     # yellow battery card + blue ring
$env:ALERT_TEST_HR_CRITICAL = "1" # red HR card + flashing red ring
node server.js
```

Remove test vars before normal use.

---

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Dashboard (static) |
| `GET` | `/auth/login` | Start Oura OAuth |
| `GET` | `/auth/callback` | OAuth callback |
| `POST` | `/auth/logout` | Clear stored tokens |
| `GET` | `/api/status` | Connection status + profile |
| `GET` | `/api/dashboard?days=N` | Full dashboard payload (`days` 1–730) |
| `GET` | `/api/ring-status` | Alert state for NeoPixel |

### Example: ring status

```bash
curl http://localhost:3000/api/ring-status
```

```json
{
  "connected": true,
  "heartrate": {
    "latest": 55,
    "average_7d": 59.5,
    "alert": false,
    "critical_low": false,
    "critical_threshold": 40,
    "threshold": 49.5
  },
  "spo2": {
    "latest": null,
    "average_7d": null,
    "alert": false,
    "threshold": null
  },
  "battery": {
    "latest": 92,
    "alert": false,
    "threshold": 25
  },
  "ring_color": "green"
}
```

`ring_color` is one of: `green`, `yellow`, `blue`, `red`.

---

## Hosting options

### Local PC (default)

Your PC runs `node server.js` on port **3000**. The ESP32 polls your PC’s **LAN IP** (e.g. `192.168.12.210`). The server stops when the PC sleeps or the process exits.

### GoDaddy Node.js hosting (beta)

Upload `deploy/med-alert-board-godaddy.zip` to [host.beta.godaddy.com/paas](https://host.beta.godaddy.com/paas). Full steps: [deploy/GODADDY.md](deploy/GODADDY.md).

Rebuild the zip after code changes:

```powershell
# From project root — recreates deploy/med-alert-board-godaddy.zip
$staging = "deploy/staging"
Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $staging -Force | Out-Null
Copy-Item server.js, package.json, package-lock.json -Destination $staging
Copy-Item public -Destination "$staging/public" -Recurse
Copy-Item deploy/env.template -Destination "$staging/.env"
Copy-Item deploy/GODADDY.md -Destination $staging
Compress-Archive -Path "$staging/*" -DestinationPath deploy/med-alert-board-godaddy.zip -Force
Remove-Item $staging -Recurse -Force
```

### Both local and hosted

Common pattern: **PC + ESP32 at home**, **GoDaddy** for phone access when away. Each needs its own Oura redirect URI and OAuth connection.

---

## ESP32 NeoPixel setup

### Hardware

| Component | Notes |
|-----------|--------|
| **Board** | Seeed Studio XIAO ESP32-C6 |
| **Ring** | Adafruit 16-LED NeoPixel (5 V) |
| **Data** | XIAO **D2 (GPIO2)** → **330 Ω** resistor → NeoPixel **DIN** |
| **Power** | 5 V and GND to ring; share GND with XIAO |
| **XIAO power** | USB-C from charger or PC |
| **Optional** | 1000 µF capacitor across ring 5 V / GND |

**Power tip:** You can power both the XIAO (USB) and the ring from one 5 V USB supply by connecting the ring to the XIAO **5V** and **GND** pins. Do not connect a separate bench supply to **5V** while USB is plugged in unless you use a protection diode (see [Seeed wiki](https://wiki.seeedstudio.com/xiao_pin_multiplexing_esp32c6/)).

### Firmware configuration

```bash
cd esp32-neopixel
cp config.h.example config.h
```

Edit `config.h`:

```cpp
#define WIFI_SSID "your-wifi-name"
#define WIFI_PASSWORD "your-wifi-password"
#define HEALTH_BOARD_HOST "192.168.x.x"   // your PC's LAN IP, not localhost
#define HEALTH_BOARD_PORT 3000
```

Find your PC IP on Windows: `ipconfig` → **IPv4 Address** under **Wi-Fi**.

`config.h` is gitignored and must stay on your machine only.

### Build and upload

Requires [PlatformIO](https://platformio.org/).

```bash
cd esp32-neopixel
pio run -t upload --upload-port COM15
```

Replace `COM15` with your serial port (`pio device list`).

### Serial monitor

```bash
pio device monitor --port COM15 --baud 115200
```

Expected output: Wi-Fi connect, then status line every 60 seconds (`GREEN`, `YELLOW`, `BLUE`, or `RED FLASH`).

Brightness is set in `main.cpp` via `ring.setBrightness(64)` (0–255).

---

## Oura API limits (personal use)

| Limit | Detail |
|-------|--------|
| **Date range** | Up to 730 days (2 years) |
| **Heart rate time-series** | API allows ~30 days per request; longer dashboard ranges cap HR charts at 30 days |
| **Rate limits** | Personal use is usually fine; heavy polling may hit Oura throttling |
| **Developer apps** | ~10 users unless Oura approves more |
| **Sync delay** | Daily scores often update after ring sync; activity may lag during the day |

---

## Troubleshooting

### Dashboard

| Problem | Try |
|---------|-----|
| “Not connected to Oura” | Click Connect Oura; check `.env` credentials |
| Missing metrics | Disconnect → Connect; check Oura app has data |
| 401 / scope errors | Reconnect to grant updated permissions |
| Empty Today | Sync ring in Oura app; today’s data may not be ready yet |
| Port in use | Stop other `node server.js` processes; only one server on port 3000 |

### Alerts

| Problem | Try |
|---------|-----|
| Card yellow but ring wrong color | Check `/api/ring-status`; higher-priority alert may apply (red > yellow > blue) |
| Battery card yellow, ring blue | Expected — battery uses blue LED, not yellow |
| Critical HR not flashing | Reflash ESP32 firmware; confirm `ring_color` is `"red"` in API |
| Test an alert | Use `ALERT_TEST_*` env vars (see [Alert logic](#alert-logic)) |

### NeoPixel

| Problem | Try |
|---------|-----|
| Ring stays green when alert expected | Confirm alert on dashboard; check `/api/ring-status` from PC browser |
| Wi-Fi fails | Check `config.h` SSID/password; 2.4 GHz network required |
| HTTP error | Use PC **LAN IP** in `HEALTH_BOARD_HOST`; server must be running; PC firewall may block port 3000 |
| Upload fails | Correct COM port; close other serial monitors |
| Dim / wrong colors | Power ring from 5 V; check data wire and 330 Ω resistor |

### Windows firewall

If the ESP32 cannot reach the server, allow inbound TCP on port **3000** for private networks, or temporarily test with the firewall off.

---

## Security notes

- Never commit `.env`, `.tokens.json`, or `esp32-neopixel/config.h`
- `config.h` contains Wi-Fi credentials — keep it local
- `/api/ring-status` has no auth; intended for a trusted home network only
- On public hosting (GoDaddy), add auth or restrict access before exposing the LED endpoint
- Rotate Oura client secret if it was ever exposed

---

## License

Private personal project. Oura data is subject to [Oura’s terms](https://ouraring.com/terms-and-conditions) and API policies.
