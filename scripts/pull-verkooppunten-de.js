// Trek de EAZYFIX-verkooppunten van eazy-fix.de naar src/verkooppunten.json.
//
// BELANGRIJK — waar de adressen vandaan komen:
// De losse /verkooppunten/<slug>/-SEO-pagina's bevatten GEEN adres (alleen een
// naam in de <title>). De ENIGE bron met echte adressen is de Leaflet-kaart op
// /verkaufsstellen/: die vult client-side een JS-object `kaart_data.verkooppunten`
// = array van [popupHTML, lat, lng, categorie]. De popupHTML bevat naam, straat,
// PLZ + plaats, telefoon en website.
//
// Die kaart_data wordt via wp_localize_script runtime ingespoten en zit (door
// LiteSpeed) NIET in de kale HTML of een vaste JS-bundle — je hebt JS-executie
// nodig om erbij te komen. Deze fetch-only-scripts kunnen dat niet betrouwbaar.
// Daarom:
//   - We proberen de kaart_data-array toch te vinden (pagina + JS-bundles), voor
//     als de site 'm ooit inline zet. Lukt dat, dan parsen + schrijven we.
//   - Lukt het NIET (huidige situatie), dan laten we src/verkooppunten.json met
//     RUST (nooit overschrijven met adresloze data) en tonen we hoe je 'm ververst.
//
// Verversen als de fetch faalt (handmatig, eenmalig):
//   Open https://www.eazy-fix.de/verkaufsstellen/ in een browser en draai in de
//   console:  copy(JSON.stringify(kaart_data.verkooppunten))
//   Plak de array en zet 'm met parsePopup() om naar de JSON-vorm hieronder.
//
// Gebruik: node scripts/pull-verkooppunten-de.js

const fs = require('fs');
const path = require('path');

const PAGE = 'https://www.eazy-fix.de/verkaufsstellen/';
const MAP_URL = PAGE;
const TARGET = path.join(__dirname, '..', 'src', 'verkooppunten.json');
const UA = { 'User-Agent': 'EazyfixBot/1.0' };

async function fetchText(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`HTTP ${res.status} voor ${url}`);
  return res.text();
}

function decode(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&amp;/g, '&').replace(/&#0?38;/g, '&')
    .replace(/\s+/g, ' ').trim();
}

// Parse één popupHTML uit kaart_data.verkooppunten naar velden.
function parsePopup(html, lat, lng) {
  const t = String(html).replace(/<br\s*\/?>/gi, '\n');
  const name = decode((t.match(/<h3>([^<]+)<\/h3>/) || [])[1] || '');
  const phone = (t.match(/tel:([+0-9]+)/i) || [])[1] || null;
  const url = (t.match(/href="(https?:\/\/[^"]+)"[^>]*>\s*www/i) || [])[1] || null;
  const det = (t.match(/popover_content_details">([\s\S]*?)<\/p>/) || [])[1] || '';
  const lines = det.replace(/<[^>]+>/g, '').split('\n').map((s) => s.trim()).filter(Boolean);
  const street = lines[0] ? decode(lines[0]) : null;
  const plzCity = lines.find((l) => /^\d{5}\s/.test(l)) || '';
  const zip = (plzCity.match(/^(\d{5})/) || [])[1] || null;
  // PLZ-plaats staat in HOOFDLETTERS op de kaart; naar leesbare hoofdletter-per-woord.
  const cityRaw = plzCity.replace(/^\d{5}\s*/, '').trim();
  const city = cityRaw
    ? decode(cityRaw).toLowerCase().replace(/(^|[\s\-])([a-zäöüß])/g, (_, sep, ch) => sep + ch.toUpperCase())
    : null;
  if (!name) return null;
  return {
    name, street, zip, city, province: null,
    phone: phone ? phone.replace(/^(\+\d{2})(\d+)/, '$1 $2') : null,
    url, page: PAGE, lat: lat != null ? +lat : null, lng: lng != null ? +lng : null, full: name,
  };
}

// Zoek de kaart_data-verkooppunten-array in een stuk tekst (pagina of bundle).
// Vorm: verkooppunten:[["<div class=\"popover_content...>", "50.79", "7.19", "cat"], ...]
function extractFromText(text) {
  if (!/popover_content|kaart_data/.test(text)) return null;
  const m = text.match(/verkooppunten\s*[:=]\s*(\[\s*\[[\s\S]*?\]\s*\])/);
  if (!m) return null;
  try {
    const arr = JSON.parse(m[1]);
    if (Array.isArray(arr) && arr.length) return arr;
  } catch (_) { /* geen schone JSON */ }
  return null;
}

function dedupe(recs) {
  const seen = new Set();
  const out = [];
  for (const r of recs) {
    if (!r) continue;
    const key = [r.name, r.zip, r.street].join('|').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

(async () => {
  const html = await fetchText(PAGE);
  const candidates = [html];
  // Alle LiteSpeed-JS-bundles erbij pakken (voor als de data ooit gebundeld is).
  const bundles = [...html.matchAll(/https:\/\/www\.eazy-fix\.de\/wp-content\/litespeed\/js\/[a-z0-9]+\.js\?ver=[a-z0-9]+/g)]
    .map((x) => x[0]);
  for (const b of [...new Set(bundles)]) {
    try { candidates.push(await fetchText(b)); } catch (_) { /* sla over */ }
  }

  let arr = null;
  for (const c of candidates) { arr = extractFromText(c); if (arr) break; }

  if (!arr) {
    console.error('✗ kaart_data.verkooppunten niet in de HTML/bundles gevonden.');
    console.error('  De data wordt runtime via JS ingespoten; deze fetch-only-pull kan er niet bij.');
    console.error('  src/verkooppunten.json is NIET aangeraakt (geen adresloze overschrijving).');
    console.error('  Ververs handmatig: open ' + PAGE + ' en draai in de console');
    console.error('    copy(JSON.stringify(kaart_data.verkooppunten))');
    console.error('  en zet de array met parsePopup() om (zie kop van dit script).');
    process.exit(1);
  }

  const dealers = dedupe(arr.map((r) => parsePopup(r[0], r[1], r[2])));
  fs.writeFileSync(TARGET, JSON.stringify({
    map_url: MAP_URL,
    source: 'kaart_data.verkooppunten op ' + PAGE,
    verkooppunten: dealers,
  }, null, 2) + '\n');
  console.log(`✓ ${dealers.length} verkooppunten geschreven naar ${path.relative(process.cwd(), TARGET)}`);
})().catch((e) => { console.error('✗', e.message); process.exit(1); });
