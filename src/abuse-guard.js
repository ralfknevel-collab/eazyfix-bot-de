// Bescherming tegen misbruik van de open API. Port van eazyfix-bot (NL, commit
// cf9a663), daar weer een port van repair-care-bot (9dab9ba, f6a7cfd) en
// repair-care-bot-de (ccd23ab).
//
// Twee maatregelen:
// 1. Herkomstcontrole (CORS-allowlist): alleen de eigen site(s) mogen de API vanuit
//    een browser aanroepen. Aanroepen zonder Origin-header (curl, de native
//    EAZYFIX-app, same-origin navigatie) hebben geen CORS nodig en blijven werken.
// 2. Limiet op het aantal aanvragen per IP: ~20 per minuut op de hele API en 5 per
//    minuut op de foto-analyse (die doet tot 3 modelcalls per foto en is veruit het
//    duurst). De melding verschijnt als chatbubbel: public/index.html toont d.error
//    bij status 429.
//
// Standaardlijst: de eigen Render-host en de Duitse site. Overschrijfbaar via
// ALLOWED_ORIGIN (komma-gescheiden).
const rateLimit = require('express-rate-limit');

const DEFAULT_ORIGINS = [
  'https://eazyfix-bot-de.onrender.com', // eigen testpagina
  'https://www.eazy-fix.de',
  'https://eazy-fix.de',
];

const LOCALHOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function parseAllowedOrigins(value, fallback = DEFAULT_ORIGINS) {
  const list = String(value || '').split(',').map((s) => s.trim()).filter(Boolean);
  return list.length ? list : fallback.slice();
}

// Mag deze browser-origin de API aanroepen? Geen origin = geen CORS nodig = toegestaan.
function originAllowed(origin, allowedOrigins) {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  return LOCALHOST_RE.test(origin); // lokaal ontwikkelen blijft altijd mogelijk
}

// Opties voor het cors-pakket. false -> geen CORS-headers -> de browser blokkeert
// cross-origin gebruik; de server zelf geeft geen foutmelding (zo werkt CORS).
function corsOptions(allowedOrigins) {
  return {
    origin(origin, cb) {
      cb(null, originAllowed(origin, allowedOrigins));
    },
  };
}

const API_LIMIT = { windowMs: 60 * 1000, limit: 20 };
const IMAGE_LIMIT = { windowMs: 60 * 1000, limit: 5 };
// Du-vorm, zoals de Duitse persona de Heimwerker aanspreekt.
const API_LIMIT_MESSAGE = 'Zu viele Fragen kurz hintereinander. Warte bitte eine Minute und versuch es dann noch einmal.';
const IMAGE_LIMIT_MESSAGE = 'Zu viele Fotoanalysen kurz hintereinander. Warte bitte eine Minute und versuch es dann noch einmal.';

function makeLimiters() {
  const apiLimiter = rateLimit({
    ...API_LIMIT,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: API_LIMIT_MESSAGE },
  });
  const imageLimiter = rateLimit({
    ...IMAGE_LIMIT,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: IMAGE_LIMIT_MESSAGE },
  });
  return { apiLimiter, imageLimiter };
}

// --- berichtlengte ----------------------------------------------------------------
// De widget begrenst een bericht op 2000 tekens, maar wie de API rechtstreeks aanroept
// kan megabytes sturen (express.json staat op 10 MB voor foto's). Elk teken gaat naar
// het model en kost geld; daarom een harde grens op de server, ruim boven de widget.
// Port van eazyfix-bot (NL) a41ea98; meldingen in de du-vorm van de Duitse persona.
const MAX_MESSAGE_CHARS = 4000;
const MESSAGE_TOO_LONG = 'Deine Nachricht ist zu lang (maximal 4000 Zeichen). Kürze sie bitte etwas und versuch es noch einmal.';

function textLength(content) {
  if (typeof content === 'string') return content.length;
  if (Array.isArray(content)) return content.reduce((n, b) => n + (b && b.type === 'text' && typeof b.text === 'string' ? b.text.length : 0), 0);
  return 0;
}

// Is er een beurt in het gesprek met meer dan `max` tekens tekst?
function messageTooLong(messages, max = MAX_MESSAGE_CHARS) {
  if (!Array.isArray(messages)) return false;
  return messages.some((m) => m && textLength(m.content) > max);
}

// --- dagplafonds ------------------------------------------------------------------
// Per-minuutlimieten begrenzen geen dagvolume: één script vanaf één adres kon de hele
// dag 5 foto's per minuut sturen (ruim 7.000 analyses, bijna 1.000 euro). Daarom:
// een plafond per bezoeker per dag (berichten en foto's apart) en een plafond voor de
// hele bot per dag, met nette melding (429) en een alarm bij 80% van het botplafond.
// Tellers staan in het geheugen van het proces en beginnen elke dag (UTC) op nul; na
// een herstart ook. Overschrijfbaar via omgevingsvariabelen (zie dailyLimitsFromEnv).
const DAILY_LIMITS = { perIpMessages: 60, perIpPhotos: 15, globalMessages: 400, globalPhotos: 60 };
const DAILY_IP_MESSAGE = 'Du hast für heute die maximale Zahl an Fragen an den Assistenten erreicht. Morgen geht es weiter; bei einer dringenden Frage hilft dir der EAZYFIX® Innendienst unter 03222 1097923.';
const DAILY_IP_PHOTO = 'Du hast für heute die maximale Zahl an Fotoanalysen erreicht. Morgen kannst du wieder Fotos schicken; eine Frage tippen geht weiterhin.';
const DAILY_GLOBAL = 'Der Assistent hat heute viel zu tun und macht eine Pause. Versuch es morgen noch einmal oder ruf den EAZYFIX® Innendienst an unter 03222 1097923.';

function dailyLimitsFromEnv(env = process.env) {
  const num = (k, d) => { const v = parseInt(env[k], 10); return Number.isFinite(v) && v > 0 ? v : d; };
  return {
    perIpMessages: num('DAG_BERICHTEN_PER_BEZOEKER', DAILY_LIMITS.perIpMessages),
    perIpPhotos: num('DAG_FOTOS_PER_BEZOEKER', DAILY_LIMITS.perIpPhotos),
    globalMessages: num('DAG_BERICHTEN_TOTAAL', DAILY_LIMITS.globalMessages),
    globalPhotos: num('DAG_FOTOS_TOTAAL', DAILY_LIMITS.globalPhotos),
  };
}

// opts: { limits, now, onAlert }. Geeft { messageGuard, photoGuard, status } terug.
function makeDailyCaps(opts = {}) {
  const limits = { ...DAILY_LIMITS, ...(opts.limits || {}) };
  const now = opts.now || (() => Date.now());
  const onAlert = opts.onAlert || (() => {});
  let day = null;
  let global = { messages: 0, photos: 0 };
  let perIp = new Map();
  const alerted = new Set();

  function roll() {
    const d = new Date(now()).toISOString().slice(0, 10);
    if (d !== day) { day = d; global = { messages: 0, photos: 0 }; perIp = new Map(); alerted.clear(); }
  }

  function guard(kind) {
    const globalCap = kind === 'photos' ? 'globalPhotos' : 'globalMessages';
    const ipCap = kind === 'photos' ? 'perIpPhotos' : 'perIpMessages';
    const ipMessage = kind === 'photos' ? DAILY_IP_PHOTO : DAILY_IP_MESSAGE;
    return (req, res, next) => {
      roll();
      if (global[kind] >= limits[globalCap]) return res.status(429).json({ error: DAILY_GLOBAL });
      const ip = req.ip || 'onbekend';
      const rec = perIp.get(ip) || { messages: 0, photos: 0 };
      if (rec[kind] >= limits[ipCap]) return res.status(429).json({ error: ipMessage });
      rec[kind] += 1;
      perIp.set(ip, rec);
      global[kind] += 1;
      const cap = limits[globalCap];
      if (!alerted.has(kind) && global[kind] >= Math.ceil(cap * 0.8)) {
        alerted.add(kind);
        try { onAlert({ kind, count: global[kind], cap, day }); } catch {}
      }
      next();
    };
  }

  return {
    messageGuard: guard('messages'),
    photoGuard: guard('photos'),
    status() { roll(); return { dag: day, vandaag: { berichten: global.messages, fotos: global.photos }, limieten: { ...limits } }; },
  };
}

// --- toegangsbewijs voor de chatpagina ---------------------------------------------
// De sleutel in de chatpagina (BAKED_APP_KEY) is openbaar en beschermt dus niet. De
// server geeft de pagina bij het laden een tijdelijk toegangsbewijs mee: HMAC-SHA256
// over tijdstip en bezoekersadres, een uur geldig. Een script dat de API rechtstreeks
// aanroept moet dan per adres een verse pagina halen, elk uur opnieuw. Dat stopt geen
// vastberaden aanvaller (de dagplafonds doen dat), maar wel het simpele curl-script.
// Afdwingen gebeurt alleen met WEB_TOKEN_VERPLICHT=1 (zie index.js), zodat de native
// app eerst zijn eigen sleutel (APP_SECRET) kan krijgen. Port van eazyfix-bot b934327.
const crypto = require('node:crypto');
const WEB_TOKEN_TTL_MS = 60 * 60 * 1000;

function makeWebTokens(opts = {}) {
  const secret = opts.secret || process.env.WEB_TOKEN_SECRET || crypto.randomBytes(32).toString('hex');
  const now = opts.now || (() => Date.now());
  const ttl = opts.ttlMs || WEB_TOKEN_TTL_MS;
  const sign = (ts, ip) => crypto.createHmac('sha256', secret).update(`${ts}|${ip}`).digest('base64url');
  return {
    issue(ip) { const ts = now(); return `${ts}.${sign(ts, ip || '')}`; },
    verify(token, ip) {
      if (typeof token !== 'string') return false;
      const m = /^(\d+)\.([A-Za-z0-9_-]+)$/.exec(token);
      if (!m) return false;
      const ts = Number(m[1]);
      if (!Number.isFinite(ts) || now() - ts > ttl || ts > now() + 60 * 1000) return false;
      const expected = sign(ts, ip || '');
      const a = Buffer.from(m[2]), b = Buffer.from(expected);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    },
  };
}

// De chatpagina (testpagina op /) met per aanvraag een vers toegangsbewijs op de plek
// van __WEB_TOKEN__ in public/index.html. Per aanvraag gelezen (klein bestand, geen
// cache-verrassingen na een deploy).
function chatPage(publicDir, tokens) {
  const fs = require('node:fs');
  const file = require('node:path').join(publicDir, 'index.html');
  return (req, res) => {
    const html = fs.readFileSync(file, 'utf8').replace('__WEB_TOKEN__', tokens.issue(req.ip));
    res.set('Cache-Control', 'no-store');
    res.type('html').send(html);
  };
}

module.exports = {
  MAX_MESSAGE_CHARS, MESSAGE_TOO_LONG, messageTooLong,
  DAILY_LIMITS, DAILY_IP_MESSAGE, DAILY_IP_PHOTO, DAILY_GLOBAL, dailyLimitsFromEnv, makeDailyCaps,
  makeWebTokens, chatPage, WEB_TOKEN_TTL_MS,
  DEFAULT_ORIGINS,
  parseAllowedOrigins,
  originAllowed,
  corsOptions,
  API_LIMIT,
  IMAGE_LIMIT,
  API_LIMIT_MESSAGE,
  IMAGE_LIMIT_MESSAGE,
  makeLimiters,
};
