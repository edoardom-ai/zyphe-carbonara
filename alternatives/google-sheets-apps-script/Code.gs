/**
 * Zyphe - Carbonara Compliance: Google Sheets backend (free).
 * Plain ES5 + ASCII only, so it runs on both the V8 and the legacy Apps Script runtime.
 *
 * The Google Sheet is the database + lead list + admin panel:
 *   Leads : one row per person (contact details, needs, consent proof, best score, Disqualified checkbox)
 *   Games : one row per game played
 *   Draws : prize draw log
 *   Stats : live counts (formulas)
 * Menu "Zyphe" > "Draw the winner".
 *
 * Setup: see README, section 1.
 */

// ======================= CONFIG =======================
var CFG = {
  EVENT_NAME: 'SiGMA Rome',
  PRIZE: 'iPhone Duo',
  CLOSES_AT: '2026-11-05T18:00:00+01:00',
  EXCLUDE_DOMAINS: ['zyphe.com'],
  PRIVACY_URL: 'https://www.zyphe.com/privacy-policy',
  LEAD_SOURCE: 'SiGMA Rome 2026 - Carbonara Compliance',
  REQUIRE_MARKETING_CONSENT: true,
  CONSENT_VERSION: '2026-11-rome-v1',
  CONSENT_TERMS: 'I agree to the prize draw terms and to Zyphe processing my details to run the draw and contact the winner.',
  CONSENT_MARKETING: 'I agree to receive information from Zyphe about its products, services and events by email and phone. I can unsubscribe at any time.',
  // Keep these lists identical to OPTIONS in web/app.js
  SEGMENTS: ['Online casino operator', 'Sportsbook / betting operator', 'Land-based casino', 'Lottery / bingo',
    'Payment provider / PSP', 'Fintech / bank / EMI', 'RegTech / compliance provider', 'Game studio / B2B platform supplier',
    'Affiliate / marketing', 'Crypto / Web3 gaming', 'Esports / fantasy / social gaming', 'Regulator / government',
    'Legal / consultancy', 'Investor / VC', 'Media', 'Other'],
  PROVIDER_OPTIONS: ['Yes, and we are happy with it', 'Yes, but we are open to alternatives', 'No, we do it in-house / manually',
    'No, we are looking for one', 'Not sure'],
  ROLES: ['Founder / C-level', 'Compliance / MLRO / Risk', 'Product', 'Operations / Payments', 'Engineering / Tech',
    'Sales / BD / Partnerships', 'Marketing / CRM', 'Legal', 'Other'],
  NEEDS: ['KYC', 'KYB', 'AML'],
  MAX_SCORE: 60000
};
// ======================================================

var LEADS = 'Leads', GAMES = 'Games', DRAWS = 'Draws', STATS = 'Stats';
var H = ['Registered at', 'First name', 'Last name', 'Email', 'Phone', 'Company', 'Role', 'Role (other)', 'What they do',
  'KYC', 'KYB', 'AML', 'Terms accepted', 'Marketing consent', 'Consent at', 'Consent version', 'Consent text',
  'Plays', 'Best score', 'Best score at', 'Disqualified', 'Lead source', 'Last played',
  'Company type (other)', 'Current provider', 'Provider name', 'Id', 'Token'];
var C = {};
for (var hi = 0; hi < H.length; hi++) { C[H[hi]] = hi + 1; } // 1-based column index by header name

// ---------------- HTTP ----------------
function doGet(e) {
  var p = (e && e.parameter) || {};
  var action = p.action || 'config';
  try {
    if (action === 'config') return json(publicConfig());
    if (action === 'leaderboard') return json(leaderboardCached(Math.min(50, Number(p.n) || 10)));
    return json({ ok: false, error: 'Unknown action' });
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: 'Server error' });
  }
}

function doPost(e) {
  var b;
  try { b = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return json({ ok: false, error: 'Bad request' }); }
  try {
    if (b.action === 'register') return json(register(b));
    if (b.action === 'score') return json(score(b));
    return json({ ok: false, error: 'Unknown action' });
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: 'Server busy, please try again.' });
  }
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function publicConfig() {
  return {
    ok: true, eventName: CFG.EVENT_NAME, prize: CFG.PRIZE, closesAt: new Date(CFG.CLOSES_AT).toISOString(), open: isOpen(),
    segments: CFG.SEGMENTS, providers: CFG.PROVIDER_OPTIONS, roles: CFG.ROLES, needs: CFG.NEEDS, privacyUrl: CFG.PRIVACY_URL,
    consent: { terms: CFG.CONSENT_TERMS, marketing: CFG.CONSENT_MARKETING, marketingRequired: CFG.REQUIRE_MARKETING_CONSENT }
  };
}

// ---------------- register ----------------
function register(b) {
  var needsIn = (b.needs && b.needs.length) ? b.needs : [];
  var d = {
    firstName: clean(b.firstName, 60), lastName: clean(b.lastName, 60), email: clean(b.email, 160).toLowerCase(),
    phone: clean(b.phone, 30), company: clean(b.company, 100), role: clean(b.role, 60), roleOther: clean(b.roleOther, 80),
    segment: clean(b.segment, 60), segmentOther: clean(b.segmentOther, 100),
    provider: clean(b.provider, 60), providerName: clean(b.providerName, 100), needs: [],
    consentTerms: b.consentTerms === true, consentMarketing: b.consentMarketing === true
  };
  for (var i = 0; i < needsIn.length; i++) { if (CFG.NEEDS.indexOf(needsIn[i]) >= 0) d.needs.push(needsIn[i]); }

  var errs = {}, nErr = 0;
  function bad(k, msg) { errs[k] = msg; nErr++; }
  if (!d.firstName) bad('firstName', 'Required');
  if (!d.lastName) bad('lastName', 'Required');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) bad('email', 'Enter a valid email');
  if (!/^\+?[0-9 ()\-.]{7,22}$/.test(d.phone) || d.phone.replace(/\D/g, '').length < 7) bad('phone', 'Enter a valid phone number (with country code)');
  if (!d.company) bad('company', 'Required');
  if (CFG.ROLES.indexOf(d.role) < 0) bad('role', 'Pick your role');
  if (CFG.SEGMENTS.indexOf(d.segment) < 0) bad('segment', 'Pick what your company does');
  else if (d.segment === 'Other' && !d.segmentOther) bad('segmentOther', 'Tell us what your company does');
  if (CFG.PROVIDER_OPTIONS.indexOf(d.provider) < 0) bad('provider', 'Pick an answer');
  if (!d.consentTerms) bad('consentTerms', 'You need to accept the terms to enter');
  if (CFG.REQUIRE_MARKETING_CONSENT && !d.consentMarketing) bad('consentMarketing', 'Please agree to hear from Zyphe to enter');
  if (nErr) return { ok: false, error: 'Please check the highlighted fields.', fields: errs };

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = sheet(LEADS);
    var row = findRow(sh, C['Email'], d.email);
    var now = new Date();
    if (row) {
      // Returning player: never overwrite the original contact details (stops entry hijacking). Merge needs/consent only.
      var r = sh.getRange(row, 1, 1, H.length).getValues()[0];
      for (var j = 0; j < CFG.NEEDS.length; j++) { if (d.needs.indexOf(CFG.NEEDS[j]) >= 0) r[C[CFG.NEEDS[j]] - 1] = 'Yes'; }
      if (d.consentMarketing && r[C['Marketing consent'] - 1] !== true) {
        r[C['Marketing consent'] - 1] = true; r[C['Consent at'] - 1] = now;
        r[C['Consent version'] - 1] = CFG.CONSENT_VERSION; r[C['Consent text'] - 1] = CFG.CONSENT_MARKETING;
      }
      sh.getRange(row, 1, 1, H.length).setValues([r]);
      return { ok: true, token: r[C['Token'] - 1], firstName: r[C['First name'] - 1],
        plays: Number(r[C['Plays'] - 1]) || 0, bestScore: Number(r[C['Best score'] - 1]) || 0, eligible: isOpen() && !excluded(d.email), open: isOpen() };
    }
    var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().slice(0, 8);
    var rec = {
      'Registered at': now, 'First name': safe(d.firstName), 'Last name': safe(d.lastName), 'Email': d.email, 'Phone': safe(d.phone),
      'Company': safe(d.company), 'Role': d.role, 'Role (other)': safe(d.roleOther), 'What they do': d.segment,
      'KYC': d.needs.indexOf('KYC') >= 0 ? 'Yes' : 'No', 'KYB': d.needs.indexOf('KYB') >= 0 ? 'Yes' : 'No', 'AML': d.needs.indexOf('AML') >= 0 ? 'Yes' : 'No',
      'Terms accepted': true, 'Marketing consent': d.consentMarketing, 'Consent at': now, 'Consent version': CFG.CONSENT_VERSION,
      'Consent text': d.consentMarketing ? CFG.CONSENT_MARKETING : '', 'Plays': 0, 'Best score': 0, 'Best score at': '',
      'Disqualified': false, 'Lead source': CFG.LEAD_SOURCE, 'Last played': '',
      'Company type (other)': safe(d.segmentOther), 'Current provider': d.provider, 'Provider name': safe(d.providerName), 'Id': Utilities.getUuid(), 'Token': token
    };
    var out = [];
    for (var k = 0; k < H.length; k++) out.push(rec[H[k]]);
    sh.appendRow(out);
    return { ok: true, token: token, firstName: d.firstName, plays: 0, bestScore: 0, eligible: isOpen() && !excluded(d.email), open: isOpen() };
  } finally {
    lock.releaseLock();
  }
}

// ---------------- score ----------------
function score(b) {
  var token = String(b.token || '').slice(0, 80);
  if (!/^[a-f0-9\-]{20,}$/i.test(token)) return { ok: false, code: 401, error: 'Unknown player, please register again.' };
  var s = Math.max(0, Math.min(CFG.MAX_SCORE, Math.floor(Number(b.score) || 0)));
  var correct = Math.max(0, Math.floor(Number(b.correct) || 0));
  var wrong = Math.max(0, Math.floor(Number(b.wrong) || 0));
  var plausible = s <= (correct + 1) * 600 && correct + wrong <= 200;
  var best, improved = false, plays, email, name, already = false;

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = sheet(LEADS);
    var row = findRow(sh, C['Token'], token);
    if (!row) return { ok: false, code: 401, error: 'Unknown player, please register again.' };
    var r = sh.getRange(row, 1, 1, H.length).getValues()[0];
    var now = new Date();
    email = r[C['Email'] - 1];
    name = r[C['First name'] - 1] + ' ' + r[C['Last name'] - 1];
    best = Number(r[C['Best score'] - 1]) || 0;
    plays = Number(r[C['Plays'] - 1]) || 0;
    if (plays >= 1) {
      // One game per person: only the first game counts. Log the attempt and change nothing else.
      already = true;
      sheet(GAMES).appendRow([now, email, name, s, correct, wrong, 'Repeat play - not counted']);
    } else {
      plays = 1;
      if (plausible && s > best) { best = s; improved = true; r[C['Best score at'] - 1] = now; }
      r[C['Plays'] - 1] = plays; r[C['Best score'] - 1] = best; r[C['Last played'] - 1] = now;
      sh.getRange(row, 1, 1, H.length).setValues([r]);
      sheet(GAMES).appendRow([now, email, name, s, correct, wrong, plausible ? 'Yes' : 'NO - check']);
    }
  } finally {
    lock.releaseLock();
  }
  CacheService.getScriptCache().remove('lb');
  var lb = leaderboard(100);
  var rank = null;
  for (var i = 0; i < lb.rows.length; i++) { if (lb.rows[i].email === email) { rank = i + 1; break; } }
  return { ok: true, alreadyPlayed: already, bestScore: best, improved: improved, plays: plays, rank: rank,
    leaderboard: publicRows(lb.rows.slice(0, 10)), eligible: isOpen() && !excluded(email) };
}

// ---------------- leaderboard ----------------
function leaderboardCached(n) {
  var cache = CacheService.getScriptCache();
  var raw = cache.get('lb');
  var lb = raw ? JSON.parse(raw) : null;
  if (!lb) { lb = leaderboard(50); cache.put('lb', JSON.stringify(lb), 15); }
  return { ok: true, leaderboard: publicRows(lb.rows.slice(0, n)), players: lb.players,
    closesAt: new Date(CFG.CLOSES_AT).toISOString(), open: isOpen(), prize: CFG.PRIZE, winner: lb.winner };
}

function leaderboard(n) {
  var rows = dataRows(sheet(LEADS));
  var played = 0, top = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (Number(r[C['Plays'] - 1]) > 0) played++; else continue;
    if (Number(r[C['Best score'] - 1]) > 0 && r[C['Disqualified'] - 1] !== true) top.push(r);
  }
  top.sort(function (a, b) {
    return (b[C['Best score'] - 1] - a[C['Best score'] - 1]) || (time(a[C['Best score at'] - 1]) - time(b[C['Best score at'] - 1]));
  });
  var out = [];
  for (var j = 0; j < top.length && j < n; j++) {
    var t = top[j];
    out.push({ name: publicName(t[C['First name'] - 1], t[C['Last name'] - 1]), company: unsafe(t[C['Company'] - 1]),
      score: Number(t[C['Best score'] - 1]), email: t[C['Email'] - 1] });
  }
  var draws = dataRows(sheet(DRAWS)), w = null;
  for (var k = draws.length - 1; k >= 0; k--) { if (draws[k][1]) { w = draws[k]; break; } }
  return { rows: out, players: played, winner: w ? { name: w[1], company: w[5] } : null };
}

function publicRows(rows) {
  var out = [];
  for (var i = 0; i < rows.length; i++) out.push({ name: rows[i].name, company: rows[i].company, score: rows[i].score });
  return out;
}

// ---------------- prize draw (Sheet menu) ----------------
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Zyphe')
    .addItem('Draw the winner', 'drawWinner')
    .addSeparator()
    .addItem('Set up / repair sheets', 'setup')
    .addToUi();
}

function drawWinner() {
  var ui = SpreadsheetApp.getUi();
  var forced = false;
  if (isOpen()) {
    var when = Utilities.formatDate(new Date(CFG.CLOSES_AT), 'Europe/Rome', 'EEE d MMM HH:mm');
    var a = ui.alert('Entries are still open', 'Entries close ' + when + ' Rome time.\nDraw anyway (e.g. a test)?', ui.ButtonSet.YES_NO);
    if (a !== ui.Button.YES) return;
    forced = true;
  }
  var close = new Date(CFG.CLOSES_AT);
  var drawRows = dataRows(sheet(DRAWS)), previous = [];
  for (var i = 0; i < drawRows.length; i++) previous.push(String(drawRows[i][2]).toLowerCase());

  var rows = dataRows(sheet(LEADS)), pool = [];
  for (var j = 0; j < rows.length; j++) {
    var r = rows[j], em = String(r[C['Email'] - 1]);
    if (r[C['Terms accepted'] - 1] === true && Number(r[C['Plays'] - 1]) > 0 && r[C['Disqualified'] - 1] !== true &&
        !excluded(em) && new Date(r[C['Registered at'] - 1]) < close && previous.indexOf(em.toLowerCase()) < 0) {
      pool.push(r);
    }
  }
  if (!pool.length) { ui.alert('No eligible entries left.'); return; }

  var w = pool[secureRandomInt(pool.length)];
  var full = unsafe(w[C['First name'] - 1]) + ' ' + unsafe(w[C['Last name'] - 1]);
  var company = unsafe(w[C['Company'] - 1]), phone = unsafe(w[C['Phone'] - 1]);
  var by = '';
  try { by = Session.getActiveUser().getEmail(); } catch (e) {}
  sheet(DRAWS).appendRow([new Date(), publicName(w[C['First name'] - 1], w[C['Last name'] - 1]), w[C['Email'] - 1], safe(phone),
    full, company, pool.length, forced ? 'YES (before close)' : 'No', by]);
  CacheService.getScriptCache().remove('lb');
  ui.alert('The ' + CFG.PRIZE + ' goes to...',
    full + '\n' + company + '\n' + w[C['Email'] - 1] + '  |  ' + phone +
    '\n\nDrawn from ' + pool.length + ' eligible entries. Logged in the "Draws" tab.\nRun it again to redraw (previous winners are excluded).',
    ui.ButtonSet.OK);
}

/** Uniform random integer in [0, n) from Google's secure UUID v4 randomness, with rejection sampling (no modulo bias). */
function secureRandomInt(n) {
  var max = 4294967296, limit = max - (max % n);
  for (var tries = 0; tries < 1000; tries++) {
    var x = parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 8), 16);
    if (x < limit) return x % n;
  }
  return Math.floor(Math.random() * n);
}

// ---------------- setup ----------------
function setup() {
  // Safe to run on the prepared Sheet: it only adds what is missing and never clears data or formatting.
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone('Europe/Rome');
  var leads = ensure(ss, LEADS, H);
  leads.getRange(2, C['Disqualified'], Math.max(1, leads.getMaxRows() - 1), 1).insertCheckboxes();
  ensure(ss, GAMES, ['Played at', 'Email', 'Name', 'Score', 'Correct', 'Wrong', 'Plausible']);
  ensure(ss, DRAWS, ['Drawn at', 'Public name', 'Email', 'Phone', 'Full name', 'Company', 'Pool size', 'Forced early', 'Drawn by']);
  if (!ss.getSheetByName(STATS)) {
    var st = ss.insertSheet(STATS);
    st.getRange(1, 1, 3, 2).setValues([
      ['Registered', '=COUNTA(Leads!D2:D)'],
      ['Played at least once', '=COUNTIF(Leads!R2:R,">0")'],
      ['Marketing consent', '=COUNTIF(Leads!N2:N,TRUE)']
    ]);
  }
  try { SpreadsheetApp.getUi().alert('Sheets ready. Now: Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone).'); } catch (e) {}
}
function ensure(ss, name, headers) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getRange(1, 1).getValue() !== headers[0]) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#26202f').setFontColor('#ffffff');
  }
  sh.setFrozenRows(1);
  return sh;
}

// ---------------- helpers ----------------
function sheet(name) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('Missing sheet ' + name + ': run setup()');
  return sh;
}
function dataRows(sh) {
  var n = sh.getLastRow();
  return n < 2 ? [] : sh.getRange(2, 1, n - 1, sh.getLastColumn()).getValues();
}
function findRow(sh, col, value) {
  if (sh.getLastRow() < 2) return 0;
  var cell = sh.getRange(2, col, sh.getLastRow() - 1, 1).createTextFinder(value).matchEntireCell(true).matchCase(false).findNext();
  return cell ? cell.getRow() : 0;
}
function isOpen() { return new Date().getTime() < new Date(CFG.CLOSES_AT).getTime(); }
function excluded(email) {
  var e = String(email).toLowerCase();
  for (var i = 0; i < CFG.EXCLUDE_DOMAINS.length; i++) {
    var suffix = '@' + CFG.EXCLUDE_DOMAINS[i];
    if (e.length >= suffix.length && e.slice(e.length - suffix.length) === suffix) return true;
  }
  return false;
}
function clean(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, '').replace(/^\s+|\s+$/g, '').slice(0, max); }
// Stop formula injection: a leading apostrophe makes Sheets store the value as plain text (and it is not displayed).
function safe(s) { return /^[=+\-@]/.test(s) ? "'" + s : s; }
function unsafe(s) { return String(s == null ? '' : s).replace(/^'/, ''); }
function publicName(f, l) { return unsafe(f) + ' ' + unsafe(l).charAt(0) + '.'; }
function time(v) { return v ? new Date(v).getTime() : 0; }
function colLetter(n) {
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
