# Zyphe · Carbonara Compliance 🍝🏛️

Booth game and **iPhone Duo** prize draw for **SiGMA Rome**. Entries close on **5 Nov 2026 at 18:00 Rome time**.
Everything runs on **Netlify's free plan**: the website, the API (a Netlify Function) and the data (Netlify Blobs).

```
Players' phones / booth tablets / TV
        │
        ▼
https://zyphe-carbonara.netlify.app
   ├── web/                      the game, leaderboard and admin page
   ├── /api                      netlify/functions/api.mjs
   └── Netlify Blobs "carbonara" leads, games, draws, leaderboard
```

## Set up (once, about 5 minutes)
1. **Link the Netlify site to this GitHub repository.** In Netlify, open the `zyphe-carbonara` site, then
   **Site configuration → Build & deploy → Continuous deployment → Link repository**, and pick this repo (branch `main`).
   The build settings come from `netlify.toml` (publish `web`, functions `netlify/functions`), so leave the fields empty.
2. **Set the admin password.** **Site configuration → Environment variables → Add a variable**:
   key `ADMIN_PASSWORD`, a strong value, mark it as **secret**, scope **Functions**.
3. **Redeploy** so the function picks up the password: **Deploys → Trigger deploy → Deploy site**.
4. **Check it:** open `https://zyphe-carbonara.netlify.app/api?action=config`. You should see `{"ok":true,"eventName":"SiGMA Rome"…`.

Netlify Blobs needs no setup: the store is created the first time someone signs up. You can browse it in Netlify under
**Data & Storage → Blobs → carbonara**.

From now on, every change pushed to `main` deploys automatically. Drag-and-drop deploys are switched off once the repo is linked.

## Pages
| Page | Use |
|---|---|
| `/` | The game (people play on their phones via the QR code) |
| `/?kiosk=1` | Booth tablets: nothing is remembered between players, "Next player" button, auto-reset |
| `/leaderboard` | Booth TV: refreshes live and shows the winner after the draw |
| `/admin.html` | Your team: stats, lead table, CSV export, disqualify, prize draw, delete test data (password = `ADMIN_PASSWORD`) |

## Rules the API enforces
- One entry per email address. Re-registering with the same email keeps the original details.
- **One game per person.** Only the first game counts; later attempts are logged as "Repeat play: not counted".
- Implausible scores count as 0. Marketing consent is required, and its time, wording and version are stored.
- @zyphe.com addresses can play but can't win.

## Prize draw (5 Nov, after 18:00)
On `/admin.html`, click **Draw the winner**. Uniform random draw, one ticket per person, among people who accepted the
terms, played, registered before the close, aren't staff and aren't disqualified. Every draw is logged; drawing again skips
earlier winners. Before the close it refuses unless you tick "draw anyway", which is handy for a test.

## Event-day checklist
1. Test on your phone: sign up, play, check the lead on `/admin.html`, do a test draw.
2. On `/admin.html`, **Export CSV** if you want to keep the test, then **Delete all data** (type `DELETE ALL DATA`).
3. Open `/leaderboard` on the TV and `/?kiosk=1` on the tablets, and put the QR posters up (`print/`).
4. After the event: **Export CSV** and import it into your CRM.

## Changing things
- Event settings (prize, close time, consent wording, dropdown lists, staff domain): the `CFG` block at the top of
  `netlify/functions/api.mjs`. The dropdown lists must match `OPTIONS` in `web/app.js`.
- Game content (cases, red flags, L1/L2 alerts): `web/game-data.js`. Brand colours: `web/styles.css`.
- Edit a file on github.com (pencil icon → Commit changes) and Netlify redeploys within a minute.

## Files
- `web/`: the website
- `netlify/functions/api.mjs`: the API · `netlify.toml`: Netlify settings · `package.json`: the one dependency (`@netlify/blobs`)
- `print/`: booth poster and QR codes
- `alternatives/`: earlier backends (Google Sheets, Cloudflare), not used

## Legal
Cleared by Zyphe's legal team for SiGMA Rome 2026. Keep the draw log and the consent records (CSV export) as evidence.
