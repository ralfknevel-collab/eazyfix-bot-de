// Koppel productnamen die de bot noemt aan de echte productpagina op eazy-fix.de,
// zodat de frontend klikbare "bekijk in webshop"-kaartjes kan tonen.
// Urls komen uit src/kennis.json (via site:pull), dus ze blijven actueel.
// Namen zijn de Duitse EAZYFIX-productnamen; slugs bestaan in de DE-kennis.json.

const PRODUCTS = require('./kennis.json').filter((p) => p.type === 'product');
const bySlug = new Map(PRODUCTS.map((p) => [p.slug, p]));

// Naam-herkenning -> productslug. Specifieke namen vóór algemene.
const RULES = [
  [/premium\s*holzspachtelmasse|holzspachtelmasse/i, 'premium-holzspachtelmasse'],
  [/premium\s*holz\s*feinspachtel|holz\s*feinspachtel|\bfeinspachtel\b/i, 'premium-holz-fein-spachtel'],
  [/holzimpr(ä|ae)gnierung/i, 'eazyfix-holzimpraegnierung-mit-zubehoer'],
  [/holzfeuchtemessger(ä|ae)t|feuchtemessger(ä|ae)t|feuchtigkeitsmesser/i, 'feuchtigkeitsmesser'],
  [/holzf(ä|ae)ule.?fr(ä|ae)ser|\bfr(ä|ae)ser\b/i, 'holzfaeule-fraeser'],
  [/abt(ö|oe)nkonzentrat/i, 'eazyfix-abtonkonzentrate'],
  [/reinigungst(ü|ue)cher/i, 'reinigungstucher-60-stuck'],
  [/erweiterungsset/i, 'eazyfix-holzfaeule-erweiterungsset'],
  [/standardset|starterset|starterpaket/i, 'eazyfix-holzfaeule-standardset'],
  [/all.?in.?one|komplettset|reparaturset/i, 'eazyfix-premium-all-in-one-spachtel'],
];

// De Holzimprägnierung is geen los advies maar verplichte voorbehandeling: hij
// wordt alleen als companion-tegel getoond bij een product dat voorbehandelen
// vereist (Premium Holzspachtelmasse). Sets bevatten de versterker al, dus die niet.
const COMPANION_SLUG = 'eazyfix-holzimpraegnierung-mit-zubehoer';
const NEEDS_VERSTERKER = new Set(['premium-holzspachtelmasse']);

// Geef de producttegel(s) terug als [{ name, url }]. Toon ALLEEN een tegel als
// er precies EEN product geadviseerd wordt: dan is duidelijk wat de klusser
// nodig heeft. Worden er meerdere producten genoemd (opties/vergelijking), dan
// nog geen link. Bij een product dat voorbehandelen vereist komt de
// Houtversterker er als companion bij.
function productsInText(text) {
  if (!text) return [];
  const seen = new Set();
  const hits = [];
  for (const [re, slug] of RULES) {
    const m = re.exec(text);
    if (!m || seen.has(slug)) continue;
    const p = bySlug.get(slug);
    if (!p) continue;
    seen.add(slug);
    hits.push({ slug, name: p.title, url: p.url, pos: m.index });
  }

  // Primaire producten op volgorde van vermelding (companion telt niet mee).
  // Bij meerdere (bv. "Muurvuller ... niet voor hout, gebruik Houtrotvuller/
  // Houtplamuur") tonen we het EERST genoemde = waar het antwoord echt over gaat.
  const primary = hits.filter((h) => h.slug !== COMPANION_SLUG).sort((a, b) => a.pos - b.pos);
  if (primary.length === 0) return [];

  const result = [{ name: primary[0].name, url: primary[0].url }];
  if (NEEDS_VERSTERKER.has(primary[0].slug)) {
    const comp = bySlug.get(COMPANION_SLUG);
    if (comp) result.push({ name: comp.title, url: comp.url });
  }
  return result;
}

module.exports = { productsInText };
