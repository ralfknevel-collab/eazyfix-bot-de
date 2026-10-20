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

module.exports = {
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
