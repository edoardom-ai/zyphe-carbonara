# Cloudflare backend: setup in the dashboard (about 10 minutes, free plan)

You need a free Cloudflare account (dash.cloudflare.com). No command line required.

## 1. Create the database
1. In the left menu, go to **Storage & Databases → D1 SQL Database → Create**.
2. Name it `zyphe-carbonara`, choose location **Western Europe** if asked, then **Create**.
3. Open the new database, go to the **Console** tab, paste all of `schema.sql`, and click **Execute**.
   You should see three tables: `leads`, `games`, `draws`.

## 2. Create the Worker (the API)
1. Go to **Workers & Pages → Create → Create Worker**. Name it `zyphe-carbonara-api`, then **Deploy**.
2. Click **Edit code**. Delete the sample, paste all of `worker.js`, then **Deploy**.
3. Go back to the Worker and open **Settings → Bindings → Add → D1 database**.
   Variable name: `DB` (exactly). Database: `zyphe-carbonara`. **Deploy / Save**.
4. Open **Settings → Variables and Secrets → Add**. Type: **Secret**, name `ADMIN_PASSWORD`, value: a strong password. **Deploy / Save**.
5. Copy the Worker's address from its overview page. It looks like `https://zyphe-carbonara-api.<your-name>.workers.dev`.

## 3. Check it
Open `https://zyphe-carbonara-api.<your-name>.workers.dev/?action=config` in a browser.
You should see text starting with `{"ok":true,"eventName":"SiGMA Rome"`.
If it says "Database not connected", the binding in step 2.3 is missing or not named `DB`.

## 4. Point the website at it
Put the Worker address in `web/config.js` (`API_URL`), then re-upload the `web` folder to Netlify (Deploys tab → drag the folder).

## Notes
- The Worker only accepts browser requests from `https://zyphe-carbonara.netlify.app`. If the site moves to another address,
  add a variable `ALLOWED_ORIGINS` with the new address (comma-separate several).
- Event settings (prize, close time, consent wording, dropdown options, staff domain) are in the `CFG` block at the top of
  `worker.js`. The dropdown lists must match `OPTIONS` in `web/app.js`.
- Free plan limits: 100,000 Worker requests per day and 5 GB of D1 storage. A busy booth uses a tiny fraction of that.
- Prefer the command line? `wrangler.toml` is included: fill in `database_id`, then run `npx wrangler deploy`, then set the secret with `npx wrangler secret put ADMIN_PASSWORD`.
