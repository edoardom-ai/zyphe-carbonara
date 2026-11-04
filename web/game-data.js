/* Carbonara Compliance: question engine.
 *
 * Every case comes from the question bank, edited on /admin-questions.html and stored by the API.
 * If the API has no saved bank (or can't be reached), the game uses questions-default.json.
 *
 * Three queues, like a real compliance team:
 *   KYC → ingredients applying to join the carbonara
 *   KYB → suppliers onboarding to the trattoria
 *   AML → diners paying at the trattoria
 *
 * A question: { id, type: KYC|KYB|AML, title, subtitle, avatar, fields: [{k, v}], answer: approve|flag,
 *   level: L1|L2|L3, rule, detail, flagField, ingredient (pot slot for real ingredients), warmup, enabled }
 * In field values, {future} becomes a random date after the event (for "Best before").
 */
(function () {
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const future = () => { const m = pick(['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May']); return `${rnd(1, 28)} ${m} ${m === 'Dec' ? 2026 : 2027}`; };

  // The five pot slots of a real carbonara (used by the pot in the game and by the admin editor).
  const AUTHENTIC = {
    guanciale: { name: 'Guanciale', emoji: '🥓' },
    pecorino: { name: 'Pecorino Romano', emoji: '🧀' },
    uova: { name: 'Egg yolks', emoji: '🥚' },
    pepe: { name: 'Black pepper', emoji: '🫙' },
    pasta: { name: 'Pasta', emoji: '🍝' },
  };
  const KEYS = Object.keys(AUTHENTIC);
  const PALETTE = ['#4fd1ff', '#b18cff', '#ffc857', '#2ee6a6', '#ff9f6e', '#8ab4ff', '#f78fd6'];
  const WARMUP_WRONG = 7;   // wrong ingredients mixed into the opening, next to every real warm-up ingredient
  const INGREDIENTS_FIRST = 12; // the first 12 cards are always recipe (KYC ingredient) questions; suppliers and diners start at card 13
  const P_APPROVE = 0.45;   // after the warm-up: share of cases that should be approved
  const TYPE_WEIGHT = { KYC: 0.65, KYB: 0.15, AML: 0.2 };

  let BANK = [], loaded = false, seq = 100 + rnd(0, 800), dealt = 0, deck = [], bags = {}, lastId = '';
  const API = () => (window.ZYPHE && window.ZYPHE.API_URL) || '';

  async function load() {
    try {
      if (API()) {
        const j = await (await fetch(API() + '?action=questions', { cache: 'no-store' })).json();
        if (j && j.ok && Array.isArray(j.questions) && j.questions.some(q => q.enabled !== false)) { BANK = j.questions; loaded = true; return; }
      }
    } catch (e) { /* fall back below */ }
    try {
      const j = await (await fetch('questions-default.json', { cache: 'no-store' })).json();
      BANK = j.questions || []; loaded = true;
    } catch (e) { if (!BANK.length) BANK = []; }
  }

  const active = () => BANK.filter(q => q.enabled !== false);
  function toCase(q) {
    const id = `${q.type}-${seq++}`;
    const fields = (q.fields || []).map(f => ({ k: f.k, v: String(f.v).replace(/\{future\}/g, future()), bad: q.answer === 'flag' && f.k === q.flagField }));
    const emoji = !!q.avatar && !/^[A-Za-z]{1,3}$/.test(q.avatar);
    const risky = q.answer === 'flag';
    const alert = risky ? { id, level: q.level || 'L1', rule: q.rule || 'Flagged case', detail: q.detail || '' } : null;
    return { id, qid: q.id, type: q.type, title: q.title, subtitle: q.subtitle || '', avatar: q.avatar || (q.title || '?').slice(0, 2).toUpperCase(),
      emojiAvatar: emoji, color: pick(PALETTE), risky, badKey: risky ? q.flagField : null, alert,
      reason: risky ? `${alert.level} · ${alert.rule}: ${alert.detail}` : 'Clean case',
      ingredient: !risky && q.type === 'KYC' && KEYS.includes(q.ingredient) ? q.ingredient : null, fields };
  }

  // Shuffle bag per group: every question comes up once before any repeats.
  function fromBag(name, pool) {
    if (!pool.length) return null;
    let bag = bags[name];
    if (!bag || !bag.length) { bag = bags[name] = shuffle(pool.slice()); if (bag.length > 1 && bag[bag.length - 1].id === lastId) bag.unshift(bag.pop()); }
    const q = bag.pop(); lastId = q.id; return q;
  }

  function buildWarmup() {
    const pool = active().filter(q => q.warmup && q.type === 'KYC');
    const real = [], seen = new Set();
    for (const q of shuffle(pool.filter(q => q.answer === 'approve'))) { const k = q.ingredient || q.id; if (!seen.has(k)) { seen.add(k); real.push(q); } }
    const wrong = shuffle(pool.filter(q => q.answer === 'flag')).slice(0, WARMUP_WRONG);
    return shuffle(real.concat(wrong)).slice(0, INGREDIENTS_FIRST);
  }

  window.ZyCases = {
    AUTHENTIC, KEYS,
    load,
    get ready() { return loaded; },
    /** start of every game: new warm-up, and pick up any edits made on the admin page */
    reset() { dealt = 0; deck = []; bags = {}; load(); },
    /** needKey: an ingredient still missing from the pot, so the engine nudges it in now and then */
    next(needKey) {
      const all = active();
      if (!all.length) return toCase({ id: 'none', type: 'KYC', title: 'No questions yet', subtitle: 'Add some on the admin page', avatar: '🍝', fields: [], answer: 'approve' });
      const n = dealt++;
      if (n === 0) deck = buildWarmup();
      if (n < deck.length) return toCase(deck[n]);
      if (n < INGREDIENTS_FIRST) { // warm-up pool too small: top up with other ingredient questions
        const kyc = all.filter(q => q.type === 'KYC'), want = Math.random() < P_APPROVE ? 'approve' : 'flag';
        const pool = kyc.filter(q => q.answer === want);
        const q = fromBag('kyc-top-' + want, pool.length ? pool : kyc) || fromBag('any', all);
        return toCase(q);
      }

      // pot nudge: sometimes serve the missing real ingredient
      if (needKey && Math.random() < 0.3) {
        const q = fromBag('need-' + needKey, all.filter(q => q.answer === 'approve' && q.ingredient === needKey));
        if (q) return toCase(q);
      }
      const answer = Math.random() < P_APPROVE ? 'approve' : 'flag';
      const types = Object.keys(TYPE_WEIGHT).filter(t => all.some(q => q.type === t && q.answer === answer));
      if (!types.length) return toCase(fromBag('any', all));
      const total = types.reduce((s, t) => s + TYPE_WEIGHT[t], 0);
      let r = Math.random() * total, type = types[0];
      for (const t of types) { r -= TYPE_WEIGHT[t]; if (r <= 0) { type = t; break; } }
      return toCase(fromBag(type + '-' + answer, all.filter(q => q.type === type && q.answer === answer)));
    },
  };
})();
