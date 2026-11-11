// Mailchimp-koppeling voor het gegevensformulier in de Duitse chat (port eazyfix-bot,
// november 2026). Lijsten volgens Nina (Teams, 11-11-2026):
// Vinkje 1 (toestemming verwerken, verplicht) -> dezelfde lijst "AI Chat" als NL, met
//   het label "Land: DE" (plus "AI-chat", en "Marketing akkoord" bij vinkje 2).
// Vinkje 2 (nieuwsbrief, optioneel) -> "Eazyfix Newsletter [de]", met het veld
//   Landcode (COUNTRY) = DE en de labels "Bron: AI-chat" en "Land: DE".
// Een bestaand lid wordt niet opnieuw aangemeld of afgemeld (status_if_new).
//
// Dubbele opt-in alleen voor de nieuwsbrief (besluit Nina, 11-11-2026, zoals NL): de
// nieuwsbrieflijst krijgt "pending" (eerst de bevestigingsmail), AI Chat "subscribed".
//
// Instellingen: MAILCHIMP_API_KEY (eindigt op "-usNN"; zelfde account als NL),
// MAILCHIMP_LIST_AICHAT en MAILCHIMP_LIST_NIEUWSBRIEF (standaard de lijsten hieronder).

const crypto = require('node:crypto');

const LIJST_AICHAT = 'c53276f7d7'; // AI Chat (gedeeld met NL, label Land: DE)
const LIJST_NIEUWSBRIEF = '265659b591'; // Eazyfix Newsletter [de]
const TAG = 'AI-chat';
const TAG_MARKETING = 'Marketing akkoord';
const TAG_BRON = 'Bron: AI-chat';
const TAG_LAND = 'Land: DE';

function mailchimpEnabled(env = process.env) {
  return /^[0-9a-f]{32}-us\d+$/.test(env.MAILCHIMP_API_KEY || '');
}

function lijsten(env = process.env) {
  return { aichat: env.MAILCHIMP_LIST_AICHAT || LIJST_AICHAT, nieuwsbrief: env.MAILCHIMP_LIST_NIEUWSBRIEF || LIJST_NIEUWSBRIEF };
}

function splitsNaam(naam) {
  const delen = String(naam || '').trim().split(/\s+/);
  return { FNAME: delen[0] || '', LNAME: delen.slice(1).join(' ') };
}

// Welke lijsten en velden bij een inschrijving horen. Pure functie (testbaar).
const STATUS_AICHAT = 'subscribed';
const STATUS_NIEUWSBRIEF = 'pending';

function bouwAanmeldingen(row, env = process.env) {
  const l = lijsten(env);
  const { FNAME, LNAME } = splitsNaam(row.naam);
  const marketing = row.nieuwsbrief === true;
  const uit = [{ lijst: l.aichat, status: STATUS_AICHAT, merge_fields: { FNAME, LNAME }, tags: marketing ? [TAG, TAG_LAND, TAG_MARKETING] : [TAG, TAG_LAND] }];
  // Velden van "Eazyfix Newsletter [de]": Vorname, Nachname, Privacy (MMERGE5) en
  // Landcode (COUNTRY).
  if (marketing && l.nieuwsbrief) {
    uit.push({ lijst: l.nieuwsbrief, status: STATUS_NIEUWSBRIEF, merge_fields: { FNAME, LNAME, MMERGE5: 'ja (AI-chat)', COUNTRY: 'DE' }, tags: [TAG_BRON, TAG_LAND] });
  }
  return uit;
}

function subscriberHash(email) {
  return crypto.createHash('md5').update(String(email).toLowerCase()).digest('hex');
}

async function mcFetch(pad, opts, env = process.env) {
  const key = env.MAILCHIMP_API_KEY;
  const dc = key.split('-').pop();
  const res = await fetch(`https://${dc}.api.mailchimp.com/3.0${pad}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from('x:' + key).toString('base64') },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    let detail = '';
    try { const j = await res.json(); detail = j.detail || j.title || ''; } catch {}
    const err = new Error(`Mailchimp ${res.status}: ${detail}`);
    err.status = res.status; // lead.js onderscheidt hiermee een afwijzing van een storing
    throw err;
  }
  return res;
}

// Zet één inschrijving in Mailchimp. Gooit bij een fout; de aanroeper logt die.
async function syncLead(row, env = process.env) {
  const hash = subscriberHash(row.email);
  for (const a of bouwAanmeldingen(row, env)) {
    await mcFetch(`/lists/${a.lijst}/members/${hash}`, {
      method: 'PUT',
      body: JSON.stringify({ email_address: row.email, status_if_new: a.status, merge_fields: a.merge_fields }),
    }, env);
    await mcFetch(`/lists/${a.lijst}/members/${hash}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tags: a.tags.map((name) => ({ name, status: 'active' })) }),
    }, env);
  }
}

module.exports = { STATUS_AICHAT, STATUS_NIEUWSBRIEF, mailchimpEnabled, lijsten, splitsNaam, bouwAanmeldingen, subscriberHash, syncLead, LIJST_AICHAT, LIJST_NIEUWSBRIEF, TAG, TAG_MARKETING, TAG_BRON, TAG_LAND };
