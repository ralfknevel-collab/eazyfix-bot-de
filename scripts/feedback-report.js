// Vat de bot-feedback samen: tel duim op/neer en cluster de klachten per thema.
// Gebruik:
//   node scripts/feedback-report.js                 (leest Supabase als geconfigureerd,
//                                                     anders ./feedback_rows.csv)
//   node scripts/feedback-report.js pad/naar.csv    (expliciet CSV-bestand)

require('dotenv').config();
const fs = require('fs');

// Eenvoudige RFC4180-CSV-parser (velden met komma's/regeleinden tussen aanhalingstekens).
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r') { /* skip */ }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function getRows() {
  const base = (process.env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (base && key) {
    const url = `${base}/rest/v1/feedback?select=*&order=id.asc`;
    const res = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    return res.json();
  }
  const csvPath = process.argv[2] || 'feedback_rows.csv';
  if (!fs.existsSync(csvPath)) {
    console.error(`Geen Supabase-config en geen CSV gevonden (${csvPath}).`);
    console.error('Geef een bestand mee: node scripts/feedback-report.js <bestand.csv>');
    process.exit(1);
  }
  const rows = parseCSV(fs.readFileSync(csvPath, 'utf8'));
  const head = rows.shift().map((h) => h.trim());
  return rows
    .filter((r) => r.length >= head.length - 1 && r.some((c) => c !== ''))
    .map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] || ''])));
}

// Thema's o.b.v. trefwoorden in vraag + opmerking (eerste match telt).
const THEMES = [
  ['Verkooppunten', /verkooppunt|winkel|bijvoet|waar.*koop|kopen|\blink\b|bijvoet/i],
  ['Foto / upload', /foto|upload|afbeelding|verzend|preview|plaatje/i],
  ['Techniek-tag lek', /\(flow|flow:|producten:/i],
  ['Stappenplan / timing', /stappen|stappenplan|meteen|te vroeg|niet.*tonen|tonen/i],
  ['Plamuur / inhoud', /plamuur|houtplamuur|niet goed|klopt niet|onjuist|fout/i],
  ['Prijs', /prijs|prijzen|kost|bedrag|euro|€/i],
  ['Toon / algemeen', /prut|slecht|kort|lang|onduidelijk/i],
];

function classify(row) {
  const hay = `${row.question || ''} ${row.comment || ''}`;
  for (const [name, re] of THEMES) if (re.test(hay)) return name;
  return 'Overig';
}

(async () => {
  const rows = await getRows();
  const up = rows.filter((r) => r.rating === 'up').length;
  const down = rows.filter((r) => r.rating === 'down');

  console.log(`\nFeedback-overzicht — ${rows.length} beoordelingen`);
  console.log(`  👍 ${up}   👎 ${down.length}\n`);

  const buckets = new Map();
  for (const r of down) {
    const t = classify(r);
    if (!buckets.has(t)) buckets.set(t, []);
    buckets.get(t).push(r);
  }
  const sorted = [...buckets.entries()].sort((a, b) => b[1].length - a[1].length);

  console.log('Klachten (👎) per thema:');
  for (const [theme, list] of sorted) {
    console.log(`\n■ ${theme} — ${list.length}`);
    for (const r of list) {
      const c = (r.comment || '').replace(/\s+/g, ' ').trim();
      const v = (r.question || '').replace(/\s+/g, ' ').trim().slice(0, 50);
      console.log(`   - ${c || '(geen opmerking)'}${v ? `   [vraag: ${v}]` : ''}`);
    }
  }
  console.log('');
})().catch((e) => { console.error('✗', e.message); process.exit(1); });
