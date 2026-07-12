// Feedback: valideer en bewaar bot-beoordelingen in Supabase.

const VALID_RATINGS = ['up', 'down'];

// Naam van deze bot in de Telegram-melding (Repair Care gebruikt 'Repair Care').
const BOT_NAME = 'Eazyfix';

// Bouwt de tekst van de melding. Pure functie (testbaar).
function buildFeedbackMessage(row, botName) {
  const emoji = row.rating === 'up' ? '\u{1F44D}' : '\u{1F44E}';
  const clip = (s, n) => {
    const t = (s || '').replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n) + '…' : t;
  };
  const lines = [
    `${emoji} ${botName} — nieuwe feedback`,
    `Vraag: ${clip(row.question, 300) || '(geen)'}`,
    `Antwoord: ${clip(row.answer, 500)}`,
  ];
  if (row.comment) lines.push(`Opmerking: ${clip(row.comment, 500)}`);
  if (row.conversation_id) lines.push(`Gesprek: ${row.conversation_id}`);
  return lines.join('\n');
}

// Stuurt de melding naar Telegram. Faalt stil (mag de feedback-opslag nooit
// breken). Doet niets als de Telegram-config ontbreekt. Vereist
// TELEGRAM_BOT_TOKEN en TELEGRAM_CHAT_ID.
async function notifyTelegram(row, botName = BOT_NAME) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: buildFeedbackMessage(row, botName),
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) console.error('Telegram-melding mislukt:', res.status, await res.text());
  } catch (e) {
    console.error('Telegram-melding mislukt:', e.message);
  }
}

// Pure validatie. Geeft { ok: true, value } of { ok: false, error }.
function validateFeedback(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'body vereist' };
  const { conversationId, question, answer, rating, comment } = body;
  if (typeof conversationId !== 'string' || conversationId.trim() === '') {
    return { ok: false, error: 'conversationId vereist' };
  }
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
      question: typeof question === 'string' ? question : '',
      answer,
      rating,
      comment: typeof comment === 'string' && comment.trim() !== '' ? comment : null,
    },
  };
}

// Is de Supabase-config aanwezig?
function feedbackEnabled() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
}

// Schrijf één regel naar de Supabase-tabel 'feedback'. Gooit bij fout.
async function saveFeedback(row) {
  // Normaliseer de basis-URL: strip trailing slashes en een eventueel
  // meegekopieerd /rest/v1, zodat een schuine streep te veel niet stuk gaat.
  const base = process.env.SUPABASE_URL.replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const url = `${base}/rest/v1/feedback_eazyfix_de`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: process.env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${res.status}: ${text}`);
  }
  // Opslaan gelukt: stuur de melding (fire-and-forget, nooit blokkerend).
  notifyTelegram(row).catch(() => {});
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

// Naam van de openbare storage-bucket voor ingestuurde chat-foto's.
const CHAT_BUCKET = 'chat-fotos';
const EXT_BY_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' };

// Upload base64-foto's naar Supabase Storage en geef de publieke URLs terug.
// Faalt per foto stil (een mislukte upload mag de analyse/log nooit breken):
// bij een fout wordt die foto simpelweg overgeslagen. Geeft [] terug als er
// niets is geüpload.
async function uploadChatImages({ conversation_id, images }) {
  if (!Array.isArray(images) || images.length === 0) return [];
  const base = process.env.SUPABASE_URL.replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const folder = (conversation_id || 'foto').replace(/[^a-zA-Z0-9._-]/g, '_');
  const stamp = Date.now();
  const urls = [];
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const ext = EXT_BY_MIME[img.mimeType] || 'jpg';
    const path = `${folder}/${stamp}-${i}.${ext}`;
    try {
      const res = await fetch(`${base}/storage/v1/object/${CHAT_BUCKET}/${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': img.mimeType,
          apikey: process.env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        },
        body: Buffer.from(img.base64, 'base64'),
      });
      if (!res.ok) {
        console.error(`Foto-upload ${path} mislukt:`, res.status, await res.text());
        continue;
      }
      urls.push(`${base}/storage/v1/object/public/${CHAT_BUCKET}/${path}`);
    } catch (e) {
      console.error(`Foto-upload ${path} mislukt:`, e.message);
    }
  }
  return urls;
}

module.exports = { validateFeedback, feedbackEnabled, saveFeedback, logChat, uploadChatImages, VALID_RATINGS, buildFeedbackMessage, notifyTelegram };
