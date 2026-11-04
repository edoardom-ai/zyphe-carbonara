/* Carbonara Compliance: case generator.
 * Three queues, like a real compliance team:
 *   KYC  → ingredients applying to join the carbonara (identity, origin, expiry, Nonna's sanctions list)
 *   KYB  → suppliers onboarding to the trattoria (owners, registry, licences)
 *   AML  → diners paying at the trattoria (payment monitoring)
 * Each case is clean or carries exactly ONE red flag. */
(function () {
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const eur = n => '€' + n.toLocaleString('en-US');
  // always after the event (Nov 2026), so a clean card never looks expired
  const future = () => { const m = pick(['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May']); return `${rnd(1, 28)} ${m} ${m === 'Dec' ? 2026 : 2027}`; };

  // ---- the five legit carbonara ingredients ----
  const AUTHENTIC = {
    guanciale: { name: 'Guanciale', emoji: '🥓', origin: ['Amatrice, Lazio', 'Norcia, Umbria', 'Roma, Lazio'], cert: 'Cured pork cheek · verified' },
    pecorino: { name: 'Pecorino Romano', emoji: '🧀', origin: ['Lazio', 'Sardegna', 'Grosseto, Toscana'], cert: 'DOP · consortium verified' },
    uova: { name: 'Egg yolks', emoji: '🥚', origin: ['Free-range farm, Lazio', 'Viterbo, Lazio'], cert: 'Grade A · fresh' },
    pepe: { name: 'Black pepper', emoji: '🫙', origin: ['Kerala, India', 'Sarawak, Malaysia'], cert: 'Freshly ground' },
    pasta: { name: 'Rigatoni', alt: ['Spaghetti', 'Rigatoni', 'Mezze maniche', 'Tonnarelli'], emoji: '🍝', origin: ['Gragnano, Campania'], cert: 'Bronze-drawn · IGP' },
  };
  const KEYS = Object.keys(AUTHENTIC);

  // ---- fake / wrong ingredients ----
  // Their paperwork looks clean on purpose: only knowing the real recipe gives them away.
  // sub = substitute for a real ingredient (L1 substitution alert). Otherwise prohibited outright (L2).
  const IMPOSTORS = [
    { name: 'Pancetta', emoji: '🥓', origin: 'Piacenza, Emilia-Romagna', cert: 'Cured pork belly · DOP', sub: 'Guanciale' },
    { name: 'Smoked bacon', emoji: '🥓', origin: 'Cork, Ireland', cert: 'Smoked pork belly · verified', sub: 'Guanciale' },
    { name: 'Prosciutto cotto', emoji: '🍖', origin: 'Parma, Emilia-Romagna', cert: 'Cooked ham · verified', sub: 'Guanciale' },
    { name: 'Parmigiano Reggiano', emoji: '🧀', origin: 'Parma, Emilia-Romagna', cert: 'DOP · consortium verified', sub: 'Pecorino Romano' },
    { name: 'Grana Padano', emoji: '🧀', origin: 'Lodi, Lombardia', cert: 'DOP · consortium verified', sub: 'Pecorino Romano' },
    { name: 'Cheddar', emoji: '🧀', origin: 'Somerset, UK', cert: 'Mature · verified', sub: 'Pecorino Romano' },
    { name: 'Chilli flakes', emoji: '🌶️', origin: 'Calabria', cert: 'Dried · verified', sub: 'Black pepper' },
    { name: 'White pepper', emoji: '🫙', origin: 'Kampot, Cambodia', cert: 'Freshly ground', sub: 'Black pepper' },
    { name: 'Panna (cream)', emoji: '🥛', origin: 'Dairy farm, Lombardia', cert: 'Fresh · 35% fat' },
    { name: 'Butter', emoji: '🧈', origin: 'Normandie, France', cert: 'AOP · verified' },
    { name: 'Garlic', emoji: '🧄', origin: 'Sulmona, Abruzzo', cert: 'Red garlic · verified' },
    { name: 'Onion', emoji: '🧅', origin: 'Tropea, Calabria', cert: 'IGP · verified' },
    { name: 'Peas', emoji: '🫛', origin: 'Frozen, EU', cert: 'Grade A · verified' },
    { name: 'Mushrooms', emoji: '🍄', origin: 'Champignon farm, Veneto', cert: 'Fresh · verified' },
    { name: 'Parsley', emoji: '🌿', origin: 'Garden, Lazio', cert: 'Fresh · verified' },
    { name: 'Pineapple', emoji: '🍍', origin: 'Hawaii, USA', cert: 'Ripe · verified' },
  ];
  // ingredients that make no sense at all: easy flags that make people laugh
  const ABSURD = [
    { name: 'Nutella', emoji: '🍫', origin: 'Alba, Piemonte', cert: 'Hazelnut spread · verified' },
    { name: 'Gummy bears', emoji: '🍬', origin: 'Bonn, Germany', cert: 'Assorted flavours · verified' },
    { name: 'Ketchup', emoji: '🥫', origin: 'Pittsburgh, USA', cert: 'Tomato · verified' },
    { name: 'Sushi', emoji: '🍣', origin: 'Tokyo, Japan', cert: 'Fresh salmon · verified' },
    { name: 'Marshmallows', emoji: '🍡', origin: 'Campfire, USA', cert: 'Extra fluffy · verified' },
    { name: 'Banana', emoji: '🍌', origin: 'Ecuador', cert: 'Ripe · verified' },
    { name: 'Popcorn', emoji: '🍿', origin: 'Cinema, Roma', cert: 'Salted · verified' },
    { name: 'Peanut butter', emoji: '🥜', origin: 'Georgia, USA', cert: 'Crunchy · verified' },
    { name: 'Pickles', emoji: '🥒', origin: 'Gdańsk, Poland', cert: 'Dill · verified' },
    { name: 'Ice cream', emoji: '🍦', origin: 'Gelateria, Trastevere', cert: 'Pistachio · verified' },
    { name: 'Chocolate sprinkles', emoji: '🍫', origin: 'Amsterdam, Netherlands', cert: 'Hagelslag · verified' },
    { name: 'Pineapple pizza', emoji: '🍕', origin: 'Hawaii, USA', cert: 'Controversial · verified' },
  ];

  const FIRST = ['Luca', 'Sofia', 'Matteo', 'Giulia', 'Marco', 'Chiara', 'Lorenzo', 'Francesca', 'Alessandro', 'Elena', 'Davide',
    'Martina', 'Emma', 'Noah', 'Lars', 'Yuki', 'Kwame', 'Priya', 'Omar', 'Freya', 'Andrei', 'Camila', 'Nikos', 'Maja'];
  const LAST = ['Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco', 'Bruno', 'Gallo',
    'Conti', 'De Luca', 'Costa', 'Müller', 'Novak', 'Silva', 'Andersen', 'Tanaka', 'Okafor', 'Petrov', 'Dubois', 'Haddad'];
  const COUNTRIES = ['Italy', 'Malta', 'Germany', 'Spain', 'Sweden', 'Ireland', 'Netherlands', 'Brazil', 'Canada', 'Portugal', 'Greece', 'Poland'];
  const REG_OK = ['Roma', 'Milano', 'Malta', 'Gibraltar', 'Isle of Man', 'Cyprus', 'Ireland', 'Netherlands'];
  const HIGH_RISK = ['North Korea', 'Iran', 'Myanmar'];
  const SUPPLIERS = ['Salumificio Tiberino', 'Caseificio Colosseo', 'Pastificio Trastevere', 'Uova del Gianicolo', 'Spezie dell\'Impero',
    'Forno Testaccio', 'Vini dei Castelli', 'Gladiator Payments', 'Aurelia Game Studio', 'Lupa Affiliates', 'Fontana Media'];
  const SUPPLIER_KIND = ['Food supplier', 'Food supplier', 'Payment provider', 'Game studio', 'Affiliate partner'];
  const NEIGHBOURHOODS = ['Trastevere', 'Testaccio', 'Monti', 'Prati', 'Pigneto', 'San Lorenzo', 'Parioli', 'Garbatella'];
  const PALETTE = ['#4fd1ff', '#b18cff', '#ffc857', '#2ee6a6', '#ff9f6e', '#8ab4ff', '#f78fd6'];

  let seq = 100 + rnd(0, 800);
  const person = () => ({ first: pick(FIRST), last: pick(LAST) });

  // ---------- KYC: ingredients ----------
  function ingredient(needKey, forceKey, forceClean) {
    if (!forceKey && Math.random() < 0.36) return impostor();
    const key = forceKey || (needKey && Math.random() < 0.6 ? needKey : pick(KEYS));
    const a = AUTHENTIC[key];
    const name = a.alt ? pick(a.alt) : a.name;
    const f = { 'Name on label': name, Origin: pick(a.origin), Certificate: a.cert, 'Best before': future(), Screening: 'No hits on Nonna\'s list' };
    // each risk returns [field, level, rule, evidence]
    const risks = {
      guanciale: [
        () => { f['Name on label'] = 'Pancetta affumicata'; return ['Name on label', 'L1', 'Identity mismatch', `Declared: ${name} · On label: Pancetta affumicata`]; },
        () => { f.Origin = pick(['Ohio, USA', 'Unknown, no paperwork']); return ['Origin', 'L1', 'Origin mismatch', `Origin: ${f.Origin} · Expected: Lazio / Umbria`]; },
      ],
      pecorino: [
        () => { f.Origin = pick(['Wisconsin, USA', 'Ontario, Canada']); return ['Origin', 'L2', 'Forged certificate', `DOP claimed · Origin ${f.Origin} is outside the DOP area`]; },
        () => { f['Name on label'] = 'Parmigiano'; return ['Name on label', 'L1', 'Identity mismatch', `Declared: ${name} · On label: Parmigiano`]; },
        () => { f.Certificate = 'DOP · certificate not found'; return ['Certificate', 'L2', 'Document authenticity', 'DOP certificate not found in the consortium registry']; },
      ],
      uova: [
        () => { f['Best before'] = `${pick(['3 weeks', '2 months', '1 year'])} ago`; return ['Best before', 'L1', 'Expired document', `Best before: ${f['Best before']}`]; },
        () => { f['Name on label'] = 'Egg whites only'; return ['Name on label', 'L1', 'Identity mismatch', `Declared: ${name} · On label: Egg whites only`]; },
      ],
      pepe: [
        () => { f['Name on label'] = 'Paprika'; return ['Name on label', 'L1', 'Identity mismatch', `Declared: ${name} · On label: Paprika`]; },
        () => { f.Certificate = 'Pre-ground in 2019'; return ['Certificate', 'L1', 'Stale credentials', 'Ground in 2019 · Freshly ground required']; },
      ],
      pasta: [
        () => { f.Certificate = 'Overcooked · 14 minutes'; return ['Certificate', 'L1', 'Due diligence failed', 'Cooking time 14 min · Al dente limit exceeded']; },
        () => { f['Name on label'] = 'Farfalle'; return ['Name on label', 'L1', 'Identity mismatch', `Declared: ${name} · On label: Farfalle`]; },
      ],
    }[key];
    const generic = [() => { f.Screening = pick(['Match: Nonna\'s watchlist', 'Match: Roman sanctions list']); return ['Screening', 'L2', 'Sanctions hit', `${f.Screening.replace('Match: ', '')} · Match score ${rnd(91, 99)}%`]; }];
    const c = build('KYC', name, 'Applying to join the carbonara', a.emoji, f, risks.concat(generic), forceClean ? 0 : 0.14);
    c.ingredient = c.risky ? null : key;
    c.emojiAvatar = true;
    return c;
  }
  function impostor(absurdOnly) {
    // mostly nonsense ingredients (easy), sometimes a plausible wrong one (pancetta, parmigiano, cream…)
    const im = absurdOnly || Math.random() < 0.6 ? pick(ABSURD) : pick(IMPOSTORS);
    const f = { 'Name on label': im.name, Origin: im.origin, Certificate: im.cert, 'Best before': future(), Screening: 'No hits on Nonna\'s list' };
    const alert = im.sub
      ? { level: 'L1', rule: 'Ingredient substitution', detail: `${im.name} · Not on the approved recipe · Closest approved match: ${im.sub} (${rnd(62, 81)}%)` }
      : { level: 'L2', rule: 'Prohibited ingredient', detail: `${im.name} · On the restricted list for carbonara` };
    const id = `KYC-${seq++}`;
    return { id, type: 'KYC', title: im.name, subtitle: 'Applying to join the carbonara', avatar: im.emoji, emojiAvatar: true,
      color: '#ff5c7a', risky: true, alert: Object.assign({ id }, alert), reason: `${alert.level} · ${alert.rule}: ${alert.detail}`, badKey: 'Name on label',
      fields: Object.entries(f).map(([k, v]) => ({ k, v, bad: k === 'Name on label' })) };
  }

  // ---------- KYB: suppliers ----------
  function supplier() {
    const name = pick(SUPPLIERS) + ' Srl', kind = pick(SUPPLIER_KIND), o = person();
    const f = {
      Registered: `${pick(REG_OK)} · active`,
      'Ultimate owner': `${o.first} ${o.last} (${pick([100, 75, 60, 51])}%)`,
      Directors: `${rnd(2, 4)} verified · no hits`,
      Licence: kind === 'Food supplier' ? 'HACCP · valid' : kind === 'Affiliate partner' ? 'ADM affiliate reg. · valid' : `${pick(['ADM', 'MGA', 'UKGC'])} B2B · valid`,
    };
    const risks = [
      () => { f['Ultimate owner'] = pick(['Undisclosed: nominee shareholders', 'Not provided', 'Bearer shares']); return ['Ultimate owner', 'L2', 'UBO not identified', `Ultimate owner: ${f['Ultimate owner']}`]; },
      () => { const j = pick(HIGH_RISK); f.Registered = `${j} · active`; return ['Registered', 'L2', 'High-risk jurisdiction', `Registered in ${j} · FATF call-for-action list`]; },
      () => { const y = rnd(2021, 2025); f.Registered = `${pick(REG_OK)} · dissolved ${y}`; return ['Registered', 'L1', 'Registry check failed', `Company status: dissolved in ${y}`]; },
      () => { f.Directors = '1 director on OFAC SDN list'; return ['Directors', 'L2', 'Sanctions hit', `Director matched on OFAC SDN list · Match score ${rnd(92, 99)}%`]; },
      () => { const n = rnd(4, 7); f['Ultimate owner'] = `${n} layers of shells via BVI`; return ['Ultimate owner', 'L2', 'Complex ownership structure', `${n} holding layers via BVI · UBO not reachable`]; },
      () => { f.Licence = pick(['Expired 2024', 'Revoked by regulator', 'None held']); return ['Licence', 'L1', 'Licence check failed', `Licence: ${f.Licence}`]; },
    ];
    return build('KYB', name, `${kind} onboarding`, name.split(' ').slice(0, 2).map(w => w[0]).join(''), f, risks, 0.5);
  }

  // ---------- AML: players ----------
  // ---------- AML: diners paying at the trattoria ----------
  function diner() {
    const p = person(), table = rnd(1, 24), area = pick(NEIGHBOURHOODS), bill = rnd(18, 90);
    const f = {
      Customer: `Regular since ${rnd(2018, 2024)} · lives in ${area}`,
      Bill: `${eur(bill)} · ${pick(['1 carbonara + wine', '2 carbonaras + dessert', 'Carbonara for the table', 'Carbonara + supplì'])}`,
      Payment: pick(['Visa · own name', 'Mastercard · own name', 'Satispay · own name', 'Apple Pay · own name', 'Cash at the till']),
      Location: `Dining in · ${area}, Roma`,
    };
    const risks = [
      () => { const n = rnd(7, 12), v = rnd(97, 99) * 100; f.Bill = `${n} bills of ${eur(v)} in cash tonight`; return ['Bill', 'L2', 'Structuring', `${n} × ${eur(v)} in one evening · Just under the €10,000 threshold`]; },
      () => { const d = rnd(3, 9) * 10000, n = Math.round(d / 20), back = d - rnd(2, 9) * 100; f.Bill = `Prepaid ${eur(d)} for ${n.toLocaleString('en-US')} carbonaras, then cancelled`; f.Payment = `Refund of ${eur(back)} requested to another account`; return ['Payment', 'L2', 'Pass-through activity', `In ${eur(d)} · Refund ${eur(back)} to a third-party account · 0 dishes served`]; },
      () => { const n = rnd(5, 8); f.Payment = `${n} cards · ${n} different names`; return ['Payment', 'L1', 'Third-party payments', `One dinner paid with ${n} cards registered to ${n} different cardholders`]; },
      () => { const j = pick(HIGH_RISK); f.Location = `Delivery to ${area} · paid from ${j} via VPN`; return ['Location', 'L1', 'Geolocation mismatch', `Payment IP: ${j} via VPN · Delivery: ${area}, Roma`]; },
      () => { const v = rnd(12, 30) * 10000; f.Bill = `${eur(v)} tasting-menu tab this month · no source of funds`; return ['Bill', 'L2', 'Source of funds missing', `${eur(v)} spent in 30 days · No source of funds documents`]; },
      () => { const v = rnd(4, 9) * 10000; f.Customer = `New customer · first visit today`; f.Bill = `${eur(v)} deposit for a dinner tonight`; return ['Bill', 'L1', 'Velocity rule', `New customer · ${eur(v)} paid within hours of the first booking`]; },
      () => { const n = rnd(20, 60); f.Payment = `${n} coins from the Trevi Fountain`; return ['Payment', 'L1', 'Unusual payment method', `${n} coins recovered from the Trevi Fountain`]; },
    ];
    return build('AML', `Table ${table} · ${p.first} ${p.last.charAt(0)}.`, 'Payment monitoring alert', (p.first[0] + p.last[0]).toUpperCase(), f, risks, 0.5);
  }

  function build(type, title, subtitle, avatar, f, risks, pRisk) {
    const risky = Math.random() < pRisk, id = `${type}-${seq++}`;
    let badKey = null, reason = 'Clean case', alert = null;
    if (risky) {
      const [key, level, rule, detail] = pick(risks)();
      badKey = key; alert = { id, level, rule, detail }; reason = `${level} · ${rule}: ${detail}`;
    }
    return { id, type, title, subtitle, avatar, color: pick(PALETTE), risky, reason, badKey, alert,
      fields: Object.entries(f).map(([k, v]) => ({ k, v, bad: k === badKey })) };
  }

  let last = '', dealt = 0;
  window.ZyCases = {
    AUTHENTIC, KEYS,
    /** call at the start of every game: restarts the warm-up sequence */
    reset() { dealt = 0; last = ''; },
    /** needKey: an ingredient still missing from the pot, so the generator nudges it in */
    next(needKey) {
      // Warm-up: the first five cards are the real recipe, all clean, in order (one carbonara served),
      // then one ingredient that makes no sense, so players learn both buttons in the first seconds.
      const n = dealt++;
      if (n < KEYS.length) return ingredient(null, KEYS[n], true);
      if (n === KEYS.length) return impostor(true);
      const r = Math.random();
      let t = r < 0.65 ? 'KYC' : r < 0.8 ? 'KYB' : 'AML';
      if (t === last && t !== 'KYC' && Math.random() < 0.5) t = 'KYC';
      last = t;
      return t === 'KYC' ? ingredient(needKey) : t === 'KYB' ? supplier() : diner();
    },
  };
})();
