// Parse en strip de machine-tags (FLOW / PRODUCTS) uit een AI-antwoord.
//
// Het model HOORT af te sluiten met twee losse regels:
//   PRODUCTS: 1,5
//   FLOW: houtrot
// Maar in de praktijk lekt het de tags soms als zichtbare regel, bijv:
//   (flow: houtrot · producten: 1, 5)
// Beide vormen halen we hier weg en lezen we uit, zodat er nooit techniek
// onder het antwoord blijft staan (zie feedback rij 7 en 11).

const FLOW_VALUES = ['houtrot', 'klein', 'muur'];

function parseProductIds(val) {
  return val
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s))
    .slice(0, 3);
}

function normaliseFlow(val) {
  const v = val.trim().toLowerCase();
  return FLOW_VALUES.includes(v) ? v : null;
}

function stripTags(raw) {
  let text = typeof raw === 'string' ? raw : '';
  let flow = null;
  let productIds = [];

  // Vorm 1: nette trailing-regels  PRODUCTS: ...  /  FLOW: ...
  // Volgorde-onafhankelijk, case-insensitive, van onderaf afpellen.
  let m;
  while ((m = text.match(/(^|\n)[ \t]*(FLOW|PRODUCTS):[ \t]*([^\n]*)[ \t]*$/i))) {
    const key = m[2].toUpperCase();
    const val = m[3].trim();
    if (key === 'FLOW') {
      const f = normaliseFlow(val);
      if (f) flow = f;
    }
    if (key === 'PRODUCTS') productIds = parseProductIds(val);
    text = text.slice(0, m.index).trimEnd();
  }

  // Vorm 2: gelekte parenthese-tag, bijv "(flow: houtrot · producten: 1, 5)".
  // Waar dan ook in de tekst; NL "producten" of EN "products".
  text = text.replace(/\(\s*flow:[^)]*\)/gi, (match) => {
    const fm = match.match(/flow:\s*([a-z]+)/i);
    if (fm && !flow) {
      const f = normaliseFlow(fm[1]);
      if (f) flow = f;
    }
    const pm = match.match(/produc\w*:\s*([0-9,\s]+)/i);
    if (pm && productIds.length === 0) productIds = parseProductIds(pm[1]);
    return '';
  });

  // Opruimen: gaten van weggehaalde tags en losse witruimte.
  text = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

  return { text, flow, productIds };
}

module.exports = { stripTags };
