(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const API = (window.ZYPHE && window.ZYPHE.API_URL) || '';
  const KEY = 'zyphe-admin-key';
  let key = '', data = null, keepReel = false, timer = null;
  try { key = sessionStorage.getItem(KEY) || ''; } catch {}

  async function call(action, body) {
    const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain', 'X-Admin-Key': key }, body: JSON.stringify(Object.assign({ action }, body || {})) });
    const j = await r.json().catch(() => ({ ok: false, error: 'Server error' }));
    if (!j.ok) { const e = new Error(j.error || 'Error'); e.code = j.code || r.status; throw e; }
    return j;
  }

  $('#loginForm').onsubmit = async e => {
    e.preventDefault(); key = $('#pw').value; $('#loginErr').textContent = '';
    try { await load(); try { sessionStorage.setItem(KEY, key); } catch {} } catch (err) { $('#loginErr').textContent = err.code === 401 ? 'Wrong password' : err.message; }
  };
  $('#btnLogout').onclick = () => { try { sessionStorage.removeItem(KEY); } catch {} location.reload(); };

  async function load() {
    data = await call('admin_summary');
    $('#login').hidden = true; $('#dash').hidden = false; $('#topActions').hidden = false;
    $('#kTotal').textContent = data.total; $('#kPlayed').textContent = data.played; $('#kEligible').textContent = data.eligible;
    $('#kMkt').textContent = data.marketingOptIn; $('#kGames').textContent = data.games;
    const close = new Date(data.closesAt).toLocaleString('en-GB', { timeZone: 'Europe/Rome', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    $('#drawStatus').textContent = data.open ? `Entries open until ${close} (Rome)` : `Entries closed ${close} (Rome) · ready to draw`;
    if (!keepReel) $('#reelSub').textContent = `${data.eligible} eligible ${data.eligible === 1 ? 'entry' : 'entries'} · prize: ${data.prize}`;
    $('#drawLog').innerHTML = data.draws.length ? '<b>Draw log</b><br>' + data.draws.map((d, i) =>
      `#${i + 1} · ${new Date(d.drawn_at).toLocaleString('en-GB', { timeZone: 'Europe/Rome' })} · <b>${esc(d.name)}</b> (${esc(d.company)}) · ${esc(d.email)} · ${esc(d.phone)} · pool ${d.pool_size}${d.forced ? ' · <i>before the close</i>' : ''}`).join('<br>') : '';
    bars('#bSeg', data.bySegment); bars('#bRole', data.byRole); bars('#bProv', data.byProvider); bars('#bNeed', data.byNeed);
    rows();
    clearInterval(timer); timer = setInterval(() => { if (!$('#btnDraw').disabled) load().catch(() => {}); }, 20000);
  }
  function bars(sel, obj) {
    const e = Object.entries(obj || {}).sort((a, b) => b[1] - a[1]); const max = Math.max(1, ...e.map(x => x[1]));
    $(sel).innerHTML = e.length && data.total ? e.map(([k, v]) => `<div><span>${esc(k)}<i style="width:${v / max * 100}%"></i></span><b>${v}</b></div>`).join('') : '<p class="hint">No data yet</p>';
  }
  function rows() {
    const q = $('#q').value.toLowerCase();
    const list = data.entries.filter(e => !q || [e.first_name, e.last_name, e.company, e.email].join(' ').toLowerCase().includes(q));
    $('#rows').innerHTML = list.map(e => `<tr class="${e.disqualified ? 'dq' : ''}">
      <td>${new Date(e.created_at).toLocaleString('en-GB', { timeZone: 'Europe/Rome', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
      <td><b>${esc(e.first_name)} ${esc(e.last_name)}</b>${e.excluded ? ' <span class="hint">(staff)</span>' : ''}</td>
      <td>${esc(e.company)}</td><td>${esc(e.email)}<br>${esc(e.phone)}</td>
      <td>${esc(e.role === 'Other' && e.role_other ? e.role_other : e.role)}<br><span class="hint">${esc(e.segment === 'Other' && e.segment_other ? e.segment_other : e.segment)}</span></td>
      <td>${['KYC', 'KYB', 'AML'].filter(n => e['need_' + n.toLowerCase()]).map(n => `<span class="tag-mini">${n}</span>`).join('') || '–'}${e.marketing ? '<br><span class="hint">✉ consent</span>' : ''}</td>
      <td>${esc(e.provider || '')}${e.provider_name ? `<br><span class="hint">${esc(e.provider_name)}</span>` : ''}</td>
      <td>${e.plays ? Number(e.best_score).toLocaleString() : '<span class="hint">not played</span>'}</td>
      <td><button class="small-btn" data-id="${esc(e.id)}" data-v="${e.disqualified ? 0 : 1}">${e.disqualified ? 'Reinstate' : 'Disqualify'}</button></td></tr>`).join('')
      || '<tr><td colspan="9" class="hint">No leads yet</td></tr>';
  }
  $('#q').oninput = () => data && rows();
  $('#rows').onclick = async e => {
    const b = e.target.closest('button[data-id]'); if (!b) return;
    if (b.dataset.v === '1' && !confirm('Disqualify this entry from the leaderboard and the prize draw?')) return;
    await call('admin_disqualify', { id: b.dataset.id, value: b.dataset.v === '1' }); load();
  };

  $('#btnExport').onclick = async () => {
    const r = await call('admin_export');
    const url = URL.createObjectURL(new Blob([r.csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = r.filename; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  $('#btnDraw').onclick = async () => {
    const btn = $('#btnDraw'), reel = $('#reel');
    if (data.draws.length && !confirm('A winner was already drawn. Draw again? Earlier winners are excluded.')) return;
    btn.disabled = true; reel.classList.remove('final');
    let res;
    try { res = await call('admin_draw', { force: $('#force').checked }); }
    catch (err) { reel.textContent = '⚠️'; $('#reelSub').textContent = err.message; btn.disabled = false; return; }
    // suspense only: the winner was already picked on the server
    const names = data.entries.filter(e => e.plays && !e.excluded && !e.disqualified).map(e => `${e.first_name} ${e.last_name}`);
    for (let i = 0; i < 28; i++) { reel.textContent = names[Math.floor(Math.random() * names.length)] || '…'; await new Promise(r => setTimeout(r, 40 + i * i * 0.35)); }
    reel.textContent = '🎉 ' + res.draw.name; reel.classList.add('final');
    $('#reelSub').textContent = `${res.draw.company} · ${res.draw.email} · ${res.draw.phone}`;
    keepReel = true; btn.disabled = false; setTimeout(load, 1200);
  };

  $('#btnReset').onclick = async () => {
    const phrase = $('#resetConfirm').value.trim();
    if (phrase !== 'DELETE ALL DATA') { $('#resetMsg').textContent = 'Type DELETE ALL DATA exactly to confirm.'; return; }
    if (!confirm('Delete every lead, game and draw? This cannot be undone.')) return;
    try { const r = await call('admin_reset', { confirm: phrase }); $('#resetMsg').textContent = `Done: ${r.deleted} items deleted.`; $('#resetConfirm').value = ''; keepReel = false; $('#reel').textContent = '🎁'; load(); }
    catch (err) { $('#resetMsg').textContent = err.message; }
  };

  if (!/^(https?:|\/)/.test(API)) $('#loginErr').textContent = 'API_URL in config.js is not set.';
  else if (key) load().catch(() => { key = ''; });
})();
