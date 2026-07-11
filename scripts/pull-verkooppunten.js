// Trek de EAZYFIX-verkooppunten van de website en schrijf src/verkooppunten.json.
// Gebruik: node scripts/pull-verkooppunten.js
// De pagina rendert de winkels als kaart-markers met popover-HTML; die parsen we.

const fs = require('fs');
const path = require('path');

const SOURCE = 'https://www.eazy-fix.nl/overzicht-verkooppunten/';
const TARGET = path.join(__dirname, '..', 'src', 'verkooppunten.json');
const PROV = {
  GR: 'Groningen', FR: 'Friesland', DR: 'Drenthe', OV: 'Overijssel', FL: 'Flevoland',
  GL: 'Gelderland', UT: 'Utrecht', NH: 'Noord-Holland', ZH: 'Zuid-Holland',
  ZE: 'Zeeland', NB: 'Noord-Brabant', LB: 'Limburg', LI: 'Limburg',
};

// Parse de (escaped) pagina-HTML naar een lijst verkooppunten.
function parseVerkooppunten(html) {
  let h = html
    .replace(/\\u003C/gi, '<').replace(/\\u003E/gi, '>').replace(/\\u0026/gi, '&')
    .replace(/\\\//g, '/').replace(/\\t/g, '').replace(/\\n/g, '\n').replace(/\\"/g, '"');
  const re = /<h3>([^<]+)<\/h3>([\s\S]*?)<\/div>/g;
  const out = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(h))) {
    const name = m[1].trim().replace(/&amp;/g, '&');
    if (seen.has(name)) continue;
    seen.add(name);
    const body = m[2].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
    const lines = body.split('\n').map((s) => s.trim()).filter(Boolean).filter((s) => s !== 'Routebeschrijving');
    let street = null, zip = null, city = null, province = null, phone = null, url = null;
    for (const ln of lines) {
      const z = ln.match(/^(\d{4}\s?[A-Z]{2})\s+(.+)$/);
      if (z) {
        zip = z[1].replace(/\s+/, '');
        const rest = z[2].trim();
        const p = rest.match(/^(.*?)\s+([A-Z]{2})$/);
        if (p && PROV[p[2]]) { city = p[1].trim(); province = PROV[p[2]]; } else { city = rest; }
        continue;
      }
      if (/^Tel:/i.test(ln)) { phone = ln.replace(/^Tel:\s*/i, '').trim(); continue; }
      if (/^(www\.|https?:)/i.test(ln)) { if (!url) url = ln.trim(); continue; }
      if (!street && !/^\d{4}/.test(ln)) street = ln.trim();
    }
    out.push({ name, street, zip, city, province, phone, url });
  }
  out.sort((a, b) => (a.city || '').localeCompare(b.city || ''));
  return out;
}

(async () => {
  const res = await fetch(SOURCE);
  if (!res.ok) {
    console.error(`✗ ${SOURCE} → HTTP ${res.status}`);
    process.exit(1);
  }
  const stores = parseVerkooppunten(await res.text());
  if (stores.length < 50) {
    console.error(`✗ Slechts ${stores.length} verkooppunten gevonden; pagina-structuur waarschijnlijk gewijzigd. Niet geschreven.`);
    process.exit(1);
  }
  fs.writeFileSync(TARGET, JSON.stringify(stores, null, 2) + '\n');
  console.log(`✓ ${stores.length} verkooppunten geschreven naar ${path.relative(process.cwd(), TARGET)}`);
})().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});

module.exports = { parseVerkooppunten };
