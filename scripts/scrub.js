// Verwijder commerciële tekst uit kennistekst: de bot toont bewust geen prijzen,
// kortingen of (vaak verlopen) acties. Gedeeld door pull-site.js (bij het verversen
// van de snapshot) en scrub-kennis.js (eenmalig opschonen van de bestaande snapshot).

// Inline-bedragen die uit een regel geknipt worden (regel blijft staan).
const PRICE_INLINE = [
  /€\s?\d[\d.,]*/g,
  /\b\d{1,4}[.,]\d{2}\s?(excl|incl|euro)?\b/gi,
  /\b\d{1,4}\s?euro\b/gi,
  /\b\d{1,3}\s?%\s?korting\b/gi,
];

// Regels die in hun geheel weg moeten: kortingen, nieuwsbrief-promo, (verlopen)
// acties en bezorg-/verzendvoorwaarden. Generieke voordeel-taal ("voordeliger dan
// vervangen", "duizenden euro's besparen") blijft staan — dat is geen prijs.
const PROMO_LINE = /korting|kortingscode|\bactie\b|aanbieding|nieuwsbrief|vaderdagactie|kerstactie|paasactie|prijzenrad|gratis\s+(bezorging|verzending)|tijdelijke\s+actie|recente berichten|niet goed geld terug|vandaag besteld|morgen in huis|of koop (het product bij|in een winkel)|bekijk de pakketten|pakket en bespaar|bestel (meerdere|één of meerdere|nu)|\bjaar (complete )?garantie\b/i;

// Canonieke productregel: houtreparatie is 5–20 mm diep; dieper dan 20 mm = nieuw
// stuk hout verlijmen. Een reparatiediepte-bereik in "cm diep" is dus altijd een
// bron-typefout (mm i.p.v. cm). Corrigeer alleen het diepte-bereik, niet losse
// cm-maten als "ø 2 cm" of "2 cm rondom".
const DEPTH_CM_TYPO = /\b(\d{1,2}\s*(?:en|tot|-|–)\s*\d{1,2})\s*cm(\s+diep)\b/gi;

// Niet-houtherstel pagina's (commercieel/juridisch/organisatie) die buiten de
// botkennis blijven: voorwaarden, betaalmethoden, retour, verzending, privacy,
// cookies, contact, over-ons, vacatures/sollicitatie, nieuwsbrief- en
// trainings-aanmeldingen, gedateerde live-events, de shop-listing en de
// verkooppunten-overzichtspagina (daar is de find_verkooppunt-tool voor). De bot
// verwijst voor deze onderwerpen naar de binnendienst.
const EXCLUDE_PAGE = /\/klantenservice\/|\/over-eazyfix\/?$|\/solliciteren\/?$|\/vacatures[^/]*\/?$|\/aanmelden-nieuwsbrief\/?$|\/aanmelden-online-training\/?$|\/live\/?$|\/shop\/?$|\/overzicht-verkooppunten\/?$/i;

// Slecht gescrapete entries waarvan de titel een kale listing-/navigatielabel is
// (bv. "Shop") i.p.v. een echte product-/paginanaam — die dragen geen bruikbare
// kennis en mogen nooit boven een specifieke productpagina komen.
const LISTING_TITLE = /^(shop|webshop|producten?|alle producten|bestsellers|land|menu|winkelmand|inloggen)$/i;

function isListingJunk(p) {
  return LISTING_TITLE.test(String((p && p.title) || '').trim());
}

// Ontdubbel op canonieke URL (zonder trailing slash); houd per URL de entry met
// de langste tekst (meeste echte inhoud).
function dedupeByUrl(entries) {
  const best = new Map();
  for (const p of entries) {
    const key = String(p.url || '').replace(/\/+$/, '').toLowerCase();
    const cur = best.get(key);
    if (!cur || (p.text || '').length > (cur.text || '').length) best.set(key, p);
  }
  // Behoud de oorspronkelijke volgorde van de gekozen entries.
  const chosen = new Set(best.values());
  return entries.filter((p) => chosen.has(p));
}

function fixDepthUnits(text) {
  return String(text || '').replace(DEPTH_CM_TYPO, '$1 mm$2');
}

// Merknaam in zichtbare tekst altijd EAZYFIX (hoofdletters). De lookahead spaart
// URLs/domeinen (eazy-fix.nl) en slugs (eazyfix-houtversterker): die zijn
// hoofdlettergevoelig en mogen niet veranderen.
const BRAND_VARIANT = /\bEazy-?fix\b(?![\w./@-])/gi;

function normalizeBrand(text) {
  return String(text || '').replace(BRAND_VARIANT, 'EAZYFIX');
}

// Verwijder promo-tekst op zins-niveau. Sitekennis staat blok-per-regel (een
// promo-regel verdwijnt dan in zijn geheel), maar video-samenvattingen zijn één
// lopende alinea — dan mag alleen de promo-zin sneuvelen, niet de hele alinea met
// reparatiefeiten. Splits daarom per regel in zinnen en gooi enkel de promo-zinnen weg.
function dropPromo(line) {
  if (!PROMO_LINE.test(line)) return line;
  return line
    .split(/(?<=[.!?])\s+/)
    .filter((s) => !PROMO_LINE.test(s))
    .join(' ')
    .trim();
}

function scrubText(text) {
  let t = String(text || '');
  // Reparatiediepte cm→mm typefout corrigeren.
  t = fixDepthUnits(t);
  // Merknaam normaliseren naar EAZYFIX.
  t = normalizeBrand(t);
  // Promo-/prijszinnen verwijderen (zins-niveau, zie dropPromo).
  t = t.split('\n').map(dropPromo).filter((l) => l.length > 0).join('\n');
  // Resterende losse bedragen inline knippen.
  for (const re of PRICE_INLINE) t = t.replace(re, ' ');
  return t.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{2,}/g, '\n').trim();
}

module.exports = { scrubText, fixDepthUnits, normalizeBrand, isListingJunk, dedupeByUrl, PROMO_LINE, PRICE_INLINE, DEPTH_CM_TYPO, EXCLUDE_PAGE, LISTING_TITLE, BRAND_VARIANT };
