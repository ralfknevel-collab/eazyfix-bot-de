// Bron van de site-pull (scripts/pull-site.js). Sinds november 2026 staat de Duitse
// site onder https://www.eazy-fix.nl/de/ (JKC). Zonder SITE_BASE is dat de bron.

const DEFAULT_SITE_BASE = 'https://www.eazy-fix.nl/de';

function resolveSiteBase(env = process.env) {
  const raw = String(env.SITE_BASE || '').trim();
  if (!raw) return DEFAULT_SITE_BASE;
  if (!/^https:\/\//i.test(raw)) {
    throw new Error(`SITE_BASE moet met https:// beginnen, kreeg: ${raw}`);
  }
  return raw.replace(/\/+$/, '');
}

// Sitemap-index (WordPress wp-sitemap.xml of Yoast sitemap_index.xml): kies de
// product-, pagina- en blogsitemaps; taxonomieën, auteurs en dealers niet.
function sitemapsFromIndex(xml) {
  const locs = [...String(xml || '').matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
  const out = { products: [], pages: [], posts: [] };
  for (const url of locs) {
    const name = url.replace(/\/+$/, '').split('/').pop().toLowerCase();
    if (/taxonom|_cat|-cat-|categor|\btag\b|-tag-|users|author|dealer/.test(name)) continue;
    if (/product/.test(name)) out.products.push(url);
    else if (/page|kluswijzer/.test(name)) out.pages.push(url);
    else if (/post/.test(name)) out.posts.push(url);
  }
  return out;
}

// Hoort dit adres bij de Duitse site? Op eazy-fix.nl alleen paden onder /de/.
function isGermanUrl(url, base = DEFAULT_SITE_BASE) {
  const u = String(url || '');
  return u === base || u.startsWith(base + '/');
}

// Kandidaat-links voor de crawl: absolute adressen binnen BASE, zonder anker of
// query (geen winkelmand-, filter- of preview-varianten), zonder bestanden en
// zonder wp-json.
function crawlCandidates(html, base = DEFAULT_SITE_BASE) {
  const out = new Set();
  for (const m of String(html || '').matchAll(/href="([^"]+)"/g)) {
    let u = m[1].replace(/&amp;/g, '&').split('#')[0];
    if (!u || u.includes('?')) continue;
    if (u.startsWith('/')) u = new URL(base).origin + u;
    if (!isGermanUrl(u, base)) continue;
    if (/\/wp-(json|content|admin|login)|\/feed\/?$|\.(jpe?g|png|webp|gif|svg|pdf|xml|css|js)$/i.test(u)) continue;
    out.add(u.endsWith('/') ? u : u + '/');
  }
  return [...out];
}

// Soort pagina, op het pad: producten onder /product/, blogs onder /blog/<slug>/,
// de rest (Heimwerker-Coach, reparatiepagina's, FAQ, garantie) is een pagina.
function typeOf(url, base = DEFAULT_SITE_BASE) {
  const pad = String(url).slice(base.length);
  if (/^\/product\/[^/]+/.test(pad)) return 'product';
  if (/^\/blog\/[^/]+/.test(pad)) return 'blog';
  return 'pagina';
}

module.exports = { DEFAULT_SITE_BASE, resolveSiteBase, sitemapsFromIndex, isGermanUrl, crawlCandidates, typeOf };
