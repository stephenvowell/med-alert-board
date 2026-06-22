# Quick Start Card

One-page reference for **Med-Alert Board**. Full details: [README.md](README.md).

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

| Where | Green | Yellow |
|-------|-------|--------|
| **Latest HR** card | OK | Latest BPM is **10+ below** 7-day average |
| **SpO₂ avg** card | OK | Latest SpO₂ is **10+ below** 7-day average |
| **NeoPixel ring** | OK | Same as above (either metric) |

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
| Ring won’t upload | Close serial monitor; try correct COM port |
| Missing SpO₂ / HR | Disconnect → Connect Oura again |

---

## Files you must not share

- `.env` — Oura API secret  
- `.tokens.json` — OAuth tokens  
- `esp32-neopixel/config.h` — Wi-Fi password  

---

*Personal wellness only — not medical advice.*
