# Quick Start Card

One-page reference for **Med-Alert Board**. Full details: [README.md](README.md).  
GoDaddy deploy: [deploy/GODADDY.md](deploy/GODADDY.md).

---

## Dashboard in 4 steps

```
1. cp .env.example .env     → add Oura Client ID + Secret
2. npm install
3. npm start
4. Open http://localhost:3000 → Connect Oura
```

**Redirect URI (must match exactly):** `http://localhost:3000/auth/callback`

---

## Daily use

| Action | How |
|--------|-----|
| Open dashboard | http://localhost:3000 |
| Change date range | Dropdown top-right (Today → 2 years) |
| Refresh data | Auto every 60s, or click **Refresh** |
| Re-auth / fix missing data | **Disconnect** → **Connect Oura** |

---

## Alert colors

### Dashboard cards

| Card | Normal | Yellow | Red |
|------|--------|--------|-----|
| **Latest HR** | OK | 10+ below 7-day avg | Below **40 bpm** |
| **SpO₂ avg** | OK | 10+ below 7-day avg | — |
| **Battery** | OK | At or below **25%** | — |

### NeoPixel ring

| Color | Meaning |
|-------|---------|
| **Green** | All clear |
| **Yellow** | HR or SpO₂ 7-day drop |
| **Blue** | Ring battery ≤ 25% |
| **Red flash** (0.5 s) | HR below 40 bpm |

**Priority:** red → yellow → blue → green

---

## Environment variables (optional)

```env
ALERT_DROP_POINTS=10
ALERT_WINDOW_DAYS=7
BATTERY_LOW_PERCENT=25
HR_CRITICAL_LOW_BPM=40
```

### Test alerts (PowerShell)

```powershell
$env:ALERT_TEST_HR_CRITICAL = "1"   # red flash + red HR card
$env:ALERT_TEST_HEARTRATE = "1"     # yellow HR + ring
$env:ALERT_TEST_SPO2 = "1"          # yellow SpO₂ + ring
$env:ALERT_TEST_BATTERY = "1"       # yellow battery card + blue ring
node server.js
```

---

## NeoPixel ring in 4 steps

```
1. Wire: D2 → 330Ω → DIN | 5V+GND to ring | common GND with XIAO
2. cp esp32-neopixel/config.h.example esp32-neopixel/config.h
3. Set Wi-Fi SSID/password + PC LAN IP (ipconfig → IPv4)
4. pio run -t upload --upload-port COM15
```

**PC IP example:** `192.168.1.100` — use yours, not `localhost`.

**Serial monitor:** `pio device monitor --port COM15 --baud 115200`

---

## Commands cheat sheet

```powershell
# Med-Alert Board
cd oura
npm start                    # run server
npm run dev                  # run with auto-reload

# ESP32
cd esp32-neopixel
pio run                      # build
pio run -t upload --upload-port COM15
pio device monitor --port COM15 --baud 115200

# Check alerts (from any device on your network)
curl http://YOUR-PC-IP:3000/api/ring-status
```

---

## GoDaddy hosting (beta)

1. Upload `deploy/med-alert-board-godaddy.zip` → [host.beta.godaddy.com/paas](https://host.beta.godaddy.com/paas)
2. Set env vars: `OURA_CLIENT_ID`, `OURA_CLIENT_SECRET`, `OURA_REDIRECT_URI`
3. Add same redirect URI in Oura developer portal
4. Open hosted URL → Connect Oura

See [deploy/GODADDY.md](deploy/GODADDY.md) for full checklist.

---

## Wiring (XIAO ESP32-C6 + 16 NeoPixel)

```
USB charger ──► XIAO USB-C
XIAO 5V  ──────► Ring 5V
XIAO GND ──────► Ring GND
XIAO D2  ──330Ω──► Ring DIN
```

---

## When something’s wrong

| Symptom | Fix |
|---------|-----|
| Not connected | Check `.env`, click **Connect Oura** |
| Empty Today | Sync Oura app; data may lag |
| Yellow card but green ring | Check `HEALTH_BOARD_HOST` IP; server running? |
| Battery yellow but ring blue | Expected — battery alert uses blue LED |
| Ring won’t upload | Close serial monitor; try correct COM port |
| Missing SpO₂ / HR | Disconnect → Connect Oura again |
| No red flash on low HR | Reflash ESP32; check `ring_color` in `/api/ring-status` |

---

## Files you must not share

- `.env` — Oura API secret  
- `.tokens.json` — OAuth tokens  
- `esp32-neopixel/config.h` — Wi-Fi password  

---

*Personal wellness only — not medical advice.*
