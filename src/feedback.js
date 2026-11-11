// Feedback: valideer en bewaar bot-beoordelingen in Supabase.

const VALID_RATINGS = ['up', 'down'];

// Gelijkgetrokken met eazyfix-bot (NL), november 2026: geen gespreksinhoud meer naar
// Telegram (besluit Ralf 28-10-2026 voor NL). Beoordelingen staan in Supabase. Alleen
// het alarm bij het dagplafond (zonder inhoud) gaat nog via sendTelegramText.

// Lengtegrenzen (review 10-11-2026): zonder grens kon één aanvraag megabytes in de
// tabel zetten. Te lange tekst wordt afgekapt in plaats van geweigerd, zodat een
// beoordeling van een lang antwoord gewoon aankomt.
const MAX_FB_VRAAG = 4000;
const MAX_FB_ANTWOORD = 20000;
const MAX_FB_OPMERKING = 1000;
const MAX_FB_GESPREK_ID = 80;

// Vrije tekst naar het Telegram-kanaal, alleen voor alarmen zonder gespreksinhoud
// (zoals een dagplafond). Stil als Telegram niet geconfigureerd is; gooit nooit.
async function sendTelegramText(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) console.error('Telegram-bericht mislukt:', res.status, await res.text());
  } catch (e) {
    console.error('Telegram-bericht mislukt:', e.message);
  }
}

// Pure validatie. Geeft { ok: true, value } of { ok: false, error }.
function validateFeedback(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'body vereist' };
  const { conversationId, question, answer, rating, comment } = body;
  if (typeof conversationId !== 'string' || conversationId.trim() === '') {
    return { ok: false, error: 'conversationId vereist' };
  }
  if (conversationId.length > MAX_FB_GESPREK_ID) return { ok: false, error: 'conversationId te lang' };
  if (typeof answer !== 'string' || answer.trim() === '') {
    return { ok: false, error: 'answer vereist' };
  }
  if (!VALID_RATINGS.includes(rating)) {
    return { ok: false, error: "rating moet 'up' of 'down' zijn" };
  }
  return {
    ok: true,
    value: {
      conversation_id: conversationId,
      question: typeof question === 'string' ? question.slice(0, MAX_FB_VRAAG) : '',
      answer: answer.slice(0, MAX_FB_ANTWOORD),
      rating,
      comment: typeof comment === 'string' && comment.trim() !== '' ? comment.slice(0, MAX_FB_OPMERKING) : null,
    },
  };
}

// Is de Supabase-config aanwezig?
function feedbackEnabled() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
}

// Schrijf één regel naar de Supabase-tabel 'feedback'. Gooit bij fout.
async function saveFeedback(row) {
  await insertFeedback(row);
}

// Eén rij in de tabel feedback_eazyfix_de. Gooit bij fout.
async function insertFeedback(row) {
  const res = await fetch(`${supabaseBase()}/rest/v1/feedback_eazyfix_de`, {
    method: 'POST',
    headers: { ...supabaseHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${res.status}: ${text}`);
  }
}

function supabaseHeaders() {
  return {
    'Content-Type': 'application/json',
    apikey: process.env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
  };
}

// --- Gespreksbeoordeling (21-10-2026) ---------------------------------------
// De duimpjes per antwoord (hierboven, 'up'/'down') waren voor interne testers; de app
// gebruikt ze nog. Bezoekers van de website geven één oordeel over het hele gesprek:
// knop "Gesprek beëindigen", drie smileys, bij neutraal en ontevreden een optionele
// opmerking. De rij komt in dezelfde tabel, met het hele gesprek (uit chats_eazyfix_de)
// als antwoord-kolom, zodat hij op zichzelf leesbaar is. Eén oordeel per gesprek.

const GESPREK_RATINGS = ['blij', 'neutraal', 'ontevreden'];
const MAX_OPMERKING = 1000;
const MAX_GESPREK_ID = 80;

// Pure validatie. Geeft { ok: true, value } of { ok: false, error }.
function validateGesprekFeedback(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'body vereist' };
  const { conversationId, rating, comment } = body;
  if (typeof conversationId !== 'string' || conversationId.trim() === '' || conversationId.length > MAX_GESPREK_ID) {
    return { ok: false, error: 'conversationId vereist' };
  }
  if (!GESPREK_RATINGS.includes(rating)) {
    return { ok: false, error: "rating moet 'blij', 'neutraal' of 'ontevreden' zijn" };
  }
  const opmerking = typeof comment === 'string' ? comment.trim().slice(0, MAX_OPMERKING) : '';
  return { ok: true, value: { conversation_id: conversationId.trim(), rating, comment: opmerking || null } };
}

// Het gesprek als leesbare tekst: per beurt de vraag en het antwoord, fotobeurten
// gemarkeerd. Pure functie (testbaar).
function buildTranscript(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '(geen gesprek gevonden in het logboek)';
  return rows.map((r) => {
    const foto = Array.isArray(r.image_urls) && r.image_urls.length > 0 ? '[foto] ' : '';
    const vraag = (foto + (r.question || '').trim()).trim();
    return `Bezoeker: ${vraag}\nEazyfix: ${(r.answer || '').trim()}`;
  }).join('\n\n');
}

// De rij voor de feedbacktabel. Pure functie (testbaar).
function gesprekRow({ conversation_id, rating, comment }, rows) {
  const n = Array.isArray(rows) ? rows.length : 0;
  return {
    conversation_id,
    question: `Gesprek beoordeeld (${n} ${n === 1 ? 'vraag' : 'vragen'})`,
    answer: buildTranscript(rows),
    rating,
    comment,
  };
}

// Beurten van één gesprek uit het logboek, oudste eerst.
async function fetchGesprek(conversation_id) {
  const q = `conversation_id=eq.${encodeURIComponent(conversation_id)}&select=question,answer,image_urls,created_at&order=created_at.asc&limit=40`;
  const res = await fetch(`${supabaseBase()}/rest/v1/chats_eazyfix_de?${q}`, { headers: supabaseHeaders() });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

// Is dit gesprek al beoordeeld?
async function gesprekAlBeoordeeld(conversation_id) {
  const q = `conversation_id=eq.${encodeURIComponent(conversation_id)}&rating=in.(${GESPREK_RATINGS.join(',')})&select=id&limit=1`;
  const res = await fetch(`${supabaseBase()}/rest/v1/feedback_eazyfix_de?${q}`, { headers: supabaseHeaders() });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  const rows = await res.json();
  return rows.length > 0;
}

// Bewaart een gespreksbeoordeling. Geeft { ok: true } of { ok: false, reden } waarbij
// reden 'niet_gevonden' (gesprek staat niet in het logboek) of 'al_beoordeeld' is.
// Gooit alleen bij een echte opslagfout.
async function saveGesprekFeedback(value) {
  const rows = await fetchGesprek(value.conversation_id);
  if (rows.length === 0) return { ok: false, reden: 'niet_gevonden' };
  if (await gesprekAlBeoordeeld(value.conversation_id)) return { ok: false, reden: 'al_beoordeeld' };
  const row = gesprekRow(value, rows);
  await insertFeedback(row);
  return { ok: true };
}

async function logChat({ conversation_id, question, answer, image_urls }) {
  const base = process.env.SUPABASE_URL.replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const url = `${base}/rest/v1/chats_eazyfix_de`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: process.env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ conversation_id, question, answer, image_urls: image_urls || null }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${res.status}: ${text}`);
  }
}

// Storage-bucket voor ingestuurde chat-foto's. Sinds 20-10-2026 PRIVÉ (veiligheidscheck):
// klantfoto's van huizen en kozijnen horen niet achter een eeuwig geldige openbare link.
// In het logboek bewaren we het opslagpad (bucket/map/bestand); bekijken kan via het
// Supabase-dashboard of een tijdelijke link (signedPhotoUrl). Opruimen: src/retentie.js.
const CHAT_BUCKET = 'chat-fotos';
const EXT_BY_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' };

function supabaseBase() {
  return String(process.env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
}

// Opslagpad van één foto: bucket/gespreksmap/tijdstempel-volgnummer.ext. De mapnaam
// wordt ontdaan van alles buiten letters, cijfers, punt, streepje (geen padtrucs).
function photoObjectPath({ conversation_id, stamp, index, mimeType }) {
  const folder = String(conversation_id || 'foto').replace(/[^a-zA-Z0-9._-]/g, '_');
  const ext = EXT_BY_MIME[mimeType] || 'jpg';
  return `${CHAT_BUCKET}/${folder}/${stamp}-${index}.${ext}`;
}

// Upload base64-foto's naar Supabase Storage en geef de opslagpaden terug.
// Faalt per foto stil (een mislukte upload mag de analyse/log nooit breken):
// bij een fout wordt die foto simpelweg overgeslagen. Geeft [] terug als er
// niets is geüpload.
async function uploadChatImages({ conversation_id, images }) {
  if (!Array.isArray(images) || images.length === 0) return [];
  const base = supabaseBase();
  const stamp = Date.now();
  const paths = [];
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const objectPath = photoObjectPath({ conversation_id, stamp, index: i, mimeType: img.mimeType });
    try {
      const res = await fetch(`${base}/storage/v1/object/${objectPath}`, {
        method: 'POST',
        headers: {
          'Content-Type': img.mimeType,
          apikey: process.env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        },
        body: Buffer.from(img.base64, 'base64'),
      });
      if (!res.ok) {
        console.error(`Foto-upload ${objectPath} mislukt:`, res.status, await res.text());
        continue;
      }
      paths.push(objectPath);
    } catch (e) {
      console.error(`Foto-upload ${objectPath} mislukt:`, e.message);
    }
  }
  return paths;
}

// Tijdelijke link naar een privéfoto (standaard 1 uur), voor wie hem even moet zien.
async function signedPhotoUrl(objectPath, expiresInSeconds = 3600) {
  const base = supabaseBase();
  const res = await fetch(`${base}/storage/v1/object/sign/${objectPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: process.env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
    },
    body: JSON.stringify({ expiresIn: expiresInSeconds }),
  });
  if (!res.ok) throw new Error(`Supabase sign ${res.status}: ${await res.text()}`);
  const { signedURL } = await res.json();
  return `${base}/storage/v1${signedURL}`;
}

module.exports = { validateFeedback, feedbackEnabled, saveFeedback, logChat, uploadChatImages, photoObjectPath, signedPhotoUrl, CHAT_BUCKET, VALID_RATINGS,
  GESPREK_RATINGS, validateGesprekFeedback, buildTranscript, gesprekRow, saveGesprekFeedback, sendTelegramText };
