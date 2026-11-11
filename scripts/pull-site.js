// Trek de inhoud van de Duitse EAZYFIX-site naar src/kennis.json.
// Sinds november 2026 staat de Duitse site onder https://www.eazy-fix.nl/de/ (JKC).
// De website is leidend voor de botkennis; dit script ververst de snapshot.
// Gebruik: node scripts/pull-site.js
//          EZ_PREVIEW=<token> node scripts/pull-site.js   (zolang /de/ alleen als preview bestaat)
//          SITE_BASE=https://www.eazy-fix.de node scripts/pull-site.js   (oude site)
// De Duitse pagina's staan (nog) niet in de sitemap; daarom loopt het script ook de
// links vanaf de startpagina af (alleen binnen /de/).
// Bewust GEEN prijzen: bedragen worden verwijderd (prijzen wijzigen te vaak).

const fs = require('fs');
const path = require('path');
const { scrubText, prepareHtml, normalizeBrand, isListingJunk, dedupeByUrl, EXCLUDE_PAGE, removeBlocks } = require('./scrub');
const { resolveSiteBase, sitemapsFromIndex, isGermanUrl, crawlCandidates, typeOf } = require('./site-config');

// Bron: SITE_BASE in de omgeving, anders https://www.eazy-fix.nl/de.
const BASE = resolveSiteBase();
const ORIGIN = new URL(BASE).origin;
// KENNIS_OUT: schrijf naar een ander bestand, om oud en nieuw te vergelijken vóór het vervangen.
const TARGET = process.env.KENNIS_OUT || path.join(__dirname, '..', 'src', 'kennis.json');
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
  // E-mailadressen herstellen, reviews en contactblok weg, specificaties op één regel.
  h = prepareHtml(h);
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
  const drop = /^(startseite|home|webshop|shop|über eazyfix|über uns|kundenservice|kundendienst|verkaufsstellen|verkooppunten|kontakt|anmelden|einloggen|warenkorb|suchen|suche|menü|menu|cookie|konto|mein konto|0|€)/i;
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

const UA = 'Mozilla/5.0 (compatible; EAZYFIX-bot kennis-pull; +https://eazy-fix.nl)';
// Preview-cookie: de site zet hem bij een bezoek met ?ez_preview=<token>.
let COOKIE = '';
async function previewCookie() {
  const token = String(process.env.EZ_PREVIEW || '').trim();
  if (!token) return;
  const res = await fetch(`${BASE}/?ez_preview=${encodeURIComponent(token)}`, { headers: { 'User-Agent': UA }, redirect: 'manual' });
  const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie') || ''];
  COOKIE = set.map((c) => c.split(';')[0]).filter((c) => /^ez_lang_preview=/.test(c)).join('; ');
  if (!COOKIE) throw new Error('EZ_PREVIEW gaf geen preview-cookie (token verlopen?)');
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, ...(COOKIE ? { Cookie: COOKIE } : {}) } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function fetchMaybe(url) {
  try { return await fetchText(url); } catch { return null; }
}

// Vind de product-, pagina- en blogsitemaps. Eerst via een sitemap-index
// (WordPress-standaard wp-sitemap.xml of Yoast sitemap_index.xml), anders de losse
// Yoast-bestanden zoals op de oude site (product-sitemap.xml enz.).
async function discoverSitemaps() {
  for (const idx of ['wp-sitemap.xml', 'sitemap_index.xml']) {
    const xml = await fetchMaybe(`${ORIGIN}/${idx}`);
    if (xml && /<sitemapindex/i.test(xml)) {
      const found = sitemapsFromIndex(xml);
      if (found.products.length || found.pages.length || found.posts.length) return { source: idx, ...found };
    }
  }
  return {
    source: 'losse Yoast-sitemaps',
    products: [`${ORIGIN}/product-sitemap.xml`],
    pages: [`${ORIGIN}/page-sitemap.xml`],
    posts: [`${ORIGIN}/post-sitemap.xml`],
  };
}

// Alle <loc>-adressen uit een of meer sitemaps, alleen de Duitse pagina's.
async function locsOf(sitemapUrls) {
  const out = [];
  for (const u of sitemapUrls) {
    const xml = await fetchMaybe(u);
    if (!xml) continue;
    out.push(...[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim()).filter((x) => isGermanUrl(x, BASE)));
  }
  return out;
}

// Links aflopen vanaf de startpagina, alleen binnen BASE (de Duitse pagina's staan
// tijdens de preview niet in de sitemap). Hooguit MAX_CRAWL pagina's.
const MAX_CRAWL = 400;
async function crawl() {
  const seen = new Set([BASE + '/']);
  const queue = [BASE + '/'];
  const htmlByUrl = new Map();
  while (queue.length && seen.size <= MAX_CRAWL) {
    const batch = queue.splice(0, CONCURRENCY);
    await Promise.all(batch.map(async (u) => {
      const html = await fetchMaybe(u);
      if (!html) return;
      htmlByUrl.set(u, html);
      for (const next of crawlCandidates(html, BASE)) {
        if (!seen.has(next)) { seen.add(next); queue.push(next); }
      }
    }));
  }
  return htmlByUrl;
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
  await previewCookie();
  const maps = await discoverSitemaps();
  const [products, pages, posts] = await Promise.all([locsOf(maps.products), locsOf(maps.pages), locsOf(maps.posts)]);
  const gecrawld = await crawl();
  console.log(`Bron: ${BASE} (sitemaps: ${products.length + pages.length + posts.length} Duitse adressen; links: ${gecrawld.size} pagina's)${COOKIE ? ' met preview-cookie' : ''}`);

  // Inhoudspagina's: geen media-uploads en geen service-/juridische pagina's (zie
  // EXCLUDE_PAGE in scrub.js); die vervuilen anders de reparatie-zoekresultaten.
  const alle = new Set([...products, ...pages, ...posts, ...gecrawld.keys()]);
  const jobs = [...alle]
    .filter((u) => !/\/wp-content\//i.test(u) && !EXCLUDE_PAGE.test(u) && u.replace(/\/+$/, '') !== BASE)
    .map((url) => ({ type: typeOf(url, BASE), url }));

  const tel = (t) => jobs.filter((j) => j.type === t).length;
  console.log(`Pagina's: ${tel('product')} producten, ${tel('pagina')} pagina's, ${tel('blog')} blogs → ${jobs.length} totaal`);

  const results = await mapPool(jobs, async (job) => {
    const ruw = gecrawld.get(job.url) || await fetchText(job.url);
    // Dezelfde FAQ-vragen staan als blok onder veel product- en reparatiepagina's; ze
    // horen alleen bij de FAQ-pagina, anders winnen die pagina's op elke FAQ-vraag.
    const html = /\/faq\/?$/.test(job.url) ? ruw : removeBlocks(ruw, ['faq-accordion', 'faq-compact__button']);
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

  if (process.env.DRY_RUN) {
    console.log(`DRY_RUN: ${ok.length} pagina's gevonden, niets geschreven. Titels:`);
    for (const r of ok) console.log(`  [${r.type}] ${r.title} — ${r.url}`);
    return;
  }
  fs.writeFileSync(TARGET, JSON.stringify(ok, null, 2) + '\n');
  console.log(`✓ ${ok.length} pagina's geschreven naar ${path.relative(process.cwd(), TARGET)}`);
  if (failed.length) console.log(`⚠ ${failed.length} mislukt: ${failed.map((f) => f.url).join(', ')}`);
})().catch((e) => { console.error('✗', e.message); process.exit(1); });
