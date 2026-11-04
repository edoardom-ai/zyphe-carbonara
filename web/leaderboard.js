(function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  $('#host').textContent = location.host;
  const fmt = ms => { const h = Math.floor(ms / 3.6e6), m = Math.floor(ms % 3.6e6 / 6e4); return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${m}m`; };
  async function refresh() {
    try {
      const r = await (await fetch(window.ZYPHE.API_URL + '?action=leaderboard&n=12')).json();
      if (r.ok === false) return;
      $('#players').textContent = r.players;
      $('#prize').textContent = r.prize;
      const ms = new Date(r.closesAt) - Date.now();
      $('#closeInfo').innerHTML = ms > 0 ? `Draw closes in <b>${fmt(ms)}</b>` : 'Draw <b>closed</b>';
      $('#winnerBox').innerHTML = r.winner ? `<div class="winner"><div class="eyebrow">🎉 And the ${esc(r.prize)} goes to</div><div class="name">${esc(r.winner.name)}</div><div class="hint">${esc(r.winner.company)}</div></div>` : '';
      $('#board').innerHTML = r.leaderboard.length
        ? r.leaderboard.map(x => `<li><div class="who"><b>${esc(x.name)}</b><span>${esc(x.company)}</span></div><div class="pts">${x.score.toLocaleString()}</div></li>`).join('')
        : '<li class="empty" style="display:block">No scores yet. Be the first!</li>';
    } catch {}
  }
  refresh(); setInterval(refresh, 15000);
})();
