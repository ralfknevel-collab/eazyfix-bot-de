// Verwijder commerciële tekst uit kennistekst: de bot toont bewust geen prijzen,
// kortingen of (vaak verlopen) acties. Gedeeld door pull-site.js (bij het verversen
// van de snapshot) en scrub-kennis.js (eenmalig opschonen van de bestaande snapshot).

// Inline-bedragen die uit een regel geknipt worden (regel blijft staan).
const PRICE_INLINE = [
  /€\s?\d[\d.,]*/g,
  /\d[\d.,]*\s?€/g,
  // Eine Uhrzeit ("vor 18.00 Uhr") ist kein Betrag (port eazyfix-bot 66ea2b4).
  /\b\d{1,4}[.,]\d{2}(?!\s?(uur|uhr))\s?(excl|incl|inkl|euro)?\b/gi,
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
// Neue deutsche Seite unter eazy-fix.nl/de/ (JKC, November 2026): Kontakt, Über uns,
// Kundenerfahrung (Bewertungen), Produktcheck (Tool), Verkaufsstellen (Tool), Konto/
// Warenkorb/Kasse, Datenschutz, AGB, Widerruf, Garantieformular und Übersichtsseiten
// sind keine Wissensseiten. Heimwerker-Coach, Reparaturseiten und FAQ schon.
const EXCLUDE_PAGE = /\/kundendienst\/|\/agb\b|\/allgemeine-geschaeftsbedingungen|\/widerruf|\/datenschutz|\/impressum|\/versand|\/zahlung|\/kontakt\/?$|\/(ü|ue|u)ber-(uns|eazyfix)\/?$|\/stellenangebote?\/?$|\/newsletter[^/]*\/?$|\/verkaufsstellen\/?$|\/shop\/?$|-fba\/?$|\/live\/?$|\/kundenerfahrung\/?$|\/produktcheck\/?$|\/mein-konto\/?|\/warenkorb\/?$|\/kasse\/?$|\/cookie[^/]*\/?$|\/garantieformular\/?$|\/retournieren\/?$|\/blog\/?$|\/sortiment\/|\/assortiment\/?$|\/page\/\d+\/?$|\/no-access\/?$|\/privacyverklaring\/?$|\/over-ons\/?$|\/contact\/?$|\/karriere\/?$|\/zielgruppe\/|\/kluswijzer\/?$|\/heimwerker-coach\/?$/i;

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
// ACHTERHAALDE GARANTIECLAIMS. De site sprak van "10 jaar volledige
// succesgarantie op houtreparaties" en "100% succesgarantie op je houtrot
// reparatie". De geldende regeling is een productgarantie: 10 jaar op de
// producteigenschappen van de epoxyproducten, met een claim via het
// garantieformulier. Die juiste formulering staat in kennis-extra.json; de oude
// zinnen moeten hier weg, ook als een nieuwe pull ze terugbrengt, anders belooft
// de bot iets anders dan de binnendienst waarmaakt.
const OUTDATED_CLAIM = /succesgarantie|jaar lang garantie|garantie op je hout|garantie op jouw hout|garantie op houtreparaties|enige merk voor doe-het-zelvers|erfolgsgarantie|garantie auf (deine|ihre) holzreparatur/i;

function dropPromo(line) {
  const weg = (s) => PROMO_LINE.test(s) || OUTDATED_CLAIM.test(s);
  if (!weg(line)) return line;
  return line
    .split(/(?<=[.!?])\s+/)
    .filter((s) => !weg(s))
    .join(' ')
    .trim();
}

// --- HTML voorbewerken (review 10-11-2026) -----------------------------------------
// Vier dingen gingen mis bij het omzetten van de pagina naar tekst:
// 1. Specificaties staan als <dt>label</dt><dd>waarde</dd>. Label en waarde kwamen op
//    aparte regels, en omdat elk product dezelfde labels heeft, gooide het
//    boilerplate-filter de labels weg. Er bleef een kale "Na 2 uur" over, waardoor de
//    bot de droogtijd van de Muurvuller niet durfde te noemen (melding Nina 10-11).
// 2. Cloudflare schermt e-mailadressen af; in de tekst stond "[email protected]".
// 3. Klantreviews (blok ez-reviews) kwamen mee: meningen van anonieme klanten, ook
//    negatieve, horen niet in de productkennis.
// 4. Het contactblok onder blogs (ez-blog-contact) noemt een medewerker bij naam; de
//    bot noemt geen medewerkers (advies Wanbound, 5-8-2026).
const DROP_BLOCKS = ['ez-reviews', 'ez-blog-contact'];

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

// Verwijder elk <section> of <div> dat een van de klassen als los woord draagt, met
// alles erin (geneste tags van dezelfde soort worden meegeteld).
function removeBlocks(html, classes = DROP_BLOCKS) {
  let h = String(html || '');
  const open = new RegExp('<(section|div)\\b[^>]*\\bclass="[^"]*(?<![\\w-])(?:' + classes.join('|') + ')(?![\\w-])[^"]*"[^>]*>', 'i');
  for (let guard = 0; guard < 200; guard++) {
    const m = open.exec(h);
    if (!m) break;
    const tag = m[1].toLowerCase();
    const re = new RegExp('<(/?)' + tag + '\\b[^>]*>', 'gi');
    re.lastIndex = m.index + m[0].length;
    let depth = 1, end = h.length, t;
    while ((t = re.exec(h))) {
      depth += t[1] ? -1 : 1;
      if (depth === 0) { end = re.lastIndex; break; }
    }
    h = h.slice(0, m.index) + ' ' + h.slice(end);
  }
  return h;
}

// <dt>Overschilderbaar</dt><dd>Na 2 uur</dd> -> één regel "Overschilderbaar: Na 2 uur".
function joinSpecs(html) {
  return String(html || '').replace(/<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/gi, (m, label, value) => {
    const kaal = (s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const l = kaal(label), v = kaal(value);
    return l && v ? `<p>${l}: ${v}</p>` : m;
  });
}

function prepareHtml(html) {
  return joinSpecs(removeBlocks(restoreEmails(html)));
}

// Losse labels van productkaartjes zijn geen kennis: kortingslabel ("-8%") en de
// sterrenscore ("Beoordeeld met 4,5 uit 5", "32 reviews").
const DISCOUNT_BADGE = /^(-?\s?\d{1,3}\s?%|Beoordeeld met \d[\d,.]* uit \d|Bewertet mit \d[\d,.]* von \d|\d[\d,.]* Sterne aus \d+ Bewertungen?|\d+ (reviews?|Bewertungen?)|&minus;|−)$/i;
const RATING_LINE = /Bewertet mit \d[\d,.]* von \d/i;

function scrubText(text) {
  let t = String(text || '');
  // Reparatiediepte cm→mm typefout corrigeren.
  t = fixDepthUnits(t);
  // Merknaam normaliseren naar EAZYFIX.
  t = normalizeBrand(t);
  // Promo-/prijszinnen verwijderen (zins-niveau, zie dropPromo).
  t = t.split('\n').map(dropPromo).filter((l) => l.length > 0 && !DISCOUNT_BADGE.test(l.trim())).join('\n');
  // Resterende losse bedragen inline knippen.
  for (const re of PRICE_INLINE) t = t.replace(re, ' ');
  return t.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{2,}/g, '\n').trim();
}

module.exports = { RATING_LINE, prepareHtml, decodeCfEmail, restoreEmails, removeBlocks, joinSpecs, DROP_BLOCKS, scrubText, fixDepthUnits, normalizeBrand, isListingJunk, dedupeByUrl, PROMO_LINE, PRICE_INLINE, DEPTH_CM_TYPO, EXCLUDE_PAGE, LISTING_TITLE, BRAND_VARIANT };
