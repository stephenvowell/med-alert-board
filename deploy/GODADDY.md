# Deploy Med-Alert Board to GoDaddy Node.js Hosting (beta)

Portal: [host.beta.godaddy.com/paas](https://host.beta.godaddy.com/paas)

This guide covers hosting the dashboard on GoDaddy’s **Node.js PaaS (beta)**. Your **Deluxe1** cPanel plan can also use **Setup Node.js App**, but the zip upload portal is simpler for this project.

Full project docs: [README.md](../README.md) · Quick reference: [QUICKSTART.md](../QUICKSTART.md)

---

## 1. Before you upload

- [ ] Oura app at [cloud.ouraring.com/oauth/applications](https://cloud.ouraring.com/oauth/applications)
- [ ] Note your **Client ID** and **Client Secret**
- [ ] Know your hosted URL after deploy, e.g. `https://health.yourdomain.com`

---

## 2. Upload the zip

1. Sign in at [host.beta.godaddy.com/paas](https://host.beta.godaddy.com/paas)
2. Upload **`deploy/med-alert-board-godaddy.zip`**
3. Wait for build to finish

The zip includes a **`.env`** file with placeholders. GoDaddy may require this file to be present.

**If the dashboard also has an Environment Variables section:** set `OURA_CLIENT_ID` and `OURA_CLIENT_SECRET` there (recommended — overrides `.env`).  
**If it only accepts `.env`:** edit `deploy/env.template`, rebuild the zip, and re-upload — or edit `.env` inside the zip before uploading.

**Never** put real secrets in git. Use the GoDaddy UI when possible.

### Rebuild the zip after code changes

From the project root (PowerShell):

```powershell
$staging = "deploy/staging"
Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $staging -Force | Out-Null
Copy-Item server.js, package.json, package-lock.json -Destination $staging
Copy-Item public -Destination "$staging/public" -Recurse
if (Test-Path deploy/.env) { Copy-Item deploy/.env -Destination "$staging/.env" } else { Copy-Item deploy/env.template -Destination "$staging/.env" }
Copy-Item deploy/GODADDY.md -Destination $staging
Remove-Item deploy/med-alert-board-godaddy.zip -Force -ErrorAction SilentlyContinue
Compress-Archive -Path "$staging/*" -DestinationPath deploy/med-alert-board-godaddy.zip -Force
Remove-Item $staging -Recurse -Force
```

---

## 3. Environment variables (GoDaddy hosting UI)

**Required (only these two on GoDaddy):**

| Variable | Value |
|----------|--------|
| `OURA_CLIENT_ID` | from [Oura developer portal](https://cloud.ouraring.com/oauth/applications) |
| `OURA_CLIENT_SECRET` | from same Oura app |

**Optional** — leave unset unless you need to override auto-detection:

| Variable | When to use |
|----------|-------------|
| `OURA_REDIRECT_URI` | Force exact callback URL |
| `PUBLIC_URL` | e.g. `https://your-app.godaddysites.com` if auto-detect fails |
| `ALERT_DROP_POINTS`, `BATTERY_LOW_PERCENT`, `HR_CRITICAL_LOW_BPM` | Alert tuning (defaults work) |

The server auto-builds the redirect URI as `https://YOUR-APP-URL/auth/callback` from the incoming request (works behind GoDaddy's proxy).

**Do not** upload `.env` in the zip.

### Find your redirect URI after deploy

Open in a browser:

```
https://YOUR-APP-URL/api/oauth-info
```

Copy `redirect_uri` from the JSON and add it in Oura's API Applications.

---

## 4. Oura redirect URI (must match exactly)

After deploy, open:

```
https://YOUR-APP-URL/api/oauth-info
```

Add the `redirect_uri` value to [Oura API Applications](https://cloud.ouraring.com/oauth/applications) (allowed redirect URIs).

Keep `http://localhost:3000/auth/callback` if you also run locally.

---

## 5. Connect Oura

1. Open your hosted app URL in a browser
2. Click **Connect Oura**
3. Authorize — tokens save to `.tokens.json` on the server

If the app redeploys and tokens are lost, connect Oura again.

---

## 6. Alerts on hosted server

All alert rules work the same as local:

| Alert | Dashboard | `ring_color` |
|-------|-----------|--------------|
| HR 7-day drop | Yellow HR / SpO₂ card | `yellow` |
| SpO₂ 7-day drop | Yellow SpO₂ card | `yellow` |
| Ring battery ≤ 25% | Yellow battery card | `blue` |
| HR &lt; 40 bpm | Red HR card | `red` (ESP32 flashes) |

---

## 7. ESP32 (optional)

**Home (recommended):** keep `config.h` pointed at your PC LAN IP (`192.168.x.x:3000`).

**Hosted:** update `esp32-neopixel/config.h`:

- `HEALTH_BOARD_HOST` → GoDaddy hostname (no `https://`)
- `HEALTH_BOARD_PORT` → `443` for HTTPS (requires firmware HTTPS support — not implemented yet)

Until HTTPS is added to firmware, use the **local PC** for the NeoPixel ring.

---

## 8. Local + hosted together

| | Local PC | GoDaddy |
|--|----------|---------|
| Dashboard | `http://localhost:3000` | `https://YOUR-APP-URL` |
| ESP32 | PC LAN IP | Not yet (needs HTTPS) |
| Oura OAuth | Separate connection per URL | Separate connection per URL |
| Tokens | `.tokens.json` on PC | `.tokens.json` on host |

---

## 9. Security

`/api/ring-status` has **no authentication**. On the public internet:

- Do not expose the LED endpoint without an API key or VPN
- Never commit `.env` or tokens to git
- Use GoDaddy env UI for secrets only

---

## 10. Troubleshooting

| Problem | Fix |
|---------|-----|
| Build fails | Check build logs; `package.json` must have `"start": "node server.js"` |
| App won't start | Set `OURA_CLIENT_ID` and `OURA_CLIENT_SECRET` |
| OAuth error | Redirect URI in Oura must match `OURA_REDIRECT_URI` exactly |
| Dashboard empty | Connect Oura on hosted URL; check deploy logs |
| Alerts wrong | Same env vars as local; see README alert section |

---

## Files in the zip

| Included | Excluded |
|----------|----------|
| `server.js` | `node_modules/` |
| `package.json`, `package-lock.json` | `.tokens.json` |
| `public/` | `esp32-neopixel/` |
| **`.env`** (placeholders from `deploy/env.template`) | local secrets |
| `GODADDY.md` | `.git/` |
