(function () {
  'use strict';
  // Use a real prize photo if web/prize.png exists; otherwise keep the drawn phones.
  const photo = document.querySelector('.s-prize-photo');
  photo.addEventListener('load', () => { photo.hidden = false; document.querySelector('.device').hidden = true; });
  photo.addEventListener('error', () => photo.remove());

  // Live player counter (screen only; hidden when the API isn't reachable or when printing).
  const API = (window.ZYPHE && window.ZYPHE.API_URL) || '';
  async function tick() {
    try {
      const r = await (await fetch(API + '?action=leaderboard&n=1', { cache: 'no-store' })).json();
      if (r && r.ok && r.players > 0) { document.getElementById('players').textContent = r.players.toLocaleString(); document.getElementById('live').hidden = false; }
    } catch (e) { /* offline: just keep the poster */ }
  }
  if (API) { tick(); setInterval(tick, 30000); }
})();
