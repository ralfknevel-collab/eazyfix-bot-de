// Verwijder commerciële tekst uit kennistekst: de bot toont bewust geen prijzen,
// kortingen of (vaak verlopen) acties. Gedeeld door pull-site.js (bij het verversen
// van de snapshot) en scrub-kennis.js (eenmalig opschonen van de bestaande snapshot).

// Inline-bedragen die uit een regel geknipt worden (regel blijft staan).
const PRICE_INLINE = [
  /€\s?\d[\d.,]*/g,
  /\d[\d.,]*\s?€/g,
  /\b\d{1,4}[.,]\d{2}\s?(excl|incl|inkl|euro)?\b/gi,
  /\b\d{1,4}\s?euro\b/gi,
  /\b\d{1,3}\s?%\s?(korting|rabatt)\b/gi,
];

// Regels die in hun geheel weg moeten: kortingen, nieuwsbrief-promo, (verlopen)
// acties en bezorg-/verzendvoorwaarden. Generieke voordeel-taal ("voordeliger dan
// vervangen", "duizenden euro's besparen") blijft staan — dat is geen prijs.
const PROMO_LINE = /rabatt|rabattcode|gutschein|\baktion\b|angebot|newsletter|vatertag|weihnacht|ostern|gl(ü|ue)cksrad|kostenlose(r|s)?\s+(lieferung|versand)|befristete\s+aktion|letzte nachrichten|geld[- ]zur(ü|ue)ck|heute bestellt|morgen (im haus|geliefert)|oder kaufst du (das produkt bei|in einem)|zum webshop|in den warenkorb|nicht vorr(ä|ae)tig|weiterlesen|mehr lesen|paket und spar|bestell(e| jetzt| mehrere)|\bjahre?\s+garantie\b/i;

// Canonieke productregel: houtreparatie is 5–20 mm diep; dieper dan 20 mm = nieuw
// stuk hout verlijmen. Een reparatiediepte-bereik in "cm diep" is dus altijd een
// bron-typefout (mm i.p.v. cm). Corrigeer alleen het diepte-bereik, niet losse
// cm-maten als "ø 2 cm" of "2 cm rondom".
const DEPTH_CM_TYPO = /\b(\d{1,2}\s*(?:und|bis|tot|-|–)\s*\d{1,2})\s*cm(\s+tief)\b/gi;

// Niet-houtherstel pagina's (commercieel/juridisch/organisatie) die buiten de
// botkennis blijven: voorwaarden, betaalmethoden, retour, verzending, privacy,
// cookies, contact, over-ons, vacatures/sollicitatie, nieuwsbrief- en
// trainings-aanmeldingen, gedateerde live-events, de shop-listing en de
// verkooppunten-overzichtspagina (daar is de find_verkooppunt-tool voor). De bot
// verwijst voor deze onderwerpen naar de binnendienst.
const EXCLUDE_PAGE = /\/kundendienst\/|\/agb\b|\/widerruf|\/datenschutz|\/impressum|\/versand|\/zahlung|\/kontakt\/?$|\/(ü|ue|u)ber-(uns|eazyfix)\/?$|\/stellenangebote?\/?$|\/newsletter[^/]*\/?$|\/(ü|ue)ber-(uns|eazyfix)\/?$|\/verkaufsstellen\/?$|\/shop\/?$|-fba\/?$|\/live\/?$/i;

// Slecht gescrapete entries waarvan de titel een kale listing-/navigatielabel is
// (bv. "Shop") i.p.v. een echte product-/paginanaam — die dragen geen bruikbare
// kennis en mogen nooit boven een specifieke productpagina komen.
const LISTING_TITLE = /^(shop|webshop|produkte?|alle produkte|bestseller|startseite|land|men(ü|ue)|warenkorb|kasse|anmelden)$/i;

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

// --- HTML voorbewerken (port eazyfix-bot 3539c46, review 10-11-2026) ---------------
// Cloudflare schermt e-mailadressen af; in de tekst stond 30 keer "[email protected]".
// De Duitse site is nog de oude opzet: de specificaties hebben daar al een label en er
// is geen reviewblok, dus alleen het e-mailadres en de sterrenscore worden aangepakt.
// Cloudflare-afscherming: eerste byte is de sleutel, de rest is het adres (XOR).
function decodeCfEmail(hex) {
  if (!/^([0-9a-f]{2}){2,}$/i.test(hex)) return '';
  const key = parseInt(hex.slice(0, 2), 16);
  let out = '';
  for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
  // In een mailto-link staat soms een gecodeerde spatie (%20) voor het adres.
  out = out.replace(/^(%20|\s)+/i, "").replace(/\?.*$/, "");
  return /^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i.test(out) ? out : '';
}

function restoreEmails(html) {
  return String(html || '')
    .replace(/<a\b[^>]*href="\/cdn-cgi\/l\/email-protection#([0-9a-f]+)"[^>]*>[\s\S]*?<\/a>/gi, (m, hex) => decodeCfEmail(hex) || m)
    .replace(/<(a|span)\b[^>]*data-cfemail="([0-9a-f]+)"[^>]*>[\s\S]*?<\/\1>/gi, (m, tag, hex) => decodeCfEmail(hex) || m);
}

function prepareHtml(html) {
  return restoreEmails(html);
}

// Sterrenscore van productkaartjes ("Bewertet mit 5 von 5") is geen kennis.
const RATING_LINE = /Bewertet mit \d[\d,.]* von \d/i;

function scrubText(text) {
  let t = String(text || '');
  // Reparatiediepte cm→mm typefout corrigeren.
  t = fixDepthUnits(t);
  // Merknaam normaliseren naar EAZYFIX.
  t = normalizeBrand(t);
  // Promo-/prijszinnen verwijderen (zins-niveau, zie dropPromo).
  t = t.split('\n').map(dropPromo).filter((l) => l.length > 0 && !RATING_LINE.test(l)).join('\n');
  // Resterende losse bedragen inline knippen.
  for (const re of PRICE_INLINE) t = t.replace(re, ' ');
  return t.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{2,}/g, '\n').trim();
}

module.exports = { prepareHtml, decodeCfEmail, restoreEmails, RATING_LINE, scrubText, fixDepthUnits, normalizeBrand, isListingJunk, dedupeByUrl, PROMO_LINE, PRICE_INLINE, DEPTH_CM_TYPO, EXCLUDE_PAGE, LISTING_TITLE, BRAND_VARIANT };
