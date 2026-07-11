// Trek de EAZYFIX-verkooppunten van eazy-fix.de naar src/verkooppunten.json.
// Anders dan NL heeft eazy-fix.de GEEN overzichtspagina met adressen: de winkels
// laden via een JS-kaart (geen REST, geen embedded adres). Wel zijn er ~35 losse
// /verkooppunten/<slug>/-pagina's; daaruit halen we naam + stad + winkel-URL.
// De bot verwijst voor de kaart naar eazy-fix.de/verkaufsstellen.
// Gebruik: node scripts/pull-verkooppunten-de.js

const fs = require('fs');
const path = require('path');

const SITEMAP = 'https://www.eazy-fix.de/verkooppunten-sitemap.xml';
const MAP_URL = 'https://www.eazy-fix.de/verkaufsstellen/';
const TARGET = path.join(__dirname, '..', 'src', 'verkooppunten.json');
const UA = { 'User-Agent': 'EazyfixBot/1.0' };

async function fetchText(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function decode(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&amp;/g, '&').replace(/&#0?38;/g, '&').replace(/\s+/g, ' ').trim();
}

// Titel "Hornbach Göppingen - EAZYFIX®" -> naam "Hornbach", stad "Göppingen".
// De stad is doorgaans het laatste woord voor " - EAZYFIX".
function parseTitle(html) {
  const raw = decode(((html.match(/<title>([^<]+)/i) || [])[1] || '')
    .replace(/\s*[-|–]\s*EAZYFIX.*$/i, '').replace(/®/g, ''));
  if (!raw) return null;
  // Twee titelvormen op eazy-fix.de:
  //  1) Hornbach-filiaal: "Hornbach <stad> [filiaalnummer]" -> stad afleidbaar.
  //  2) Vakhandel/entiteit: "<bedrijf> GmbH/AG/KG", "HORNBACH Baumarkt AG",
  //     "HORNBACH Webshop DE", "488 Logistikzentrum ..." -> GEEN stad in de titel.
  // De pagina's bevatten geen adres (geen straat/postcode/plaats), dus de titel
  // is de enige bron. Alleen vorm 1 levert een betrouwbare stad; voor vorm 2
  // zetten we city=null zodat de plaats-lookup geen valse match teruggeeft.
  let words = raw.split(' ').filter(Boolean);
  if (words.length > 2 && /^\d+$/.test(words[words.length - 1])) words = words.slice(0, -1);
  const remainder = words.slice(1).join(' ');
  const isBranch = words[0] && words[0].toLowerCase() === 'hornbach' && remainder &&
    !/\b(baumarkt|webshop|logistik|gmbh|ag|kg|co\.?|mbh)\b/i.test(remainder);
  if (isBranch) return { name: words[0], city: remainder, full: raw };
  return { name: raw, city: null, full: raw };
}

async function mapPool(items, fn, size = 6) {
  const res = [];
  let i = 0;
  async function run() {
    while (i < items.length) {
      const idx = i++;
      try { res[idx] = await fn(items[idx]); } catch (e) { res[idx] = null; }
    }
  }
  await Promise.all(Array.from({ length: size }, run));
  return res;
}

(async () => {
  const xml = await fetchText(SITEMAP);
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1])
    .filter(u => /\/verkooppunten\/[^/]+\/?$/.test(u)); // kale /verkooppunten/ overslaan
  console.log(`Verkooppunt-pagina's: ${urls.length}`);

  const recs = await mapPool(urls, async (url) => {
    const t = parseTitle(await fetchText(url));
    if (!t) return null;
    return { name: t.name, street: null, zip: null, city: t.city, province: null, phone: null, url, page: url, full: t.full };
  });

  const seen = new Set();
  const dealers = [];
  for (const r of recs) {
    if (!r || !r.name) continue;
    const key = (r.full || r.name).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    dealers.push(r);
  }
  dealers.sort((a, b) => (a.city || '').localeCompare(b.city || ''));

  fs.writeFileSync(TARGET, JSON.stringify({ map_url: MAP_URL, verkooppunten: dealers }, null, 2) + '\n');
  console.log(`✓ ${dealers.length} verkooppunten geschreven naar ${path.relative(process.cwd(), TARGET)}`);
})().catch((e) => { console.error('✗', e.message); process.exit(1); });
