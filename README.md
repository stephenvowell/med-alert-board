# Med-Alert Board

Personal wellness dashboard for Oura Ring data, with an optional ESP32 NeoPixel status light for at-a-glance alerts.

**Not a medical device.** This is for personal insight only. Do not use it for diagnosis or emergency decisions.

> **Quick start:** See [QUICKSTART.md](QUICKSTART.md) for a one-page cheat sheet.

---

## What it does

### Web dashboard (`http://localhost:3000`)

- Connects to your Oura account via OAuth 2.0
- Shows sleep, readiness, activity, heart rate, SpO₂, stress, resilience, VO₂ max, and more
- Charts, recovery trends, and detailed tables
- Auto-refreshes every **60 seconds** while connected
- Date ranges: **Today** through **2 years**
- Highlights **Latest HR** and **SpO₂ avg** cards in yellow when values drop more than 10 points below the 7-day average

### NeoPixel status ring (optional hardware)

- **Green** — no alert
- **Yellow** — latest heart rate or SpO₂ is more than 10 points below the 7-day average
- Polls the Med-Alert Board over Wi-Fi every 60 seconds

---

## Project structure

```
oura/
├── server.js              # Express API + Oura OAuth
├── package.json
├── .env                   # Oura API credentials (not committed)
├── .tokens.json           # OAuth tokens (not committed)
├── public/
│   ├── index.html         # Dashboard page
│   ├── app.js             # Frontend logic, charts, alerts UI
│   └── styles.css
└── esp32-neopixel/        # PlatformIO firmware for XIAO ESP32-C6
    ├── src/main.cpp
    ├── config.h           # Wi-Fi + server IP (not committed)
    ├── config.h.example
    └── platformio.ini
```

---

## Requirements

- **Node.js** 18 or newer
- **Oura developer app** at [cloud.ouraring.com](https://cloud.ouraring.com)
- **ESP32 (optional):** Seeed Studio XIAO ESP32-C6, Adafruit 16-LED NeoPixel ring, PlatformIO

---

## Med-Alert Board setup

### 1. Oura API application

1. Go to [Oura Cloud → API Applications](https://cloud.ouraring.com/oauth/applications).
2. Create an application.
3. Set redirect URI to: `http://localhost:3000/auth/callback`
4. Copy the **Client ID** and **Client Secret**.

### 2. Environment file

```bash
cp .env.example .env
```

Edit `.env`:

```env
OURA_CLIENT_ID=your_client_id
OURA_CLIENT_SECRET=your_client_secret
OURA_REDIRECT_URI=http://localhost:3000/auth/callback
PORT=3000
```

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

Alerts are computed from the last **7 days** of data.

| Metric | Rule |
|--------|------|
| **Heart rate** | Latest BPM sample is more than **10** below the 7-day average of all samples in that window |
| **SpO₂** | Latest daily average is more than **10** below the 7-day average of daily SpO₂ values |

When either triggers:

- Dashboard **Latest HR** and/or **SpO₂ avg** cards turn yellow
- `/api/ring-status` returns `"ring_color": "yellow"`
- NeoPixel ring shows solid yellow (if configured)

Constants are defined in `server.js`:

```js
const ALERT_DROP_POINTS = 10;
const ALERT_WINDOW_DAYS = 7;
```

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
| `GET` | `/api/ring-status` | Alert state for NeoPixel (`ring_color`: `green` or `yellow`) |

### Example: ring status

```bash
curl http://localhost:3000/api/ring-status
```

```json
{
  "connected": true,
  "heartrate": { "latest": 62, "average_7d": 61.1, "alert": false, "threshold": 51.1 },
  "spo2": { "latest": null, "average_7d": null, "alert": false, "threshold": null },
  "ring_color": "green"
}
```

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

Expected output: Wi-Fi connect, then `GREEN - OK` or `YELLOW - check in` every 60 seconds.

### Ring behavior

| Color | Meaning |
|-------|---------|
| Green | No HR or SpO₂ alert |
| Yellow | Latest HR or SpO₂ is 10+ points below 7-day average |

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
- Rotate Oura client secret if it was ever exposed

---

## License

Private personal project. Oura data is subject to [Oura’s terms](https://ouraring.com/terms-and-conditions) and API policies.
