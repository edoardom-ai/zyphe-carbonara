(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const API = (window.ZYPHE && window.ZYPHE.API_URL) || '';
  const KEY = 'zyphe-admin-key'; // shared with admin.html, so one login covers both pages
  const TAG = { KYC: 'KYC · ingredient', KYB: 'KYB · supplier', AML: 'AML · diner' };
  const POT = { guanciale: 'Guanciale', pecorino: 'Pecorino Romano', uova: 'Egg yolks', pepe: 'Black pepper', pasta: 'Pasta' };
  const SUB = { KYC: 'Applying to join the carbonara', KYB: 'Supplier onboarding', AML: 'Payment monitoring alert' };
  const LINES = { KYC: ['Name on label', 'Origin', 'Certificate', 'Best before', 'Screening'], KYB: ['Registered', 'Ultimate owner', 'Directors', 'Licence'], AML: ['Customer', 'Bill', 'Payment', 'Location'] };
  let key = '', list = [], usingDefaults = false, dirty = false, editing = null;
  try { key = sessionStorage.getItem(KEY) || ''; } catch {}

  async function call(action, body) {
    const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain', 'X-Admin-Key': key }, body: JSON.stringify(Object.assign({ action }, body || {})) });
    const j = await r.json().catch(() => ({ ok: false, error: 'Server error' }));
    if (!j.ok) { const e = new Error(j.error || 'Error'); e.code = j.code || r.status; throw e; }
    return j;
  }

  // ---------- login ----------
  $('#loginForm').onsubmit = async e => {
    e.preventDefault(); key = $('#pw').value; $('#loginErr').textContent = '';
    try { await load(); try { sessionStorage.setItem(KEY, key); } catch {} } catch (err) { $('#loginErr').textContent = err.code === 401 ? 'Wrong password' : err.message; }
  };
  $('#btnLogout').onclick = () => { try { sessionStorage.removeItem(KEY); } catch {} location.href = 'admin.html'; };

  async function load() {
    const r = await call('admin_questions_get');
    if (Array.isArray(r.questions)) { list = r.questions; usingDefaults = false; }
    else { list = (await (await fetch('questions-default.json', { cache: 'no-store' })).json()).questions; usingDefaults = true; }
    $('#login').hidden = true; $('#dash').hidden = false; $('#topActions').hidden = false;
    setDirty(false); render();
  }

  // ---------- list ----------
  function counts() {
    const on = list.filter(q => q.enabled !== false);
    const c = f => on.filter(f).length;
    $('#counts').innerHTML = `<b>${on.length}</b> switched on of ${list.length} · ` +
      `KYC <b>${c(q => q.type === 'KYC')}</b> · KYB <b>${c(q => q.type === 'KYB')}</b> · AML <b>${c(q => q.type === 'AML')}</b> · ` +
      `approve <b>${c(q => q.answer === 'approve')}</b> · flag <b>${c(q => q.answer === 'flag')}</b> · ` +
      `warm-up: <b>${c(q => q.warmup && q.answer === 'approve')}</b> real, <b>${c(q => q.warmup && q.answer === 'flag')}</b> wrong`;
    $('#source').textContent = usingDefaults ? 'Using the default questions (not edited yet)' : 'Using your saved questions';
  }
  const isEmoji = a => !!a && !/^[A-Za-z]{1,3}$/.test(a);
  function render() {
    counts();
    const q = $('#q').value.toLowerCase(), ft = $('#fType').value, fa = $('#fAnswer').value, fl = $('#fLevel').value, fw = $('#fWarm').checked;
    const rows = list.map((x, i) => [x, i]).filter(([x]) => (!ft || x.type === ft) && (!fa || x.answer === fa) && (!fl || x.level === fl) && (!fw || x.warmup) &&
      (!q || [x.title, x.subtitle, x.rule, x.detail, ...(x.fields || []).map(f => f.k + ' ' + f.v)].join(' ').toLowerCase().includes(q)));
    $('#rows').innerHTML = rows.map(([x, i]) => `<tr class="${x.enabled === false ? 'off' : ''}">
      <td><input type="checkbox" data-on="${i}" ${x.enabled !== false ? 'checked' : ''} aria-label="Switched on"></td>
      <td>${x.type === 'KYC' ? `<input type="checkbox" data-warm="${i}" ${x.warmup ? 'checked' : ''} aria-label="In warm-up">` : '<span class="hint">–</span>'}</td>
      <td><div class="qcard"><div class="qav ${isEmoji(x.avatar) ? 'emoji' : ''}">${esc(x.avatar || '?')}</div><div><b>${esc(x.title)}</b><span>${esc((x.fields || []).slice(x.type === 'KYC' ? 1 : 0, x.type === 'KYC' ? 3 : 2).map(f => f.v).join(' · ').replace(/\{future\}/g, 'date'))}</span></div></div></td>
      <td><span class="badge t">${x.type}</span></td>
      <td><span class="badge ${x.answer}">${x.answer === 'flag' ? '✕ Flag' : '✓ Approve'}</span></td>
      <td>${x.answer === 'flag' ? `<span class="badge ${esc(x.level)}">${esc(x.level)}</span> ${esc(x.rule)}` : (x.ingredient ? `<span class="hint">fills the pot: ${esc(POT[x.ingredient] || x.ingredient)}</span>` : '<span class="hint">–</span>')}</td>
      <td class="row-actions"><button class="small-btn" data-edit="${i}">Edit</button><button class="small-btn" data-dup="${i}">Duplicate</button><button class="small-btn del" data-del="${i}">Delete</button></td>
    </tr>`).join('') || '<tr><td colspan="7" class="hint">No questions match these filters</td></tr>';
  }
  ['#q', '#fType', '#fAnswer', '#fLevel', '#fWarm'].forEach(s => $(s).addEventListener('input', render));
  $('#rows').addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.on) { list[+t.dataset.on].enabled = t.checked; setDirty(true); render(); }
    if (t.dataset.warm) { list[+t.dataset.warm].warmup = t.checked; setDirty(true); render(); }
  });
  $('#rows').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.edit) openEditor(+b.dataset.edit);
    if (b.dataset.dup) { const i = +b.dataset.dup; const c = JSON.parse(JSON.stringify(list[i])); c.id = newId(); c.title += ' (copy)'; list.splice(i + 1, 0, c); setDirty(true); render(); }
    if (b.dataset.del) { const i = +b.dataset.del; if (confirm(`Delete "${list[i].title}"?`)) { list.splice(i, 1); setDirty(true); render(); } }
  });
  const newId = () => 'q-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  function setDirty(v) {
    dirty = v; $('#btnSave').disabled = !v;
    const m = $('#saveMsg'); m.className = 'savebar' + (v ? ' dirty' : '');
    m.textContent = v ? 'You have unsaved changes. Click "Save changes" to put them in the game.' : '';
  }
  window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  $('#btnSave').onclick = async () => {
    const m = $('#saveMsg'); $('#btnSave').disabled = true; m.textContent = 'Saving…';
    try { const r = await call('admin_questions_save', { questions: list }); usingDefaults = false; setDirty(false); m.className = 'savebar ok'; m.textContent = `Saved ${r.saved} questions. New games use them right away.`; await load(); m.className = 'savebar ok'; m.textContent = `Saved ${r.saved} questions. New games use them right away.`; }
    catch (err) { m.className = 'savebar err'; m.textContent = err.message; $('#btnSave').disabled = false; }
  };
  $('#btnDefaults').onclick = async () => {
    if (!confirm('Throw away your edits and go back to the default questions?')) return;
    await call('admin_questions_reset'); await load(); const m = $('#saveMsg'); m.className = 'savebar ok'; m.textContent = 'Default questions restored.';
  };

  // ---------- editor ----------
  $('#btnAdd').onclick = () => openEditor(-1);
  function openEditor(i) {
    editing = i;
    const q = i >= 0 ? JSON.parse(JSON.stringify(list[i])) : { type: 'KYC', title: '', subtitle: SUB.KYC, avatar: '', answer: 'flag', level: 'L1', rule: '', detail: '', flagField: 'Name on label',
      ingredient: '', warmup: false, enabled: true, fields: LINES.KYC.map(k => ({ k, v: k === 'Best before' ? '{future}' : k === 'Screening' ? "No hits on Nonna's list" : '' })) };
    $('#edTitle').textContent = i >= 0 ? 'Edit question' : 'New question';
    $('#eType').value = q.type; $('#eTitle').value = q.title; $('#eSub').value = q.subtitle || ''; $('#eAvatar').value = q.avatar || '';
    document.querySelectorAll('input[name=eAnswer]').forEach(r => r.checked = r.value === q.answer);
    $('#eIngredient').value = q.ingredient || ''; $('#eLevel').value = q.level || 'L1'; $('#eRule').value = q.rule || ''; $('#eDetail').value = q.detail || '';
    $('#eWarm').checked = !!q.warmup; $('#eOn').checked = q.enabled !== false;
    $('#eFields').innerHTML = ''; (q.fields || []).forEach(f => addLine(f.k, f.v));
    refreshFlagField(q.flagField); sync(); $('#edErr').textContent = '';
    $('#editor').hidden = false; setTimeout(() => $('#eTitle').focus(), 30);
  }
  function addLine(k = '', v = '') {
    if ($('#eFields').children.length >= 8) return;
    const d = document.createElement('div'); d.className = 'efield';
    d.innerHTML = `<input class="fk" maxlength="40" placeholder="Label, e.g. Origin" value="${esc(k)}"><input class="fv" maxlength="120" placeholder="Value, e.g. Amatrice, Lazio" value="${esc(v)}"><button type="button" class="small-btn del" aria-label="Remove line">✕</button>`;
    d.querySelector('button').onclick = () => { d.remove(); refreshFlagField(); sync(); };
    $('#eFields').append(d);
  }
  $('#eAddField').onclick = () => { addLine(); refreshFlagField(); sync(); };
  const lines = () => [...$('#eFields').children].map(d => ({ k: d.querySelector('.fk').value.trim(), v: d.querySelector('.fv').value.trim() })).filter(f => f.k);
  function refreshFlagField(want) {
    const cur = want !== undefined ? want : $('#eFlagField').value;
    $('#eFlagField').innerHTML = '<option value="">(none)</option>' + lines().map(f => `<option ${f.k === cur ? 'selected' : ''}>${esc(f.k)}</option>`).join('');
  }
  $('#eType').onchange = () => {
    const t = $('#eType').value, sub = $('#eSub');
    if (!sub.value || Object.values(SUB).includes(sub.value)) sub.value = SUB[t];
    if (!lines().some(f => f.v)) { $('#eFields').innerHTML = ''; LINES[t].forEach(k => addLine(k, k === 'Best before' ? '{future}' : '')); refreshFlagField(); }
    sync();
  };
  $('#edForm').addEventListener('input', e => { if (e.target.classList.contains('fk')) refreshFlagField(); sync(); });
  const answer = () => (document.querySelector('input[name=eAnswer]:checked') || {}).value || 'approve';
  function current() {
    const t = $('#eType').value, a = answer();
    return { id: editing >= 0 ? list[editing].id : newId(), type: t, title: $('#eTitle').value.trim(), subtitle: $('#eSub').value.trim(), avatar: $('#eAvatar').value.trim(),
      fields: lines(), answer: a, level: a === 'flag' ? $('#eLevel').value : '', rule: a === 'flag' ? $('#eRule').value.trim() : '',
      detail: a === 'flag' ? $('#eDetail').value.trim() : '', flagField: a === 'flag' ? $('#eFlagField').value : '',
      ingredient: a === 'approve' && t === 'KYC' ? $('#eIngredient').value : '', warmup: t === 'KYC' && $('#eWarm').checked, enabled: $('#eOn').checked };
  }
  function sync() {
    const q = current();
    $('#eApprove').hidden = !(q.answer === 'approve' && q.type === 'KYC'); $('#eFlag').hidden = q.answer !== 'flag';
    $('#eWarm').closest('label').hidden = q.type !== 'KYC';
    const av = q.avatar || (q.title || '?').slice(0, 2).toUpperCase();
    $('#pCard').innerHTML = `<div class="case"><div class="case-head"><span class="tag ${q.type}">${TAG[q.type]}</span><span class="case-id">#${q.type}-123</span></div>
      <div class="case-title"><div class="avatar ${isEmoji(q.avatar) ? 'emoji' : ''}">${esc(av)}</div><div><b>${esc(q.title || 'Title')}</b><span>${esc(q.subtitle)}</span></div></div>
      <ul class="fields">${q.fields.map(f => `<li class="${q.answer === 'flag' && f.k === q.flagField ? 'reveal-bad' : ''}"><span>${esc(f.k)}</span><span>${esc(f.v.replace(/\{future\}/g, '12 Feb 2027'))}</span></li>`).join('')}</ul></div>`;
    $('#pAlert').innerHTML = q.answer === 'flag'
      ? `<div class="kyc-alert ${esc(q.level)} flagged"><div class="ka-top"><span class="ka-lvl">${esc(q.level)} alert</span><span class="ka-id">${q.type}-123</span><span class="ka-status">✓ Flagged</span></div><div class="ka-rule">${esc(q.rule || 'Rule that fired')}</div><div class="ka-detail">${esc(q.detail || 'Evidence')}</div></div>`
      : `<p class="hint">Clean case: players should approve it.${q.ingredient ? ` Approving it fills the pot slot "${esc(POT[q.ingredient] || q.ingredient)}".` : ''}</p>`;
  }
  const close = () => { $('#editor').hidden = true; editing = null; };
  $('#edClose').onclick = close; $('#edCancel').onclick = close;
  $('#editor').addEventListener('click', e => { if (e.target.id === 'editor') close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#editor').hidden) close(); });
  $('#edForm').onsubmit = e => {
    e.preventDefault();
    const q = current();
    if (!q.title) { $('#edErr').textContent = 'Give the question a title.'; return; }
    if (q.answer === 'flag' && !q.rule) { $('#edErr').textContent = 'A flagged question needs the rule that fired (shown in the alert).'; return; }
    if (editing >= 0) list[editing] = q; else list.unshift(q);
    setDirty(true); close(); render();
  };

  if (!/^(https?:|\/)/.test(API)) $('#loginErr').textContent = 'API_URL in config.js is not set.';
  else if (key) load().catch(() => { key = ''; });
})();
