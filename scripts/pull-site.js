// Trek de inhoud van eazy-fix.nl (producten, FAQ, blog) naar src/kennis.json.
// De website is leidend voor de botkennis; dit script ververst de snapshot.
// Gebruik: node scripts/pull-site.js
// Bewust GEEN prijzen: bedragen worden verwijderd (prijzen wijzigen te vaak).

const fs = require('fs');
const path = require('path');
const { scrubText, normalizeBrand, isListingJunk, dedupeByUrl, EXCLUDE_PAGE } = require('./scrub');

const BASE = 'https://www.eazy-fix.nl';
const TARGET = path.join(__dirname, '..', 'src', 'kennis.json');
const CONCURRENCY = 6;

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', '#039': "'", '#39': "'", nbsp: ' ', eacute: 'é', euro: '' };

function decode(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&([a-z0-9#]+);/gi, (m, e) => (e.toLowerCase() in ENT ? ENT[e.toLowerCase()] : m));
}

// Haal leesbare hoofdtekst uit een HTML-pagina; strip chrome en prijzen.
function cleanText(html) {
  let h = html;
  // Alleen de body.
  const body = h.match(/<body[\s\S]*?<\/body>/i);
  if (body) h = body[0];
  // Ruis-blokken verwijderen.
  h = h
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<form[\s\S]*?<\/form>/gi, ' ');
  // Blok-elementen → regeleinden, rest → spatie.
  h = h.replace(/<\/(p|div|li|h[1-6]|tr|section|br)>/gi, '\n').replace(/<[^>]+>/g, ' ');
  h = decode(h);
  // Commerciële tekst (prijzen, kortingen, acties) weghalen.
  h = scrubText(h);
  // Witruimte normaliseren.
  h = h.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{2,}/g, '\n').trim();
  // Boilerplate-regels (menu, cookie, footer-resten) wegfilteren.
  const drop = /^(home|webshop|over eazyfix|klantenservice|verkooppunten|contact|inloggen|winkelmand|zoeken|menu|cookie|account|mijn account|0|€)/i;
  const lines = h.split('\n').map((s) => s.trim())
    .filter((s) => s.length > 2 && !drop.test(s));
  // Dubbele opeenvolgende regels samenvouwen.
  const out = [];
  for (const l of lines) if (out[out.length - 1] !== l) out.push(l);
  return out.join('\n');
}

function title(html) {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) return decode(h1[1].replace(/<[^>]+>/g, '').trim());
  const t = html.match(/<title>([\s\S]*?)<\/title>/i);
  return t ? decode(t[1].replace(/\s*[-|–].*$/, '').trim()) : '';
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function locs(sitemap) {
  const xml = await fetchText(`${BASE}/${sitemap}`);
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

// Pool met beperkte gelijktijdigheid.
async function mapPool(items, fn) {
  const res = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      try { res[idx] = await fn(items[idx], idx); }
      catch (e) { res[idx] = { error: e.message, url: items[idx] }; }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return res;
}

(async () => {
  const [products, pages, posts] = await Promise.all([
    locs('product-sitemap.xml'),
    locs('page-sitemap.xml'),
    locs('post-sitemap.xml'),
  ]);

  // Inhoudspagina's: geen media-uploads, en geen service-/juridische pagina's
  // (voorwaarden, betaalmethoden, retour, verzending, privacy, cookies, contact,
  // over-ons). Die horen niet in de botkennis — hiervoor verwijst de bot naar de
  // binnendienst, en ze vervuilen anders de reparatie-zoekresultaten.
  const contentPages = pages.filter((u) => !/\/wp-content\//i.test(u) && !EXCLUDE_PAGE.test(u));

  const jobs = [
    ...products.map((url) => ({ type: 'product', url })),
    ...contentPages.map((url) => ({ type: 'pagina', url })),
    ...posts.map((url) => ({ type: 'blog', url })),
  ];

  console.log(`Pagina's: ${products.length} producten, ${contentPages.length} pagina's, ${posts.length} blogs → ${jobs.length} totaal`);

  const results = await mapPool(jobs, async (job) => {
    const html = await fetchText(job.url);
    const slug = job.url.replace(/\/$/, '').split('/').pop();
    return { type: job.type, slug, title: normalizeBrand(title(html)), url: job.url, text: cleanText(html) };
  });

  const pages2 = results.filter((r) => r && r.text);
  const failed = results.filter((r) => r && r.error);

  // Boilerplate (menu, country-selector, promo, cookie) staat identiek op bijna
  // elke pagina. Tel regelfrequentie en gooi regels weg die op >=30% voorkomen.
  const freq = new Map();
  for (const p of pages2) for (const l of new Set(p.text.split('\n'))) freq.set(l, (freq.get(l) || 0) + 1);
  const boilerThreshold = Math.max(5, Math.ceil(pages2.length * 0.3));
  const isBoiler = (l) => (freq.get(l) || 0) >= boilerThreshold;
  for (const p of pages2) {
    p.text = p.text.split('\n').filter((l) => !isBoiler(l)).join('\n').replace(/\n{2,}/g, '\n').trim();
  }

  // Listing-/navigatie-junk (titel = kaal label als "Shop") eruit en ontdubbelen
  // op canonieke URL, zodat een dubbele of slecht gescrapete entry niet boven een
  // echte productpagina komt.
  const cleaned = dedupeByUrl(pages2.filter((r) => !isListingJunk(r)));
  const ok = cleaned.filter((r) => r.text && r.text.length > 60);
  ok.sort((a, b) => a.type.localeCompare(b.type) || a.title.localeCompare(b.title));

  fs.writeFileSync(TARGET, JSON.stringify(ok, null, 2) + '\n');
  console.log(`✓ ${ok.length} pagina's geschreven naar ${path.relative(process.cwd(), TARGET)}`);
  if (failed.length) console.log(`⚠ ${failed.length} mislukt: ${failed.map((f) => f.url).join(', ')}`);
})().catch((e) => { console.error('✗', e.message); process.exit(1); });
