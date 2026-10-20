// Modelkeuze en clientinstellingen: ÉÉN bron voor chat.js en index.js, zodat de
// twee chatpaden en de fotoflow nooit op een ander model of andere instellingen
// uit elkaar lopen. Port van eazyfix-bot (NL) commit 4f8d5b0.
//
// Modelkeuze 20-10-2026: Claude Opus 5.5 vervangt Opus 4.8. Goedkoper per token
// (4/20 i.p.v. 5/25 dollar per miljoen), zelfde tokenizer. Twee verschillen die
// hier geregeld worden:
// 1. Opus 5.5 denkt altijd adaptief; `thinking` hoeft niet meegestuurd te worden
//    en kan niet uit. De tekstchat (die op 4.8 niet dacht) krijgt daarom de
//    denkstand 'low': kort of geen denkwerk bij gewone vragen, wel bij lastige.
//    De fotoflow houdt zijn eigen, hogere denkstand (zie index.js).
// 2. Een veiligheidsfilter kan een vraag weigeren (stop_reason 'refusal'). Twee
//    vangnetten: Anthropic probeert de vraag server-side op een passend ander model
//    (`fallbacks: 'default'` + beta-header op elke aanvraag), en blijft het een
//    weigering, dan krijgt de Heimwerker REFUSAL_TEXT in plaats van een lege bubbel.
const Anthropic = require('@anthropic-ai/sdk');

const DEFAULT_MODEL = 'claude-opus-5-5';

// MODEL in de omgeving (Render of .env) overschrijft de standaard; leeg = standaard.
function resolveModel(env = process.env) {
  return String(env.MODEL || '').trim() || DEFAULT_MODEL;
}
const MODEL = resolveModel();

const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
// Gaat mee in de body van ELKE modelaanroep (chat én foto).
const REQUEST_DEFAULTS = { fallbacks: 'default' };
// Denkstand van de tekstchat (runWithTools en /api/chat/stream).
const CHAT_EFFORT = { effort: 'low' };

// Eén plek om de SDK-client te maken, inclusief de beta-header voor het vangnet.
function createClient(opts = {}) {
  const { defaultHeaders, ...rest } = opts;
  return new Anthropic.default({
    apiKey: process.env.ANTHROPIC_API_KEY,
    ...rest,
    defaultHeaders: { 'anthropic-beta': FALLBACK_BETA, ...(defaultHeaders || {}) },
  });
}

// Du-vorm, zoals de Duitse persona (src/persona.js) de Heimwerker aanspreekt.
const REFUSAL_TEXT = 'Dabei kann ich dir leider nicht helfen. Stell mir gern eine Frage zur Holzreparatur oder zu den EAZYFIX® Produkten, dann helfe ich dir weiter.';

function isRefusal(response) {
  return Boolean(response && response.stop_reason === 'refusal');
}

module.exports = {
  DEFAULT_MODEL, MODEL, resolveModel, createClient,
  FALLBACK_BETA, REQUEST_DEFAULTS, CHAT_EFFORT, REFUSAL_TEXT, isRefusal,
};
