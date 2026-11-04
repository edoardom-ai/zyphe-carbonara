/**
 * Zyphe · Carbonara Compliance API: one Netlify Function, data in Netlify Blobs (free, nothing to set up).
 * Served at /api on the same site as the game, so there is no cross-site (CORS) setup at all.
 *
 *   GET  /api?action=config | /api?action=leaderboard&n=10
 *   POST /api {"action":"register"|"score", ...}
 *   POST /api {"action":"admin_summary"|"admin_export"|"admin_draw"|"admin_disqualify", ...} + header X-Admin-Key
 *
 * Environment variable (Netlify > Site configuration > Environment variables): ADMIN_PASSWORD
 *
 * Storage layout (one Blobs store, "carbonara"). Every rule that matters uses create-once writes (onlyIfNew),
 * so nothing depends on read-modify-write and simultaneous requests can't overwrite each other:
 *   leads/<sha256(email)>          one lead per email address
 *   tokens/<token>                 player ticket -> lead id
 *   plays/<lead id>                created by the FIRST game only: this is the one-game-per-person rule
 *   lb/<999999-score>_<time>_<id>  one leaderboard entry per scorer; sorting the key names gives the ranking
 *   games/<time>_<rand>            every game played (repeat attempts are logged as not counted)
 *   draws/<time>_<rand>            prize draw log
 *   winner                         latest winner, shown on the booth screen
 */
import { getStore } from '@netlify/blobs';

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
  BOARD_SIZE: 100,
};

export const config = { path: '/api' };

function store() {
  // Local tests point the client at a local Blobs server; on Netlify the environment provides everything.
  const t = process.env.BLOBS_TEST_URL;
  return getStore(t ? { name: 'carbonara', consistency: 'strong', siteID: 'local-test', token: 'local-test', apiURL: t }
    : { name: 'carbonara', consistency: 'strong' });
}

export default async (request) => {
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  const url = new URL(request.url);
  const db = store();
  try {
    if (request.method === 'GET') {
      const action = url.searchParams.get('action') || 'config';
      if (action === 'config') return json(publicConfig());
      if (action === 'leaderboard') return json(await leaderboard(db, Math.min(50, Number(url.searchParams.get('n')) || 10)));
      return json({ ok: false, error: 'Unknown action' }, 404);
    }
    if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
    const text = await request.text();
    if (text.length > 16384) return json({ ok: false, error: 'Request too large' }, 413);
    let b; try { b = JSON.parse(text || '{}'); } catch { return json({ ok: false, error: 'Bad request' }, 400); }
    const ip = request.headers.get('x-nf-client-connection-ip') || request.headers.get('x-forwarded-for') || '';
    const ua = (request.headers.get('user-agent') || '').slice(0, 200);

    if (b.action === 'register') return json(await register(db, b, ip, ua));
    if (b.action === 'score') return json(await score(db, b));
    if (String(b.action || '').startsWith('admin_')) {
      const pw = process.env.ADMIN_PASSWORD || '';
      if (!pw) return json({ ok: false, error: 'Set the ADMIN_PASSWORD environment variable in Netlify first.' }, 500);
      if (!(await safeEqual(request.headers.get('x-admin-key') || '', pw))) return json({ ok: false, code: 401, error: 'Wrong password' }, 401);
      if (b.action === 'admin_summary') return json(await adminSummary(db));
      if (b.action === 'admin_export') return json(await adminExport(db));
      if (b.action === 'admin_draw') return json(await adminDraw(db, !!b.force));
      if (b.action === 'admin_disqualify') return json(await adminDisqualify(db, String(b.id || ''), !!b.value));
      if (b.action === 'admin_reset') return json(await adminReset(db, String(b.confirm || '')));
      if (b.action === 'admin_delete_lead') return json(await adminDeleteLead(db, String(b.id || '')));
    }
    return json({ ok: false, error: 'Unknown action' }, 404);
  } catch (err) {
    console.error(err && err.stack || err);
    return json({ ok: false, error: 'Server busy, please try again.' }, 500);
  }
};

// ---------------- public ----------------
function publicConfig() {
  return { ok: true, eventName: CFG.EVENT_NAME, prize: CFG.PRIZE, closesAt: new Date(CFG.CLOSES_AT).toISOString(), open: isOpen(),
    segments: CFG.SEGMENTS, roles: CFG.ROLES, needs: CFG.NEEDS, providers: CFG.PROVIDER_OPTIONS, privacyUrl: CFG.PRIVACY_URL,
    consent: { terms: CFG.CONSENT_TERMS, marketing: CFG.CONSENT_MARKETING, marketingRequired: CFG.REQUIRE_MARKETING_CONSENT } };
}

async function register(db, b, ip, ua) {
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

  const id = await sha256(d.email), key = `leads/${id}`, now = new Date().toISOString();
  let lead = await db.get(key, { type: 'json' });
  if (!lead) {
    const token = randomToken();
    lead = {
      id, token, created_at: now, first_name: d.firstName, last_name: d.lastName, email: d.email, phone: d.phone, company: d.company,
      role: d.role, role_other: d.roleOther, segment: d.segment, segment_other: d.segmentOther,
      need_kyc: has(d, 'KYC'), need_kyb: has(d, 'KYB'), need_aml: has(d, 'AML'), provider: d.provider, provider_name: d.providerName,
      terms: 1, marketing: d.consentMarketing ? 1 : 0, consent_at: now, consent_version: CFG.CONSENT_VERSION,
      consent_text: d.consentMarketing ? CFG.CONSENT_MARKETING : '', consent_ip: ip, user_agent: ua,
      plays: 0, best_score: 0, best_at: null, last_played: null, disqualified: 0, lead_source: CFG.LEAD_SOURCE,
    };
    await db.setJSON(`tokens/${token}`, { lead: id }, { onlyIfNew: true });
    const w = await db.setJSON(key, lead, { onlyIfNew: true });
    if (!w.modified) { // someone registered the same email a moment earlier: use theirs
      await db.delete(`tokens/${token}`);
      lead = await db.get(key, { type: 'json' });
    }
  } else {
    // Returning email: keep the ORIGINAL contact details (stops entry hijacking). Only add needs and a new consent.
    const l = lead; let changed = false;
    for (const [k, n] of [['need_kyc', 'KYC'], ['need_kyb', 'KYB'], ['need_aml', 'AML']]) if (!l[k] && has(d, n)) { l[k] = 1; changed = true; }
    if (!l.marketing && d.consentMarketing) { l.marketing = 1; l.consent_at = now; l.consent_text = CFG.CONSENT_MARKETING; changed = true; }
    if (changed) await db.setJSON(key, l);
  }
  return { ok: true, token: lead.token, firstName: lead.first_name, plays: lead.plays, bestScore: lead.best_score,
    eligible: isOpen() && !excluded(lead.email), open: isOpen() };
}

async function score(db, b) {
  const token = String(b.token || '').slice(0, 80);
  if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) return { ok: false, code: 401, error: 'Unknown player, please register again.' };
  const s = Math.max(0, Math.min(CFG.MAX_SCORE, Math.floor(Number(b.score) || 0)));
  const correct = Math.max(0, Math.floor(Number(b.correct) || 0));
  const wrong = Math.max(0, Math.floor(Number(b.wrong) || 0));
  const plausible = s <= (correct + 1) * 600 && correct + wrong <= 200;
  const t = await db.get(`tokens/${token}`, { type: 'json' });
  if (!t) return { ok: false, code: 401, error: 'Unknown player, please register again.' };
  const id = t.lead, key = `leads/${id}`, now = new Date().toISOString();
  const best = plausible ? s : 0;

  // One game per person: only the first game manages to create plays/<id>. Simultaneous games can't both win.
  const marker = await db.setJSON(`plays/${id}`, { lead_id: id, played_at: now, score: best }, { onlyIfNew: true });
  const first = marker.modified;
  const lead = await db.get(key, { type: 'json' });
  if (first) {
    lead.plays = 1; lead.last_played = now; lead.best_score = best; lead.best_at = plausible ? now : null;
    await db.setJSON(key, lead); // single writer: only the request that created the marker gets here
    if (best > 0 && !lead.disqualified) await db.setJSON(lbKey(lead), { name: publicName(lead.first_name, lead.last_name), company: lead.company, score: best });
    // Safety net: if another submission from the same person slipped in at the same instant, the stored marker
    // decides. The losing request withdraws its leaderboard entry and reports the counted score instead.
    const m = await db.get(`plays/${id}`, { type: 'json' });
    if (m && m.played_at !== now) {
      if (best > 0) await db.delete(lbKey(lead));
      lead.best_score = m.score; lead.best_at = m.played_at;
      return finishScore(db, lead, id, s, correct, wrong, now, false, plausible);
    }
  } else {
    const m = await db.get(`plays/${id}`, { type: 'json' });
    if (m) { lead.best_score = m.score; lead.plays = 1; } // the first game may still be finishing its write
  }
  return finishScore(db, lead, id, s, correct, wrong, now, first, plausible);
}

async function finishScore(db, lead, id, s, correct, wrong, now, first, plausible) {
  await db.setJSON(`games/${now}_${randomToken(6)}`, { played_at: now, lead_id: id, email: lead.email, score: s, correct, wrong,
    status: first ? (plausible ? 'Counted' : 'Counted as 0: implausible score') : 'Repeat play: not counted' });
  const keys = await allKeys(db);
  const board = boardKeys(keys);
  const rank = board.findIndex(k => k.endsWith('_' + id)) + 1 || null;
  return { ok: true, alreadyPlayed: !first, bestScore: lead.best_score, improved: first && plausible, plays: 1, rank,
    leaderboard: await boardRows(db, board.slice(0, 10)), eligible: isOpen() && !excluded(lead.email) };
}

async function leaderboard(db, n) {
  const keys = await allKeys(db);
  const [rows, winner] = await Promise.all([boardRows(db, boardKeys(keys).slice(0, n)), db.get('winner', { type: 'json' })]);
  return { ok: true, players: keys.filter(k => k.startsWith('plays/')).length, closesAt: new Date(CFG.CLOSES_AT).toISOString(),
    open: isOpen(), prize: CFG.PRIZE, leaderboard: rows, winner: winner || null };
}

// ---------------- admin ----------------
const EXPORT_COLS = ['created_at', 'first_name', 'last_name', 'email', 'phone', 'company', 'role', 'role_other', 'segment', 'segment_other',
  'need_kyc', 'need_kyb', 'need_aml', 'provider', 'provider_name', 'terms', 'marketing', 'consent_at', 'consent_version', 'consent_text',
  'plays', 'best_score', 'best_at', 'disqualified', 'lead_source'];

async function readAll(db, keys) {
  const out = [];
  for (let i = 0; i < keys.length; i += 25) out.push(...(await Promise.all(keys.slice(i, i + 25).map(k => db.get(k, { type: 'json' })))));
  return out.filter(Boolean);
}
async function allLeads(db, keys) {
  keys = keys || await allKeys(db);
  const playKeys = keys.filter(k => k.startsWith('plays/'));
  const [leads, markers] = await Promise.all([readAll(db, keys.filter(k => k.startsWith('leads/'))), readAll(db, playKeys)]);
  // plays/ markers are the source of truth for who played and which score counted
  const byId = new Map(markers.map(m => [m.lead_id, m]));
  for (const l of leads) { const m = byId.get(l.id); if (m) { l.plays = 1; l.best_score = m.score; } }
  return leads.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}
async function allDraws(db, keys) {
  keys = keys || await allKeys(db);
  return (await readAll(db, keys.filter(k => k.startsWith('draws/')))).sort((a, b) => (a.drawn_at < b.drawn_at ? -1 : 1));
}
const close = () => new Date(CFG.CLOSES_AT).toISOString();
function eligibleLeads(leads, draws) {
  const won = new Set(draws.map(d => d.lead_id));
  return leads.filter(l => l.terms && l.plays > 0 && !l.disqualified && !excluded(l.email) && l.created_at < close() && !won.has(l.id));
}

async function adminSummary(db) {
  const keys = await allKeys(db);
  const [leads, draws] = await Promise.all([allLeads(db, keys), allDraws(db, keys)]);
  const games = { blobs: keys.filter(k => k.startsWith('games/')) };
  const count = f => leads.reduce((m, l) => { const k = f(l) || '(blank)'; m[k] = (m[k] || 0) + 1; return m; }, {});
  return { ok: true, open: isOpen(), closesAt: close(), prize: CFG.PRIZE, total: leads.length, played: leads.filter(l => l.plays > 0).length,
    marketingOptIn: leads.filter(l => l.marketing).length, games: games.blobs.length, eligible: eligibleLeads(leads, draws).length,
    bySegment: count(l => l.segment), byRole: count(l => l.role), byProvider: count(l => l.provider),
    byNeed: { KYC: leads.filter(l => l.need_kyc).length, KYB: leads.filter(l => l.need_kyb).length, AML: leads.filter(l => l.need_aml).length },
    draws, entries: leads.map(({ token, consent_ip, user_agent, ...l }) => ({ ...l, excluded: excluded(l.email) })) };
}

async function adminExport(db) {
  const leads = (await allLeads(db)).reverse();
  const lines = [EXPORT_COLS.join(',')].concat(leads.map(l => EXPORT_COLS.map(c => csvCell(l[c])).join(',')));
  return { ok: true, filename: `zyphe-sigma-rome-leads-${new Date().toISOString().slice(0, 10)}.csv`, csv: '﻿' + lines.join('\r\n') };
}

async function adminDraw(db, force) {
  if (isOpen() && !force) return { ok: false, error: `Entries are still open until ${CFG.CLOSES_AT}. Tick "draw anyway" to override.` };
  const keys = await allKeys(db);
  const [leads, draws] = await Promise.all([allLeads(db, keys), allDraws(db, keys)]);
  const pool = eligibleLeads(leads, draws);
  if (!pool.length) return { ok: false, error: 'No eligible entries left.' };
  const w = pool[secureRandomInt(pool.length)]; // uniform: one ticket per person, score doesn't matter
  const now = new Date().toISOString();
  const draw = { drawn_at: now, lead_id: w.id, name: `${w.first_name} ${w.last_name}`, email: w.email, phone: w.phone,
    company: w.company, pool_size: pool.length, forced: isOpen() ? 1 : 0 };
  await db.setJSON(`draws/${now}_${randomToken(6)}`, draw);
  await db.setJSON('winner', { name: publicName(w.first_name, w.last_name), company: w.company });
  return { ok: true, draw };
}

async function adminDisqualify(db, id, value) {
  if (!/^[a-f0-9]{64}$/.test(id)) return { ok: false, error: 'Entry not found' };
  const lead = await db.get(`leads/${id}`, { type: 'json' });
  if (!lead) return { ok: false, error: 'Entry not found' };
  lead.disqualified = value ? 1 : 0;
  await db.setJSON(`leads/${id}`, lead);
  const keys = await allKeys(db);
  for (const k of boardKeys(keys).filter(k => k.endsWith('_' + id))) await db.delete(k);
  if (!value && lead.best_score > 0) await db.setJSON(lbKey(lead), { name: publicName(lead.first_name, lead.last_name), company: lead.company, score: lead.best_score });
  return { ok: true };
}

async function adminDeleteLead(db, id) {
  // Removes ONE person completely: lead, ticket, play marker, leaderboard entry, games, and any draw they won.
  // Afterwards their email counts as new. To keep the data but exclude someone, use Disqualify instead.
  if (!/^[a-f0-9]{64}$/.test(id)) return { ok: false, error: 'Entry not found' };
  const lead = await db.get(`leads/${id}`, { type: 'json' });
  if (!lead) return { ok: false, error: 'Entry not found' };
  const keys = await allKeys(db);
  const games = keys.filter(k => k.startsWith('games/')), draws = keys.filter(k => k.startsWith('draws/'));
  const [gameRows, drawRows] = await Promise.all([readAllWithKeys(db, games), readAllWithKeys(db, draws)]);
  const doomed = [`leads/${id}`, `plays/${id}`, ...(lead.token ? [`tokens/${lead.token}`] : []),
    ...boardKeys(keys).filter(k => k.endsWith('_' + id)), ...keys.filter(k => k.startsWith('lb/') && k.endsWith('_' + id)),
    ...gameRows.filter(g => g.data.lead_id === id).map(g => g.key), ...drawRows.filter(d => d.data.lead_id === id).map(d => d.key)];
  // tokens of simultaneous duplicate registrations can point at the same person too
  const tokenKeys = keys.filter(k => k.startsWith('tokens/'));
  const tokenRows = await readAllWithKeys(db, tokenKeys);
  doomed.push(...tokenRows.filter(t => t.data.lead === id).map(t => t.key));
  const unique = [...new Set(doomed)];
  for (let i = 0; i < unique.length; i += 25) await Promise.all(unique.slice(i, i + 25).map(k => db.delete(k)));
  // if they were the shown winner, show the previous remaining winner instead (or nobody)
  const remaining = drawRows.filter(d => d.data.lead_id !== id).map(d => d.data).sort((a, b) => (a.drawn_at < b.drawn_at ? -1 : 1));
  const lastWon = remaining[remaining.length - 1];
  if (drawRows.some(d => d.data.lead_id === id)) {
    if (lastWon) {
      const [f, ...rest] = lastWon.name.split(' ');
      await db.setJSON('winner', { name: publicName(f, rest.join(' ')), company: lastWon.company });
    } else await db.delete('winner');
  }
  return { ok: true, deleted: unique.length, name: `${lead.first_name} ${lead.last_name}` };
}
async function readAllWithKeys(db, keys) {
  const out = [];
  for (let i = 0; i < keys.length; i += 25) {
    const chunk = keys.slice(i, i + 25);
    const vals = await Promise.all(chunk.map(k => db.get(k, { type: 'json' })));
    chunk.forEach((k, j) => { if (vals[j]) out.push({ key: k, data: vals[j] }); });
  }
  return out;
}

async function adminReset(db, confirm) {
  // Wipes leads, games, draws and the leaderboard. Meant for clearing test data before doors open.
  if (confirm !== 'DELETE ALL DATA') return { ok: false, error: 'Type DELETE ALL DATA to confirm.' };
  const keys = await allKeys(db);
  for (let i = 0; i < keys.length; i += 25) await Promise.all(keys.slice(i, i + 25).map(k => db.delete(k)));
  return { ok: true, deleted: keys.length };
}

// ---------------- storage helpers ----------------
async function allKeys(db) {
  // One listing of the whole store, filtered here (works the same on Netlify and on the local test server).
  const { blobs } = await db.list();
  return blobs.map(b => b.key);
}
const lbKey = l => `lb/${String(999999 - Math.min(999999, l.best_score)).padStart(6, '0')}_${l.best_at || ''}_${l.id}`;
// ascending key = highest score first, then earliest; one entry per person (the lower one if a duplicate ever slipped in)
function boardKeys(keys) {
  const sorted = keys.filter(k => k.startsWith('lb/')).sort();
  const last = new Map(); for (const k of sorted) last.set(k.slice(k.lastIndexOf('_') + 1), k);
  const keep = new Set(last.values());
  return sorted.filter(k => keep.has(k));
}
async function boardRows(db, keys) { return (await readAll(db, keys)).map(r => ({ name: r.name, company: r.company, score: r.score })); }

// ---------------- misc helpers ----------------
const sleep = ms => new Promise(r => setTimeout(r, ms));
const has = (d, n) => (d.needs.includes(n) ? 1 : 0);
function isOpen() { return Date.now() < new Date(CFG.CLOSES_AT).getTime(); }
function excluded(email) { return CFG.EXCLUDE_DOMAINS.some(d => String(email).toLowerCase().endsWith('@' + d)); }
function clean(v, max) { return String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max); }
function publicName(f, l) { return `${f || ''} ${(l || '').charAt(0)}.`.trim(); }
function randomToken(n = 24) { const a = new Uint8Array(n); crypto.getRandomValues(a); return Buffer.from(a).toString('base64url'); }
async function sha256(s) { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return Buffer.from(h).toString('hex'); }
function secureRandomInt(n) {
  const max = 2 ** 32, limit = max - (max % n), buf = new Uint32Array(1);
  for (;;) { crypto.getRandomValues(buf); if (buf[0] < limit) return buf[0] % n; }
}
async function safeEqual(a, b) {
  const [x, y] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0; for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}
function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^\+[0-9 ()\-.]+$/.test(s)) s = "'" + s; // stop formula injection, keep +39 phones
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
