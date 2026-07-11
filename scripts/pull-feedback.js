// Trek alle bot-feedback uit de Supabase-tabel 'feedback' en schrijf naar CSV.
// Gebruik: node scripts/pull-feedback.js [uitvoerbestand]   (default feedback_rows.csv)
// Vereist SUPABASE_URL en SUPABASE_SERVICE_KEY in .env.

require('dotenv').config();
const fs = require('fs');

const base = (process.env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
const key = process.env.SUPABASE_SERVICE_KEY;
const out = process.argv[2] || 'feedback_rows.csv';
const COLS = ['id', 'created_at', 'conversation_id', 'question', 'answer', 'rating', 'comment'];

if (!base || !key) {
  console.error('✗ SUPABASE_URL en/of SUPABASE_SERVICE_KEY ontbreken in .env');
  process.exit(1);
}

function csvCell(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

(async () => {
  const url = `${base}/rest/v1/feedback?select=${COLS.join(',')}&order=id.asc`;
  const res = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) {
    console.error(`✗ Supabase ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  const rows = await res.json();
  const lines = [COLS.join(',')];
  for (const r of rows) lines.push(COLS.map((c) => csvCell(r[c])).join(','));
  fs.writeFileSync(out, lines.join('\n') + '\n');
  console.log(`✓ ${rows.length} feedbackregels geschreven naar ${out}`);
})().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
