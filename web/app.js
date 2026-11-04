(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const params = new URLSearchParams(location.search);
  const KIOSK = params.has('kiosk');           // booth tablet mode: no remembered player, auto-reset
  const GAME_SECONDS = 60;
  const STORE_KEY = 'zyphe-rush-player';
  let CFG = null, player = null;

  // Form options are built into the page so the form works even before the backend answers.
  // Keep these lists identical to SEGMENTS / ROLES / NEEDS / PROVIDER_OPTIONS in apps-script/Code.gs.
  const OPTIONS = {
    roles: ['Founder / C-level', 'Compliance / MLRO / Risk', 'Product', 'Operations / Payments', 'Engineering / Tech',
      'Sales / BD / Partnerships', 'Marketing / CRM', 'Legal', 'Other'],
    segments: ['Online casino operator', 'Sportsbook / betting operator', 'Land-based casino', 'Lottery / bingo',
      'Payment provider / PSP', 'Fintech / bank / EMI', 'RegTech / compliance provider', 'Game studio / B2B platform supplier',
      'Affiliate / marketing', 'Crypto / Web3 gaming', 'Esports / fantasy / social gaming', 'Regulator / government',
      'Legal / consultancy', 'Investor / VC', 'Media', 'Other'],
    needs: ['KYC', 'KYB', 'AML'],
    providers: ['Yes, and we are happy with it', 'Yes, but we are open to alternatives', 'No, we do it in-house / manually',
      'No, we are looking for one', 'Not sure'],
  };

  // ---------- storage (safe) ----------
  const store = {
    get() { if (KIOSK) return null; try { return JSON.parse(localStorage.getItem(STORE_KEY)); } catch { return null; } },
    set(v) { if (KIOSK) return; try { localStorage.setItem(STORE_KEY, JSON.stringify(v)); } catch {} },
    clear() { try { localStorage.removeItem(STORE_KEY); } catch {} },
  };

  // ---------- screens ----------
  let current = 's-home', prev = 's-home';
  function show(id) {
    prev = current; current = id;
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
    window.scrollTo({ top: 0 });
  }

  // ---------- api ----------
  // Backend = Google Apps Script web app (see apps-script/Code.gs). POST bodies are sent as text/plain so the
  // browser makes a "simple" CORS request (no preflight), which Apps Script supports.
  const API = (window.ZYPHE && window.ZYPHE.API_URL) || '';
  async function api(action, body) {
    if (!/^(https?:|\/)/.test(API)) throw Object.assign(new Error('Game server not configured (web/config.js).'), { data: {} });
    let r;
    try {
      r = body ? await fetch(API, { method: 'POST', body: JSON.stringify(Object.assign({ action }, body)) })
               : await fetch(API + (API.includes('?') ? '&' : '?') + 'action=' + action);
    } catch { throw Object.assign(new Error('No connection. Please try again.'), { data: {} }); }
    const j = await r.json().catch(() => ({ ok: false, error: 'Server error, please try again.' }));
    if (!r.ok || j.ok === false) { const e = new Error(j.error || 'Network error'); e.data = j; e.status = j.code || r.status; throw e; }
    return j;
  }
  async function ensureConfig() {
    if (CFG) return true;
    try { CFG = await api('config'); applyConfig(); return true; } catch (e) { return false; }
  }

  // ---------- init ----------
  async function init() {
    buildForm();
    renderCase($('#demoCase'), ZyCases.next());
    document.querySelectorAll('.demo-stack .case:not(#demoCase)').forEach(el => renderCase(el, ZyCases.next()));
    await ensureConfig(); // also warms up the Apps Script backend
    player = store.get();
    if (player && player.played) $('#btnStart').textContent = `See your result, ${player.firstName} →`;
    else if (player) $('#btnStart').textContent = `Play now, ${player.firstName} →`;
    if (KIOSK) setupKiosk();
  }

  function applyConfig() {
    const close = new Date(CFG.closesAt);
    const closeStr = close.toLocaleString('en-GB', { timeZone: 'Europe/Rome', weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) + ' (Rome time)';
    document.querySelectorAll('.prizeName').forEach(e => e.textContent = CFG.prize);
    document.querySelectorAll('.evName').forEach(e => e.textContent = CFG.eventName);
    document.querySelectorAll('.closeStr').forEach(e => e.textContent = closeStr);
    $('#eventEyebrow').textContent = `Trattoria Zyphe · ${CFG.eventName}`;
    $('#prizeLine').textContent = CFG.open ? `Winner drawn after entries close: ${closeStr}` : 'Entries are closed. Thanks for playing!';
    $('#privacyLink').href = CFG.privacyUrl;
    if (CFG.consent) {
      $('#termsText').textContent = CFG.consent.terms.replace(/^I agree to the prize draw terms and/, '');
      $('#marketingText').textContent = CFG.consent.marketing + (CFG.consent.marketingRequired ? ' *' : ' (Optional)');
    }
    $('#footPrivacy').innerHTML = `<a href="${CFG.privacyUrl}" target="_blank" rel="noopener">Privacy</a> · <a href="#" id="footTerms">Draw terms</a>`;
    $('#footTerms').onclick = e => { e.preventDefault(); show('s-terms'); };
    tickClose();
    setInterval(tickClose, 30000);
  }
  function tickClose() {
    const ms = new Date(CFG.closesAt) - Date.now();
    if (ms <= 0) { $('#closeInfo').innerHTML = 'Draw <b>closed</b>'; document.querySelector('.dot').style.background = 'var(--warn)'; return; }
    const h = Math.floor(ms / 3.6e6), m = Math.floor(ms % 3.6e6 / 6e4);
    $('#closeInfo').innerHTML = `Draw closes in <b>${h >= 24 ? Math.floor(h / 24) + 'd ' + (h % 24) + 'h' : h + 'h ' + m + 'm'}</b>`;
  }
  function fillSelect(sel, items) { for (const it of items) sel.add(new Option(it, it)); }
  function buildForm() {
    fillSelect($('#role'), OPTIONS.roles);
    fillSelect($('#segment'), OPTIONS.segments);
    fillSelect($('#provider'), OPTIONS.providers);
    fillChips($('#needChips'), 'needs', OPTIONS.needs.concat(['None of these']), 'checkbox', true);
  }
  function fillChips(box, name, items, type, need) {
    box.innerHTML = '';
    for (const it of items) {
      const l = document.createElement('label'); l.className = 'chip' + (need ? ' need' : '');
      const i = document.createElement('input'); i.type = type; i.name = name; i.value = it;
      const s = document.createElement('span'); s.textContent = it;
      l.append(i, s); box.append(l);
    }
    if (need) box.addEventListener('change', e => {
      const none = box.querySelector('input[value="None of these"]');
      if (e.target === none && none.checked) box.querySelectorAll('input').forEach(i => { if (i !== none) i.checked = false; });
      else if (e.target !== none && e.target.checked) none.checked = false;
    });
  }

  // ---------- navigation ----------
  $('#btnStart').onclick = async () => {
    if (player && player.played) return showAlreadyPlayed(player.bestScore);
    if (player) return goHowTo();
    if (!CFG) { $('#btnStart').textContent = 'Loading…'; await ensureConfig(); $('#btnStart').textContent = 'Play now →'; }
    $('#formError').textContent = CFG ? '' : 'Can\'t reach the game server. Check your connection and try again.';
    show('s-register'); setTimeout(() => $('#firstName').focus(), 50);
  };
  $('#btnBackHome').onclick = () => show('s-home');
  $('#termsLink').onclick = e => { e.preventDefault(); show('s-terms'); };
  $('#btnTermsBack').onclick = () => show(prev === 's-terms' ? 's-home' : prev);
  $('#role').onchange = () => { $('#roleOtherField').hidden = $('#role').value !== 'Other'; };
  $('#segment').onchange = () => { $('#segmentOtherField').hidden = $('#segment').value !== 'Other'; };
  $('#provider').onchange = () => { $('#providerNameField').hidden = !/^Yes/.test($('#provider').value); };
  $('#btnGo').onclick = () => startGame();
  $('#btnNext').onclick = () => resetForNextPlayer();

  function goHowTo() { $('#helloName').textContent = `Ready, ${player.firstName}?`; show('s-howto'); }

  // ---------- registration ----------
  $('#regForm').addEventListener('submit', async e => {
    e.preventDefault();
    document.querySelectorAll('.field.invalid, .check.invalid').forEach(f => f.classList.remove('invalid'));
    document.querySelectorAll('.err').forEach(f => f.textContent = '');
    $('#formError').textContent = '';
    const val = id => $('#' + id).value.trim();
    const body = {
      firstName: val('firstName'), lastName: val('lastName'), email: val('email'), phone: val('phone'),
      company: val('company'), role: val('role'), roleOther: val('roleOther'),
      segment: val('segment'), segmentOther: val('segmentOther'),
      provider: val('provider'), providerName: /^Yes/.test(val('provider')) ? val('providerName') : '',
      needs: [...document.querySelectorAll('input[name=needs]:checked')].map(i => i.value).filter(v => v !== 'None of these'),
      consentTerms: $('#consentTerms').checked, consentMarketing: $('#consentMarketing').checked,
    };
    const btn = $('#btnRegister'); btn.disabled = true; btn.textContent = 'Checking…';
    try {
      const r = await api('register', body);
      player = { token: r.token, firstName: r.firstName, played: r.plays > 0, bestScore: r.bestScore || 0 };
      store.set(player);
      if (player.played) return showAlreadyPlayed(player.bestScore);
      goHowTo();
    } catch (err) {
      $('#formError').textContent = err.message;
      const fields = (err.data && err.data.fields) || {};
      let first = null;
      for (const [k, msg] of Object.entries(fields)) {
        const input = document.getElementById(k);
        const wrap = input ? input.closest('.field, .check') : document.querySelector(`[data-field="${k}"]`);
        if (!wrap) continue;
        wrap.classList.add('invalid');
        const er = wrap.querySelector('.err'); if (er) er.textContent = msg;
        first = first || wrap;
      }
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } finally { btn.disabled = false; btn.textContent = "Let's play →"; }
  });

  // ---------- rendering ----------
  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function renderCase(el, c) {
    const av = c.emojiAvatar ? `<div class="avatar emoji">${esc(c.avatar)}</div>` : `<div class="avatar" style="background:${c.color}">${esc(c.avatar)}</div>`;
    const label = { KYC: 'KYC · ingredient', KYB: 'KYB · supplier', AML: 'AML · player' }[c.type];
    el.innerHTML = `
      <div class="stamp ok">APPROVED</div><div class="stamp bad">FLAGGED</div>
      <div class="case-head"><span class="tag ${c.type}">${label}</span><span class="case-id">#${esc(c.id)}</span></div>
      <div class="case-title">${av}
        <div><b>${esc(c.title)}</b><span>${esc(c.subtitle)}</span></div></div>
      <ul class="fields">${c.fields.map(f => `<li data-k="${esc(f.k)}"><span>${esc(f.k)}</span><span>${esc(f.v)}</span></li>`).join('')}</ul>`;
    return el;
  }

  // ---------- game ----------
  const G = {};
  const arena = $('#arena');

  function resetGame() {
    Object.assign(G, {
      running: false, score: 0, correct: 0, wrong: 0, streak: 0, bestStreak: 0, agentCharge: 0, agentRuns: 0,
      agentBusy: false, locked: false, current: null, el: null, endAt: 0, missed: [], raf: 0, pot: new Set(), served: 0,
    });
    arena.querySelectorAll('.case, .toast, .float').forEach(n => n.remove());
    $('#alertSlot').innerHTML = '';
    renderPot();
    updateHud();
  }

  async function startGame() {
    if (!player || player.played) return showAlreadyPlayed(player ? player.bestScore : 0);
    resetGame();
    show('s-game');
    await countdown();
    G.running = true;
    G.endAt = performance.now() + GAME_SECONDS * 1000;
    deal();
    loop();
  }

  function countdown() {
    return new Promise(res => {
      const o = document.createElement('div'); o.className = 'countdown'; document.body.append(o);
      let n = 3;
      const step = () => {
        o.innerHTML = `<span>${n > 0 ? n : 'GO'}</span>`;
        if (n-- < 0) { o.remove(); return res(); }
        setTimeout(step, n < 0 ? 450 : 700);
      };
      step();
    });
  }

  function loop() {
    if (!G.running) return;
    const left = Math.max(0, G.endAt - performance.now());
    const s = Math.ceil(left / 1000);
    const t = $('#hudTime'); t.textContent = s; t.classList.toggle('low', s <= 10);
    $('#timebar').style.transform = `scaleX(${left / (GAME_SECONDS * 1000)})`;
    if (left <= 0) return endGame();
    G.raf = requestAnimationFrame(loop);
  }

  function multiplier() { return Math.min(3, 1 + Math.floor(G.streak / 5) * 0.5); }

  const missingIngredient = () => ZyCases.KEYS.find(k => !G.pot.has(k));
  function deal() {
    G.current = ZyCases.next(missingIngredient());
    const el = renderCase(document.createElement('div'), G.current);
    el.className = 'case in';
    arena.append(el);
    G.el = el;
    G.locked = true;
    setTimeout(() => { if (G.el === el) G.locked = false; }, 260); // can't decide before you've seen it
    attachSwipe(el);
  }

  function decide(flag) {
    if (!G.running || G.locked || G.agentBusy || !G.current) return;
    G.locked = true;
    const c = G.current, ok = flag === c.risky, el = G.el;
    el.querySelector(flag ? '.stamp.bad' : '.stamp.ok').style.opacity = 1;
    if (ok) {
      G.streak++; G.bestStreak = Math.max(G.bestStreak, G.streak);
      const pts = Math.round(100 * multiplier());
      G.score += pts; G.correct++;
      G.agentCharge = Math.min(100, G.agentCharge + 15);
      floatText(`+${pts}`, 'var(--ok)', flag);
      if (c.risky) showAlert(c, true);
      else toast(c.ingredient ? `Perfetto! ${c.title} verified` : 'Perfetto! Clean: approved', 'ok');
      if (c.ingredient) addToPot(c.ingredient);
    } else {
      // mistakes hurt: points, clock and agent charge, so button-mashing never pays
      G.streak = 0; G.score = Math.max(0, G.score - 200); G.wrong++;
      G.agentCharge = Math.max(0, G.agentCharge - 25);
      G.endAt -= 3000;
      floatText('−200 · −3s', 'var(--bad)', flag);
      if (c.risky) { const li = el.querySelector(`li[data-k="${cssEsc(c.badKey)}"]`); if (li) li.classList.add('reveal-bad'); }
      if (c.risky) showAlert(c, false);
      else toast('Mamma mia! That one was clean', 'bad');
      G.missed.push(c.risky ? { t: c.title, r: c.reason, type: c.type } : { t: c.title, r: 'was clean (false positive)', type: c.type });
      try { navigator.vibrate && navigator.vibrate(120); } catch {}
    }
    updateHud();
    const delay = ok ? 0 : 1000; // let them read the alert they missed
    setTimeout(() => {
      el.classList.add(flag ? 'out-left' : 'out-right');
      setTimeout(() => el.remove(), 260);
      if (G.running) deal();
    }, delay);
  }
  const cssEsc = s => (window.CSS && CSS.escape ? CSS.escape(s) : s);

  async function deployAgent() {
    if (!G.running || G.agentBusy || G.agentCharge < 100) return;
    G.agentBusy = true; G.agentCharge = 0; G.agentRuns++;
    updateHud();
    const ov = $('#agentOverlay'), log = $('#agentLog');
    log.innerHTML = '<div class="hd">▶ ZYPHE AGENT · auto-resolving queue</div>';
    ov.classList.add('on');
    if (G.el) G.el.remove();
    for (let i = 0; i < 5; i++) {
      const c = i === 0 && G.current ? G.current : ZyCases.next(missingIngredient());
      await wait(230);
      const line = document.createElement('div');
      const ms = (Math.random() * 0.6 + 0.2).toFixed(1);
      line.className = c.risky ? 'bad' : 'ok';
      line.textContent = `${c.type} ${c.title.padEnd(18).slice(0, 18)} ${c.risky ? '⚑ ' + c.reason.split(':')[0] : '✓ verified'} · ${ms}s`;
      log.append(line);
      G.score += 200; G.correct++; G.streak++; G.bestStreak = Math.max(G.bestStreak, G.streak);
      if (c.ingredient) addToPot(c.ingredient);
      updateHud();
      if (!G.running) break;
    }
    const tl = document.createElement('div'); tl.className = 'hd'; tl.style.marginTop = '8px';
    tl.textContent = '5 cases · +1000 pts · that\'s agentic compliance. Nonna approves.'; log.append(tl);
    await wait(650);
    ov.classList.remove('on');
    G.agentBusy = false;
    if (G.running) deal();
  }
  const wait = ms => new Promise(r => setTimeout(r, ms));

  // ---------- the carbonara pot ----------
  function renderPot() {
    // The recipe stays secret: a slot only shows its ingredient once a real one has been verified.
    const label = k => k === 'uova' ? 'Yolks' : k === 'pepe' ? 'Pepper' : k === 'pasta' ? 'Pasta' : ZyCases.AUTHENTIC[k].name.split(' ')[0];
    $('#pot').innerHTML = ZyCases.KEYS.map(k => G.pot.has(k)
      ? `<span class="slot on">${ZyCases.AUTHENTIC[k].emoji}<small>${label(k)}</small></span>`
      : `<span class="slot secret">?<small>secret</small></span>`).join('') +
      `<span class="served">🍝 × <b>${G.served}</b></span>`;
  }
  function addToPot(k) {
    if (G.pot.has(k)) return;
    G.pot.add(k); renderPot();
    if (G.pot.size === ZyCases.KEYS.length) {
      G.served++; G.score += 500; G.pot.clear();
      setTimeout(() => { renderPot(); toast(`🍝 Carbonara servita! +500`, 'agent'); }, 350);
      const pot = $('#pot'); pot.classList.add('done'); setTimeout(() => pot.classList.remove('done'), 900);
    }
  }

  function updateHud() {
    $('#hudScore').textContent = G.score.toLocaleString();
    $('#hudCleared').textContent = G.served;
    const m = multiplier(); $('#hudMult').textContent = m > 1 ? `×${m}` : '';
    const b = $('#btnAgent'); const ready = G.agentCharge >= 100 && !G.agentBusy;
    $('#agentFill').style.height = G.agentCharge + '%';
    b.classList.toggle('ready', ready); b.disabled = !ready;
    $('#agentTxt').innerHTML = G.agentBusy ? 'Agent<br>working…' : ready ? '⚡ DEPLOY<br>Zyphe Agent' : `Zyphe Agent<br>charging ${G.agentCharge}%`;
  }

  function toast(msg, kind) {
    arena.querySelectorAll('.toast').forEach(t => t.remove());
    const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg; arena.append(t);
    setTimeout(() => t.remove(), 1600);
  }
  // Compliance-style screening alert: level, case id, rule that fired, evidence, and the analyst's outcome.
  function showAlert(c, flagged) {
    const slot = $('#alertSlot');
    slot.querySelectorAll('.kyc-alert').forEach(t => t.remove());
    arena.querySelectorAll('.toast').forEach(t => t.remove());
    const a = c.alert;
    const el = document.createElement('div');
    el.className = `kyc-alert ${a.level} ${flagged ? 'flagged' : 'missed'}`;
    el.setAttribute('role', 'status');
    el.innerHTML = `<div class="ka-top"><span class="ka-lvl">${esc(a.level)} alert</span><span class="ka-id">${esc(a.id)}</span>` +
      `<span class="ka-status">${flagged ? '✓ Flagged' : '✕ Missed · escalated'}</span></div>` +
      `<div class="ka-rule">${esc(a.rule)}</div><div class="ka-detail">${esc(a.detail)}</div>`;
    slot.append(el);
    setTimeout(() => el.remove(), flagged ? 2200 : 2800);
  }
  function floatText(txt, color, left) {
    const f = document.createElement('div'); f.className = 'float'; f.textContent = txt; f.style.color = color;
    f.style.top = '40%'; f.style[left ? 'left' : 'right'] = '6%';
    arena.append(f); setTimeout(() => f.remove(), 800);
  }

  // input
  $('#btnFlag').onclick = () => decide(true);
  $('#btnApprove').onclick = () => decide(false);
  $('#btnAgent').onclick = () => deployAgent();
  document.addEventListener('keydown', e => {
    if (current !== 's-game') return;
    if (['ArrowLeft', 'a', 'A', 'f', 'F'].includes(e.key)) { e.preventDefault(); decide(true); }
    else if (['ArrowRight', 'd', 'D', 'j', 'J'].includes(e.key)) { e.preventDefault(); decide(false); }
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); deployAgent(); }
  });
  function attachSwipe(el) {
    let x0 = null, dx = 0, id = null;
    el.addEventListener('pointerdown', e => { if (G.locked) return; x0 = e.clientX; dx = 0; id = e.pointerId; el.setPointerCapture(id); el.style.transition = 'none'; });
    el.addEventListener('pointermove', e => {
      if (x0 === null) return; dx = e.clientX - x0;
      el.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
      el.querySelector('.stamp.ok').style.opacity = Math.max(0, Math.min(1, dx / 90));
      el.querySelector('.stamp.bad').style.opacity = Math.max(0, Math.min(1, -dx / 90));
    });
    const up = () => {
      if (x0 === null) return; x0 = null; el.style.transition = '';
      if (Math.abs(dx) > 80) { el.style.transform = ''; decide(dx < 0); }
      else { el.style.transform = ''; el.querySelectorAll('.stamp').forEach(s => s.style.opacity = 0); }
    };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }

  // ---------- end ----------
  async function endGame() {
    G.running = false; cancelAnimationFrame(G.raf);
    const total = G.correct + G.wrong;
    $('#resScore').textContent = G.score.toLocaleString();
    $('#resAcc').textContent = total ? Math.round(G.correct / total * 100) + '%' : '–';
    $('#resCleared').textContent = total;
    $('#resStreak').textContent = G.bestStreak;
    $('#resAgent').textContent = G.served;
    $('#resTitle').textContent = G.score >= 12000 ? '🏛️ Imperatore della Compliance' : G.score >= 7000 ? '🦅 Senatore MLRO' : G.score >= 3000 ? '🛡️ Centurione' : '🛵 Turista in Trastevere';
    $('#resMissed').innerHTML = G.missed.slice(-4).map(m => `<li><b>${esc(m.type)}</b> ${esc(m.t)}: ${esc(m.r)}</li>`).join('');
    const manualSec = total ? (GAME_SECONDS / Math.max(1, total - G.agentRuns * 5)).toFixed(1) : '–';
    const creamIn = G.missed.filter(m => /Cream|Panna/.test(m.t)).length;
    $('#resPitch').innerHTML = `You served <b>${G.served} carbonara${G.served === 1 ? '' : 's'}</b> at <b>~${manualSec}s per case</b>` +
      (G.wrong ? ` and made <b>${G.wrong} costly call${G.wrong > 1 ? 's' : ''}</b>${creamIn ? ' (yes, you let the cream in. Nonna has been informed)' : ''}` : ', with zero mistakes. Bravissimo') + '. ' +
      `In real life Zyphe's compliance agents run KYC, KYB and AML checks in seconds, around the clock, and send only the real edge cases to your team. <b>Come and see a live demo at our booth.</b>`;
    $('#btnNext').hidden = !KIOSK;
    $('#resEntered').className = 'entered';
    $('#resEnteredTxt').textContent = 'Saving your score…';
    $('#resStats').hidden = false; $('#resPitch').hidden = false; $('#resMissed').hidden = false;
    player.played = true; player.bestScore = G.score; store.set(player);
    show('s-results');
    try {
      const r = await api('score', { token: player.token, score: G.score, correct: G.correct, wrong: G.wrong });
      if (r.alreadyPlayed) { $('#resScore').textContent = r.bestScore.toLocaleString(); player.bestScore = r.bestScore; store.set(player); }
      $('#resBest').textContent = r.alreadyPlayed ? `You had already played: your first game (${r.bestScore.toLocaleString()}) is the one that counts${r.rank ? ` · rank #${r.rank}` : ''}.` : (r.rank ? `Rank #${r.rank} on the leaderboard` : '');
      if (r.eligible) $('#resEnteredTxt').innerHTML = `<b>You're in the draw for the ${esc(CFG ? CFG.prize : 'iPhone')}!</b><br><span class="hint">One game and one entry per person. Good luck!</span>`;
      else { $('#resEntered').classList.add('no'); $('#resEnteredTxt').innerHTML = CFG && !CFG.open ? 'Entries are closed, but thanks for playing!' : 'Thanks for playing! (Zyphe team members aren\'t eligible for the draw.)'; }
      renderBoard(r.leaderboard, r.bestScore);
    } catch (err) {
      if (err.status === 401) { store.clear(); player = null; }
      $('#resEntered').classList.add('no');
      $('#resEnteredTxt').textContent = err.status === 401 ? 'We lost your registration. Please sign up again.' : 'Couldn\'t save your score. Check your connection and ask us at the booth.';
      try { renderBoard((await api('leaderboard')).leaderboard); } catch {}
    }
    if (KIOSK) armKioskReset(60);
  }

  async function showAlreadyPlayed(best) {
    $('#resTitle').textContent = 'You\'ve already played';
    $('#resScore').textContent = (best || 0).toLocaleString();
    $('#resBest').textContent = 'Each person can play once. Your score is on the board below.';
    $('#resStats').hidden = true; $('#resPitch').hidden = true; $('#resMissed').hidden = true;
    $('#resEntered').className = 'entered';
    $('#resEnteredTxt').innerHTML = `<b>You're in the draw for the ${esc(CFG ? CFG.prize : 'iPhone Duo')}.</b><br><span class="hint">The winner is drawn on 5 November after 18:00.</span>`;
    $('#btnNext').hidden = !KIOSK;
    show('s-results');
    try { renderBoard((await api('leaderboard')).leaderboard, best); } catch { renderBoard([]); }
    if (KIOSK) armKioskReset(30);
  }

  function renderBoard(rows, myScore) {
    const b = $('#resBoard');
    if (!rows || !rows.length) { b.innerHTML = '<li class="empty" style="display:block">Be the first on the board!</li>'; return; }
    let marked = false;
    b.innerHTML = rows.map(r => {
      const me = !marked && player && myScore === r.score && r.name.startsWith(player.firstName + ' ');
      if (me) marked = true;
      return `<li class="${me ? 'me' : ''}"><div class="who"><b>${esc(r.name)}</b><span>${esc(r.company)}</span></div><div class="pts">${r.score.toLocaleString()}</div></li>`;
    }).join('');
  }

  // ---------- kiosk ----------
  let kioskTimer = null;
  function armKioskReset(sec) { clearTimeout(kioskTimer); kioskTimer = setTimeout(resetForNextPlayer, sec * 1000); }
  function resetForNextPlayer() {
    clearTimeout(kioskTimer);
    player = null; store.clear();
    $('#regForm').reset(); $('#roleOtherField').hidden = true; $('#segmentOtherField').hidden = true; $('#providerNameField').hidden = true;
    $('#btnStart').textContent = 'Play now →';
    show('s-home');
  }
  function setupKiosk() {
    // idle anywhere but the game for 90s → back to home for the next visitor
    const bump = () => { if (current !== 's-home' && current !== 's-game') armKioskReset(current === 's-results' ? 60 : 90); };
    ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, bump, { passive: true }));
  }

  init();
})();
