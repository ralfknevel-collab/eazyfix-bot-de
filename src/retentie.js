// Bewaartermijn van gesprekken en foto's (port eazyfix-bot b934327, veiligheidscheck
// 20-10-2026). Gesprekken in chats_eazyfix_de en foto's in de (met NL gedeelde) bucket chat-fotos ouder dan BEWAARTERMIJN_DAGEN
// (standaard 90) worden dagelijks verwijderd. Feedback (duimpjes) blijft staan: dat is
// de werkvoorraad die Ralf zelf wist. Draait vanuit index.js (eenmaal na de start en
// daarna elke 24 uur) en handmatig via scripts/opruimen.js (met DRY_RUN=1 alleen tellen).
const { CHAT_BUCKET } = require('./feedback');

function retentionDays(env = process.env) {
  const v = parseInt(env.BEWAARTERMIJN_DAGEN, 10);
  return Number.isFinite(v) && v > 0 ? v : 90;
}

function cutoffIso(days, now = Date.now()) {
  return new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
}

function base() {
  return String(process.env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
}
function headers(extra = {}) {
  return { apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`, ...extra };
}

// Gesprekken ouder dan de grens verwijderen (of alleen tellen bij dryRun).
const CHATS_TABLE = process.env.CHATS_TABLE || 'chats_eazyfix_de';

async function opruimenGesprekken(cutoff, { dryRun = false, table = CHATS_TABLE } = {}) {
  const url = `${base()}/rest/v1/${table}?created_at=lt.${encodeURIComponent(cutoff)}`;
  if (dryRun) {
    const res = await fetch(url + '&select=id', { headers: headers({ Prefer: 'count=exact', Range: '0-0' }) });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    const range = res.headers.get('content-range') || '';
    return parseInt(range.split('/')[1], 10) || 0;
  }
  const res = await fetch(url, { method: 'DELETE', headers: headers({ Prefer: 'return=representation' }) });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  const rows = await res.json();
  return Array.isArray(rows) ? rows.length : 0;
}

// Eén niveau van de bucket oplijsten (mappen of bestanden).
async function listObjects(prefix) {
  const res = await fetch(`${base()}/storage/v1/object/list/${CHAT_BUCKET}`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prefix, limit: 1000, offset: 0, sortBy: { column: 'name', order: 'asc' } }),
  });
  if (!res.ok) throw new Error(`Supabase list ${res.status}: ${await res.text()}`);
  return res.json();
}

// Foto's ouder dan de grens verwijderen: per gespreksmap de bestanden bekijken.
async function opruimenFotos(cutoff, { dryRun = false } = {}) {
  const folders = (await listObjects('')).filter((o) => !o.id); // mappen hebben geen id
  const oud = [];
  for (const f of folders) {
    const files = await listObjects(f.name);
    for (const file of files) {
      if (file.id && file.created_at && file.created_at < cutoff) oud.push(`${f.name}/${file.name}`);
    }
  }
  if (dryRun || oud.length === 0) return oud.length;
  for (let i = 0; i < oud.length; i += 100) {
    const batch = oud.slice(i, i + 100);
    const res = await fetch(`${base()}/storage/v1/object/${CHAT_BUCKET}`, {
      method: 'DELETE',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prefixes: batch }),
    });
    if (!res.ok) throw new Error(`Supabase delete ${res.status}: ${await res.text()}`);
  }
  return oud.length;
}

async function opruimen({ dryRun = false, now = Date.now(), env = process.env } = {}) {
  const days = retentionDays(env);
  const cutoff = cutoffIso(days, now);
  const gesprekken = await opruimenGesprekken(cutoff, { dryRun });
  const fotos = await opruimenFotos(cutoff, { dryRun });
  return { days, cutoff, gesprekken, fotos, dryRun };
}

module.exports = { retentionDays, cutoffIso, opruimen, opruimenGesprekken, opruimenFotos, CHATS_TABLE };
