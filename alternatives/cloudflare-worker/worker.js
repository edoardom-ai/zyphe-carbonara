/**
 * Zyphe · Carbonara Compliance: Cloudflare Worker API (free tier) backed by a D1 database.
 *
 * Bindings (Worker > Settings):
 *   DB              D1 database binding (run schema.sql in it first)
 *   ADMIN_PASSWORD  secret, used by /admin.html
 * Optional variable:
 *   ALLOWED_ORIGINS comma-separated list of sites allowed to call the API
 *
 * Protocol (same as the old Apps Script backend, so the website did not change):
 *   GET  ?action=config | ?action=leaderboard&n=10
 *   POST {"action":"register", ...} | {"action":"score", ...}
 *   POST {"action":"admin_summary" | "admin_export" | "admin_draw" | "admin_disqualify", ...}  + header X-Admin-Key
 */

const CFG = {
  EVENT_NAME: 'SiGMA Rome',
  PRIZE: 'iPhone Duo',
  CLOSES_AT: '2026-11-05T18:00:00+01:00', // Rome time
  EXCLUDE_DOMAINS: ['zyphe.com'], // staff can play but can't win
  PRIVACY_URL: 'https://www.zyphe.com/privacy-policy',
  LEAD_SOURCE: 'SiGMA Rome 2026 · Carbonara Compliance',
  REQUIRE_MARKETING_CONSENT: true,
  CONSENT_VERSION: '2026-11-rome-v1',
  CONSENT_TERMS: 'I agree to the prize draw terms and to Zyphe processing my details to run the draw and contact the winner.',
  CONSENT_MARKETING: 'I agree to receive information from Zyphe about its products, services and events by email and phone. I can unsubscribe at any time.',
  // Keep these lists identical to OPTIONS in web/app.js
  SEGMENTS: ['Online casino operator', 'Sportsbook / betting operator', 'Land-based casino', 'Lottery / bingo',
    'Payment provider / PSP', 'Fintech / bank / EMI', 'RegTech / compliance provider', 'Game studio / B2B platform supplier',
    'Affiliate / marketing', 'Crypto / Web3 gaming', 'Esports / fantasy / social gaming', 'Regulator / government',
    'Legal / consultancy', 'Investor / VC', 'Media', 'Other'],
  ROLES: ['Founder / C-level', 'Compliance / MLRO / Risk', 'Product', 'Operations / Payments', 'Engineering / Tech',
    'Sales / BD / Partnerships', 'Marketing / CRM', 'Legal', 'Other'],
  NEEDS: ['KYC', 'KYB', 'AML'],
  PROVIDER_OPTIONS: ['Yes, and we are happy with it', 'Yes, but we are open to alternatives', 'No, we do it in-house / manually',
    'No, we are looking for one', 'Not sure'],
  MAX_SCORE: 60000,
  DEFAULT_ORIGINS: ['https://zyphe-carbonara.netlify.app'],
};

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',').map(s => s.trim()) : CFG.DEFAULT_ORIGINS);
    const cors = {
      'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const json = (o, status = 200) => new Response(JSON.stringify(o), { status,
      headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

    // Browsers from other sites are refused (non-browser tools can't be stopped by CORS anyway).
    if (origin && !allowed.includes(origin)) return json({ ok: false, error: 'Origin not allowed' }, 403);
    if (!env.DB) return json({ ok: false, error: 'Database not connected: add the D1 binding named DB.' }, 500);

    const url = new URL(request.url);
    try {
      if (request.method === 'GET') {
        const action = url.searchParams.get('action') || 'config';
        if (action === 'config') return json(publicConfig());
        if (action === 'leaderboard') return json(await leaderboard(env, Math.min(50, Number(url.searchParams.get('n')) || 10)));
        return json({ ok: false, error: 'Unknown action' }, 404);
      }
      if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
      const text = await request.text();
      if (text.length > 16384) return json({ ok: false, error: 'Request too large' }, 413);
      let b; try { b = JSON.parse(text || '{}'); } catch { return json({ ok: false, error: 'Bad request' }, 400); }
      const ip = request.headers.get('CF-Connecting-IP') || '';
      const ua = (request.headers.get('User-Agent') || '').slice(0, 200);

      if (b.action === 'register') return json(await register(env, b, ip, ua));
      if (b.action === 'score') return json(await score(env, b));
      if (String(b.action || '').startsWith('admin_')) {
        if (!env.ADMIN_PASSWORD) return json({ ok: false, error: 'Set the ADMIN_PASSWORD secret on the Worker first.' }, 500);
        if (!(await safeEqual(request.headers.get('X-Admin-Key') || '', env.ADMIN_PASSWORD))) return json({ ok: false, code: 401, error: 'Wrong password' }, 401);
        if (b.action === 'admin_summary') return json(await adminSummary(env));
        if (b.action === 'admin_export') return json(await adminExport(env));
        if (b.action === 'admin_draw') return json(await adminDraw(env, !!b.force));
        if (b.action === 'admin_disqualify') return json(await adminDisqualify(env, String(b.id || ''), !!b.value));
      }
      return json({ ok: false, error: 'Unknown action' }, 404);
    } catch (err) {
      console.error(err && err.stack || err);
      return json({ ok: false, error: 'Server busy, please try again.' }, 500);
    }
  },
};

// ---------------- public ----------------
function publicConfig() {
  return { ok: true, eventName: CFG.EVENT_NAME, prize: CFG.PRIZE, closesAt: new Date(CFG.CLOSES_AT).toISOString(), open: isOpen(),
    segments: CFG.SEGMENTS, roles: CFG.ROLES, needs: CFG.NEEDS, providers: CFG.PROVIDER_OPTIONS, privacyUrl: CFG.PRIVACY_URL,
    consent: { terms: CFG.CONSENT_TERMS, marketing: CFG.CONSENT_MARKETING, marketingRequired: CFG.REQUIRE_MARKETING_CONSENT } };
}

async function register(env, b, ip, ua) {
  const d = {
    firstName: clean(b.firstName, 60), lastName: clean(b.lastName, 60), email: clean(b.email, 160).toLowerCase(),
    phone: clean(b.phone, 30), company: clean(b.company, 100), role: clean(b.role, 60), roleOther: clean(b.roleOther, 80),
    segment: clean(b.segment, 60), segmentOther: clean(b.segmentOther, 100),
    provider: clean(b.provider, 60), providerName: clean(b.providerName, 100),
    needs: Array.isArray(b.needs) ? b.needs.filter(n => CFG.NEEDS.includes(n)) : [],
    consentTerms: b.consentTerms === true, consentMarketing: b.consentMarketing === true,
  };
  const errs = {};
  if (!d.firstName) errs.firstName = 'Required';
  if (!d.lastName) errs.lastName = 'Required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) errs.email = 'Enter a valid email';
  if (!/^\+?[0-9 ()\-.]{7,22}$/.test(d.phone) || d.phone.replace(/\D/g, '').length < 7) errs.phone = 'Enter a valid phone number (with country code)';
  if (!d.company) errs.company = 'Required';
  if (!CFG.ROLES.includes(d.role)) errs.role = 'Pick your role';
  if (!CFG.SEGMENTS.includes(d.segment)) errs.segment = 'Pick what your company does';
  else if (d.segment === 'Other' && !d.segmentOther) errs.segmentOther = 'Tell us what your company does';
  if (!CFG.PROVIDER_OPTIONS.includes(d.provider)) errs.provider = 'Pick an answer';
  if (!d.consentTerms) errs.consentTerms = 'You need to accept the terms to enter';
  if (CFG.REQUIRE_MARKETING_CONSENT && !d.consentMarketing) errs.consentMarketing = 'Please agree to hear from Zyphe to enter';
  if (Object.keys(errs).length) return { ok: false, error: 'Please check the highlighted fields.', fields: errs };

  const now = new Date().toISOString();
  const has = n => (d.needs.includes(n) ? 1 : 0);
  // New person: insert. Returning email: keep the ORIGINAL contact details (stops someone hijacking another
  // person's entry); only add newly ticked needs and a newly given marketing consent.
  await env.DB.prepare(`
    INSERT INTO leads (id, token, created_at, first_name, last_name, email, phone, company, role, role_other, segment, segment_other,
      need_kyc, need_kyb, need_aml, provider, provider_name, terms, marketing, consent_at, consent_version, consent_text,
      consent_ip, user_agent, lead_source)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, 1, ?18, ?3, ?19, ?20, ?21, ?22, ?23)
    ON CONFLICT(email) DO UPDATE SET
      need_kyc = MAX(need_kyc, excluded.need_kyc), need_kyb = MAX(need_kyb, excluded.need_kyb), need_aml = MAX(need_aml, excluded.need_aml),
      consent_at = CASE WHEN marketing = 0 AND excluded.marketing = 1 THEN excluded.consent_at ELSE consent_at END,
      consent_text = CASE WHEN marketing = 0 AND excluded.marketing = 1 THEN excluded.consent_text ELSE consent_text END,
      marketing = MAX(marketing, excluded.marketing)`)
    .bind(crypto.randomUUID(), randomToken(), now, d.firstName, d.lastName, d.email, d.phone, d.company, d.role, d.roleOther,
      d.segment, d.segmentOther, has('KYC'), has('KYB'), has('AML'), d.provider, d.providerName, d.consentMarketing ? 1 : 0,
      CFG.CONSENT_VERSION, d.consentMarketing ? CFG.CONSENT_MARKETING : '', ip, ua, CFG.LEAD_SOURCE)
    .run();
  const row = await env.DB.prepare('SELECT token, first_name, plays, best_score FROM leads WHERE email = ?').bind(d.email).first();
  return { ok: true, token: row.token, firstName: row.first_name, plays: row.plays, bestScore: row.best_score,
    eligible: isOpen() && !excluded(d.email), open: isOpen() };
}

async function score(env, b) {
  const token = String(b.token || '').slice(0, 80);
  if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) return { ok: false, code: 401, error: 'Unknown player, please register again.' };
  const s = Math.max(0, Math.min(CFG.MAX_SCORE, Math.floor(Number(b.score) || 0)));
  const correct = Math.max(0, Math.floor(Number(b.correct) || 0));
  const wrong = Math.max(0, Math.floor(Number(b.wrong) || 0));
  const plausible = s <= (correct + 1) * 600 && correct + wrong <= 200;
  const now = new Date().toISOString();

  const lead = await env.DB.prepare('SELECT id, email FROM leads WHERE token = ?').bind(token).first();
  if (!lead) return { ok: false, code: 401, error: 'Unknown player, please register again.' };
  // One game per person, enforced atomically: only the first game flips plays from 0 to 1.
  const upd = await env.DB.prepare(`UPDATE leads SET plays = 1, last_played = ?2,
      best_score = CASE WHEN ?3 = 1 THEN ?4 ELSE 0 END, best_at = CASE WHEN ?3 = 1 THEN ?2 ELSE NULL END
    WHERE token = ?1 AND plays = 0`).bind(token, now, plausible ? 1 : 0, s).run();
  const first = upd.meta && upd.meta.changes === 1;
  await env.DB.prepare('INSERT INTO games (played_at, lead_id, score, correct, wrong, status) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(now, lead.id, s, correct, wrong, first ? (plausible ? 'Counted' : 'Counted as 0: implausible score') : 'Repeat play: not counted').run();

  const me = await env.DB.prepare('SELECT best_score, best_at, disqualified FROM leads WHERE id = ?').bind(lead.id).first();
  let rank = null;
  if (me.best_score > 0 && !me.disqualified) {
    const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM leads WHERE disqualified = 0 AND best_score > 0
      AND (best_score > ?1 OR (best_score = ?1 AND best_at < ?2))`).bind(me.best_score, me.best_at || now).first();
    rank = r.n + 1;
  }
  const lb = await leaderboard(env, 10);
  return { ok: true, alreadyPlayed: !first, bestScore: me.best_score, improved: first && plausible, plays: 1, rank,
    leaderboard: lb.leaderboard, eligible: isOpen() && !excluded(lead.email) };
}

async function leaderboard(env, n) {
  const rows = await env.DB.prepare(`SELECT first_name, last_name, company, best_score FROM leads
    WHERE plays > 0 AND best_score > 0 AND disqualified = 0 ORDER BY best_score DESC, best_at ASC LIMIT ?`).bind(n).all();
  const players = await env.DB.prepare('SELECT COUNT(*) AS n FROM leads WHERE plays > 0').first();
  const w = await env.DB.prepare('SELECT name, company FROM draws ORDER BY id DESC LIMIT 1').first();
  return { ok: true, players: players.n, closesAt: new Date(CFG.CLOSES_AT).toISOString(), open: isOpen(), prize: CFG.PRIZE,
    leaderboard: rows.results.map(r => ({ name: publicName(r.first_name, r.last_name), company: r.company, score: r.best_score })),
    winner: w ? { name: publicName(...w.name.split(' ', 2)), company: w.company } : null };
}

// ---------------- admin ----------------
const EXPORT_COLS = ['created_at', 'first_name', 'last_name', 'email', 'phone', 'company', 'role', 'role_other', 'segment', 'segment_other',
  'need_kyc', 'need_kyb', 'need_aml', 'provider', 'provider_name', 'terms', 'marketing', 'consent_at', 'consent_version', 'consent_text',
  'plays', 'best_score', 'best_at', 'disqualified', 'lead_source'];

async function adminSummary(env) {
  const q = sql => env.DB.prepare(sql).first();
  const all = sql => env.DB.prepare(sql).all().then(r => r.results);
  const close = new Date(CFG.CLOSES_AT).toISOString();
  const [total, played, marketing, games, eligible, segs, roles, providers, needs, draws, entries] = await Promise.all([
    q('SELECT COUNT(*) AS n FROM leads'), q('SELECT COUNT(*) AS n FROM leads WHERE plays > 0'),
    q('SELECT COUNT(*) AS n FROM leads WHERE marketing = 1'), q("SELECT COUNT(*) AS n FROM games WHERE status LIKE 'Counted%'"),
    env.DB.prepare(eligibleSql('COUNT(*) AS n')).bind(close).first(),
    all('SELECT segment AS k, COUNT(*) AS n FROM leads GROUP BY segment ORDER BY n DESC'),
    all('SELECT role AS k, COUNT(*) AS n FROM leads GROUP BY role ORDER BY n DESC'),
    all('SELECT provider AS k, COUNT(*) AS n FROM leads GROUP BY provider ORDER BY n DESC'),
    q('SELECT SUM(need_kyc) AS kyc, SUM(need_kyb) AS kyb, SUM(need_aml) AS aml FROM leads'),
    all('SELECT * FROM draws ORDER BY id'),
    all(`SELECT id, created_at, first_name, last_name, email, phone, company, role, role_other, segment, segment_other,
      need_kyc, need_kyb, need_aml, provider, provider_name, marketing, plays, best_score, disqualified FROM leads ORDER BY created_at DESC`),
  ]);
  const obj = rows => Object.fromEntries(rows.map(r => [r.k || '(blank)', r.n]));
  return { ok: true, open: isOpen(), closesAt: close, prize: CFG.PRIZE, total: total.n, played: played.n, marketingOptIn: marketing.n,
    games: games.n, eligible: eligible.n, bySegment: obj(segs), byRole: obj(roles), byProvider: obj(providers),
    byNeed: { KYC: needs.kyc || 0, KYB: needs.kyb || 0, AML: needs.aml || 0 }, draws,
    entries: entries.map(e => ({ ...e, excluded: excluded(e.email) })) };
}

async function adminExport(env) {
  const rows = (await env.DB.prepare(`SELECT ${EXPORT_COLS.join(', ')} FROM leads ORDER BY created_at`).all()).results;
  const lines = [EXPORT_COLS.join(',')].concat(rows.map(r => EXPORT_COLS.map(c => csvCell(r[c])).join(',')));
  return { ok: true, filename: `zyphe-sigma-rome-leads-${new Date().toISOString().slice(0, 10)}.csv`, csv: '﻿' + lines.join('\r\n') };
}

function eligibleSql(select) {
  const staff = CFG.EXCLUDE_DOMAINS.map(d => `email NOT LIKE '%@${d.replace(/'/g, "''")}'`).join(' AND ') || '1 = 1';
  return `SELECT ${select} FROM leads WHERE terms = 1 AND plays > 0 AND disqualified = 0 AND created_at < ?1
    AND ${staff} AND id NOT IN (SELECT lead_id FROM draws)`;
}

async function adminDraw(env, force) {
  if (isOpen() && !force) return { ok: false, error: `Entries are still open until ${CFG.CLOSES_AT}. Tick "draw anyway" to override.` };
  const close = new Date(CFG.CLOSES_AT).toISOString();
  const pool = (await env.DB.prepare(eligibleSql('id, first_name, last_name, email, phone, company')).bind(close).all()).results;
  if (!pool.length) return { ok: false, error: 'No eligible entries left.' };
  const w = pool[secureRandomInt(pool.length)]; // uniform: one ticket per person, score doesn't matter
  const draw = { drawn_at: new Date().toISOString(), lead_id: w.id, name: `${w.first_name} ${w.last_name}`, email: w.email,
    phone: w.phone, company: w.company, pool_size: pool.length, forced: isOpen() ? 1 : 0 };
  await env.DB.prepare(`INSERT INTO draws (drawn_at, lead_id, name, email, phone, company, pool_size, forced) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(draw.drawn_at, draw.lead_id, draw.name, draw.email, draw.phone, draw.company, draw.pool_size, draw.forced).run();
  return { ok: true, draw };
}

async function adminDisqualify(env, id, value) {
  const r = await env.DB.prepare('UPDATE leads SET disqualified = ? WHERE id = ?').bind(value ? 1 : 0, id).run();
  return r.meta.changes ? { ok: true } : { ok: false, error: 'Entry not found' };
}

// ---------------- helpers ----------------
function isOpen() { return Date.now() < new Date(CFG.CLOSES_AT).getTime(); }
function excluded(email) { return CFG.EXCLUDE_DOMAINS.some(d => String(email).toLowerCase().endsWith('@' + d)); }
function clean(v, max) { return String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max); }
function publicName(f, l) { return `${f || ''} ${(l || '').charAt(0)}.`.trim(); }
function randomToken() { const a = new Uint8Array(24); crypto.getRandomValues(a); return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function secureRandomInt(n) {
  const max = 2 ** 32, limit = max - (max % n), buf = new Uint32Array(1);
  for (;;) { crypto.getRandomValues(buf); if (buf[0] < limit) return buf[0] % n; }
}
async function safeEqual(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let diff = 0; for (let i = 0; i < u.length; i++) diff |= u[i] ^ v[i];
  return diff === 0;
}
function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^\+[0-9 ()\-.]+$/.test(s)) s = "'" + s; // stop formula injection, keep +39 phones
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
