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

// Denkstand van de fotodiagnose (pass 2, wat de klusser echt krijgt). Standaard
// 'high': gemeten 20-10-2026 (NL-bot, 8 foto's) gaf Opus 5.5 op xhigh een mediaan van
// 44 s per foto en op high 25 s (gelijk aan Opus 4.8) met dezelfde diagnoses. Via
// FOTO_EFFORT (low|medium|high|xhigh|max) aan te passen zonder code te wijzigen.
const PHOTO_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
function resolvePhotoEffort(env = process.env) {
  const v = String(env.FOTO_EFFORT || '').trim().toLowerCase();
  return { effort: PHOTO_EFFORTS.includes(v) ? v : 'high' };
}
const PHOTO_EFFORT = resolvePhotoEffort();

// Vangnet tegen markdown in het antwoord: de persona verbiedt het, maar Opus 5.5 zette
// in de NL-meting in 1 van 8 foto-antwoorden toch vet en opsommingstekens. Widget en
// app tonen tekst letterlijk. Verwijdert kopjes (#), opsommingstekens (- of * aan het
// begin), vet (**x**) en cursief (*x*); inhoud, regeleinden en nummering blijven.
function stripMarkdown(text) {
  return String(text || '')
    .replace(/^#{1,6}[ \t]+/gm, '')
    .replace(/^[ \t]*[-*][ \t]+/gm, '') // alleen spaties, geen regeleinden: lege regels blijven
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1$2');
}

module.exports = {
  DEFAULT_MODEL, MODEL, resolveModel, createClient,
  FALLBACK_BETA, REQUEST_DEFAULTS, CHAT_EFFORT, REFUSAL_TEXT, isRefusal,
  PHOTO_EFFORT, resolvePhotoEffort, stripMarkdown,
};
