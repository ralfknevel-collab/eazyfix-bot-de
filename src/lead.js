// Gegevens vragen na de gratis foto's (wens van Nina, Eazyfix, 27-10-2026; port naar de
// Duitse bot voor eazy-fix.nl/de, november 2026). Meldingen in de du-vorm.
//
// Een bezoeker van de website mag een paar foto's gratis laten analyseren. Daarna vraagt
// de chat om naam en e-mailadres; wie die invult, mag nog een aantal foto's extra. De
// grens geldt alleen voor de chat op de website (aanvragen met een Origin-header). De
// native app stuurt geen Origin en merkt hier niets van.
//
// Telling per dag: gratis foto's per bezoekersadres, extra foto's per lead-token. Het
// token komt terug uit POST /api/lead en de chat bewaart het in de browser. Na een
// herstart van de server zoekt de poort een onbekend token op in Supabase.

const crypto = require('node:crypto');

const LEAD_DEFAULTS = { gratis: 3, extra: 5 };

const LEAD_NODIG = 'Möchtest du mehr Fotos analysieren? Gib deine Daten ein und analysiere bis zu 5 weitere Fotos.';
const LEAD_MAX = 'Du hast für heute die maximale Zahl an Fotoanalysen erreicht. Eine Frage tippen geht weiterhin; bei einer dringenden Frage hilft dir der EAZYFIX® Innendienst unter 03222 1097923.';

function leadLimitsFromEnv(env = process.env) {
  const num = (k, d) => { const n = parseInt(env[k], 10); return Number.isFinite(n) && n >= 0 ? n : d; };
  return { gratis: num('FOTO_GRATIS', LEAD_DEFAULTS.gratis), extra: num('FOTO_EXTRA', LEAD_DEFAULTS.extra) };
}

function nodigTekst(extra) {
  return `Möchtest du mehr Fotos analysieren? Gib deine Daten ein und analysiere bis zu ${extra} weitere Fotos.`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Controleert het formulier. Geeft { ok: true, row } of { ok: false, error }.
function validateLead(body) {
  const b = body || {};
  const naam = typeof b.naam === 'string' ? b.naam.trim() : '';
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  if (!naam) return { ok: false, error: 'Bitte gib deinen Namen ein.' };
  if (naam.length > 100) return { ok: false, error: 'Dein Name ist zu lang.' };
  if (!email || email.length > 200 || !EMAIL_RE.test(email)) return { ok: false, error: 'Bitte gib eine gültige E-Mail-Adresse ein.' };
  if (b.akkoord !== true) return { ok: false, error: 'Bitte stimme der Verarbeitung deiner Daten zu, um fortzufahren.' };
  const conversation_id = typeof b.conversationId === 'string' ? b.conversationId.slice(0, 100) : null;
  return {
    ok: true,
    row: { naam, email, akkoord_verwerking: true, nieuwsbrief: b.nieuwsbrief === true, conversation_id },
  };
}

function nieuwToken() {
  return 'l-' + crypto.randomUUID();
}

// De poort voor /api/analyze-image(/stream). lookupToken(token) -> Promise<boolean>
// zoekt een token op dat de server (nog) niet kent, bijvoorbeeld na een herstart.
function makePhotoGate({ limits, now = Date.now, lookupToken = async () => false } = {}) {
  const lim = { ...LEAD_DEFAULTS, ...(limits || {}) };
  let day = '';
  let perIp = new Map();
  let perToken = new Map();
  const bekend = new Set();

  function roll() {
    const d = new Date(now()).toISOString().slice(0, 10);
    if (d !== day) { day = d; perIp = new Map(); perToken = new Map(); }
  }

  // Telt FOTO'S, niet analyses (melding Nina 11-11-2026): per analyse kun je tot drie foto's
  // tegelijk sturen, waardoor "3 gratis" in de praktijk 9 foto's werd.
  function aantalFotos(req) {
    const b = req.body || {};
    if (Array.isArray(b.images)) return Math.max(1, b.images.length);
    return 1;
  }

  async function middleware(req, res, next) {
    if (!req.headers.origin) return next(); // native app: geen grens
    roll();
    const n = aantalFotos(req);
    const ip = req.ip || 'onbekend';
    const ipGebruikt = perIp.get(ip) || 0;
    const gratisOver = Math.max(0, lim.gratis - ipGebruikt);
    const token = typeof req.headers['x-lead-token'] === 'string' ? req.headers['x-lead-token'].slice(0, 100) : '';
    if (token) {
      let geldig = bekend.has(token);
      if (!geldig) {
        try { geldig = await lookupToken(token); } catch { geldig = false; }
        if (geldig) bekend.add(token);
      }
      if (geldig) {
        // Eerst de gratis foto's van vandaag opmaken, daarna de extra foto's.
        const uitGratis = Math.min(n, gratisOver);
        const uitExtra = n - uitGratis;
        const tokenGebruikt = perToken.get(token) || 0;
        if (tokenGebruikt + uitExtra > lim.extra) return res.status(429).json({ error: LEAD_MAX });
        perIp.set(ip, ipGebruikt + uitGratis);
        perToken.set(token, tokenGebruikt + uitExtra);
        return next();
      }
    }
    if (n > gratisOver) {
      return res.status(403).json({ error: nodigTekst(lim.extra), leadRequired: true, extra: lim.extra });
    }
    perIp.set(ip, ipGebruikt + n);
    next();
  }

  return {
    middleware,
    register(token) { bekend.add(token); },
    limits: lim,
  };
}

// --- Supabase ------------------------------------------------------------------
const LEAD_TABLE = 'leads_eazyfix_de';

function sbBase() {
  return process.env.SUPABASE_URL.replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
}
function sbHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json',
    apikey: process.env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
    ...extra,
  };
}

async function saveLead(row) {
  const res = await fetch(`${sbBase()}/rest/v1/${LEAD_TABLE}`, {
    method: 'POST',
    headers: sbHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify(row),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
}

async function leadTokenExists(token) {
  if (!/^l-[0-9a-f-]{36}$/.test(token)) return false;
  const q = `select=id&token=eq.${encodeURIComponent(token)}&limit=1`;
  const res = await fetch(`${sbBase()}/rest/v1/${LEAD_TABLE}?${q}`, { headers: sbHeaders(), signal: AbortSignal.timeout(5000) });
  if (!res.ok) return false;
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0;
}

// Zet alle inschrijvingen die nog niet in Mailchimp staan alsnog door en markeert ze.
// Draait na elke nieuwe inschrijving en elk uur, zodat een storing bij Mailchimp of
// een ontbrekende sleutel later vanzelf wordt ingehaald.
//
// Een adres dat Mailchimp zelf afwijst (nepadres, eerder uitgeschreven) blijft voor
// altijd "niet doorgezet". Omdat steeds de oudste 50 worden opgehaald, hielden 50 van
// zulke adressen alle echte inschrijvingen daarna tegen. Daarom: na MAX_AFWIJZINGEN
// afwijzingen slaat de wachtrij dat adres over. Alleen een echte afwijzing telt (400,
// 404, 422); een storing, een verlopen sleutel of drukte bij Mailchimp telt niet, zodat
// die later vanzelf wordt ingehaald. De telling staat in het geheugen: na een herstart
// krijgt elk adres opnieuw drie pogingen. Review 10-11-2026.
const MAX_AFWIJZINGEN = 3;
const AFWIJZING = new Set([400, 404, 422]);
const afwijzingen = new Map(); // lead-id -> aantal afwijzingen

async function syncPending(syncLead, teller = afwijzingen) {
  const overslaan = [...teller].filter(([, n]) => n >= MAX_AFWIJZINGEN).map(([id]) => Number(id)).filter(Number.isInteger);
  const filter = overslaan.length ? `&id=not.in.(${overslaan.join(',')})` : '';
  const q = 'select=id,naam,email,nieuwsbrief&mailchimp_synced=eq.false&akkoord_verwerking=eq.true&order=id&limit=50' + filter;
  const res = await fetch(`${sbBase()}/rest/v1/${LEAD_TABLE}?${q}`, { headers: sbHeaders(), signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
  const rows = await res.json();
  let gelukt = 0;
  for (const row of rows) {
    try {
      await syncLead(row);
      const up = await fetch(`${sbBase()}/rest/v1/${LEAD_TABLE}?id=eq.${row.id}`, {
        method: 'PATCH', headers: sbHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify({ mailchimp_synced: true }),
      });
      if (up.ok) { gelukt++; teller.delete(row.id); }
    } catch (e) {
      // Geen e.message in het logboek: de melding van Mailchimp bevat het e-mailadres.
      const status = e && e.status;
      if (AFWIJZING.has(status)) {
        const n = (teller.get(row.id) || 0) + 1;
        teller.set(row.id, n);
        console.error(`Mailchimp-sync lead ${row.id} afgewezen (status ${status}, ${n} van ${MAX_AFWIJZINGEN})${n >= MAX_AFWIJZINGEN ? ': wordt voortaan overgeslagen' : ''}`);
      } else {
        console.error(`Mailchimp-sync lead ${row.id} mislukt (${status ? 'status ' + status : (e && e.name) || 'fout'})`);
      }
    }
  }
  return { open: rows.length, gelukt, overgeslagen: overslaan.length };
}

module.exports = {
  syncPending, MAX_AFWIJZINGEN,
  LEAD_DEFAULTS, LEAD_NODIG, LEAD_MAX, LEAD_TABLE, leadLimitsFromEnv, nodigTekst,
  validateLead, nieuwToken, makePhotoGate, saveLead, leadTokenExists,
};
