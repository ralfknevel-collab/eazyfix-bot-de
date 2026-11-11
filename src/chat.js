// Herbruikbare chat-afhandeling met tool-use (non-streaming).
// Gebruikt door de /api/chat-endpoint én door de eval-harnas (eval/run.js),
// zodat tests precies dezelfde bot-pijplijn raken als productie.

const { MODEL, createClient, REQUEST_DEFAULTS, CHAT_EFFORT, REFUSAL_TEXT, isRefusal } = require('./model');
const { BASE_SYSTEM_PROMPT } = require('./persona');
const { CHAT_TOOLS, runTool } = require('./tools');
const { searchContext, relevantVideos } = require('./kennis');
const { contextNote, contextZoekterm } = require('./context');

// Platte tekst uit het laatste gebruikersbericht halen (string of contentblokken).
function lastUserText(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'user') continue;
    if (typeof m.content === 'string') return m.content;
    if (Array.isArray(m.content)) {
      return m.content.filter((b) => b && b.type === 'text').map((b) => b.text).join(' ');
    }
  }
  return '';
}

const MAX_TOOL_ROUNDS = 4;

let client;
function anthropic() {
  if (!client) client = createClient();
  return client;
}

// Algemene tool-use-lus. Lost tool-aanroepen op tot het model klaar is.
// opts: { system, model, tools, maxTokens, extra, onTool, client }. Geeft
// { text, content, toolCalls, usage, refused } terug. Standaard denkstand van de
// tekstchat is CHAT_EFFORT; opts.extra (fotoflow) mag die overschrijven.
async function runWithTools(messages, opts = {}) {
  let convo = messages.slice();
  const toolCalls = [];
  let response;
  const api = opts.client || anthropic();

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    response = await api.messages.create({
      model: opts.model || MODEL,
      max_tokens: opts.maxTokens || 8000,
      system: opts.system,
      tools: opts.tools || CHAT_TOOLS,
      messages: convo,
      output_config: CHAT_EFFORT,
      ...REQUEST_DEFAULTS,
      ...(opts.extra || {}),
    });
    if (response.stop_reason !== 'tool_use') break;
    const results = await Promise.all(
      response.content
        .filter((b) => b.type === 'tool_use')
        .map(async (b) => {
          toolCalls.push({ name: b.name, input: b.input });
          if (opts.onTool) opts.onTool(b.name, b.input);
          return { type: 'tool_result', tool_use_id: b.id, content: await runTool(b.name, b.input, { geo: opts.geo }) };
        })
    );
    convo = [...convo, { role: 'assistant', content: response.content }, { role: 'user', content: results }];
  }

  // Weigering door de veiligheidsfilter (ook na het server-side vangnet): nette
  // zin in plaats van een lege bubbel. Inhoud lezen op type, nooit op positie.
  if (isRefusal(response)) {
    return { text: REFUSAL_TEXT, content: response.content, toolCalls, usage: response.usage, refused: true };
  }
  const textBlock = response.content.find((b) => b.type === 'text');
  return { text: textBlock ? textBlock.text : '', content: response.content, toolCalls, usage: response.usage, refused: false };
}

// Instructie voor het model: onder het antwoord verschijnen een of meer
// videokaartjes, dus mag het in de tekst kort uitnodigen die te bekijken (zonder URL).
// Geen video bij dit antwoord: zeg dat expliciet, anders kopieert het model de
// uitnodiging uit een eerder antwoord (port eazyfix-bot, feedback #116).
const GEEN_VIDEO_NOTE = 'UNTER DIESER ANTWORT ERSCHEINT KEINE VIDEOKARTE. Verweise also nicht auf ein Video unten oder im Chat, auch nicht, wenn du das in einer früheren Antwort getan hast.';
function videoNote(videos) {
  return videos && videos.length ? videoInviteNote(videos) : GEEN_VIDEO_NOTE;
}

function videoInviteNote(videos) {
  const mehrere = videos.length > 1;
  const titel = videos.map((v) => `"${v.title}"`).join(', ');
  return (mehrere
    ? `UNTER DEINER ANTWORT ERSCHEINEN ${videos.length} KLICKBARE VIDEOKARTEN mit den EAZYFIX-Videos ${titel}. `
    : `UNTER DEINER ANTWORT ERSCHEINT EINE KLICKBARE VIDEOKARTE mit dem EAZYFIX-Video ${titel}. `)
    + 'Setz in deine Antwort EINE kurze, natürliche Einladung, '
    + (mehrere ? 'sie anzusehen, zum Beispiel "Schau dir die Videos unten an, da siehst du es Schritt für Schritt."'
               : 'es anzusehen, zum Beispiel "Schau dir auch kurz das Video unten an, da siehst du es Schritt für Schritt."') + ' '
    + 'Schreib diese Einladung in der Sprache deiner Antwort: antwortest du auf Englisch, dann zum Beispiel "Have a look at the video below, it shows you step by step." '
    + 'Setz diese Einladung direkt VOR deine Schlussfrage oder Fotobitte, nie danach: deine Frage an den Heimwerker steht immer am Ende. Hast du keine Schlussfrage, darf die Einladung der letzte Satz sein. '
    + 'Füge SELBST KEINEN Link, keine URL und keine YouTube-Adresse in deinen Text ein (die Karten erledigen das). '
    + 'Nenne die Videotitel nicht wörtlich; verweise einfach auf "das Video unten" oder "die Videos unten".';
}

// Wie viele Videokarten gehören zu dieser Frage? Bei einer ausdrücklichen
// Wie-mache-ich- oder Anleitungsfrage mehr; bei einer kurzen, gezielten Frage eine.
const BREITE_ANLEITUNGSFRAGE = /\b(anleitung|schritt f(ü|ue)r schritt|schritt-f(ü|ue)r-schritt|wie gehe ich|wie mache ich|wie repariere|wie muss ich|wie funktioniert|vollst(ä|ae)ndige|komplette|alle schritte|von anfang bis ende|was muss ich tun|welche schritte|genau vorgehen|erkl(ä|ae)rung)\b/i;
function videoLimit(userText) {
  return BREITE_ANLEITUNGSFRAGE.test(String(userText || '')) ? 3 : 2;
}

// Gedeelde browserlocatie controleren en afronden op twee decimalen (ongeveer een
// kilometer). Voor het weer is dat ruim genoeg, en een huisadres is er niet meer uit
// af te leiden. Alles wat de server met de locatie doet (prompt, weerdienst) gebruikt
// deze afgeronde waarde; de precieze coördinaten van de browser gaan nergens heen.
// Geeft null bij ontbrekende of onmogelijke waarden. Port eazyfix-bot 5530fbf.
function roundGeo(geo) {
  if (!geo || typeof geo !== 'object') return null;
  if (geo.lat === null || geo.lon === null || geo.lat === '' || geo.lon === '') return null;
  const lat = Number(geo.lat), lon = Number(geo.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100 };
}

// Locatiehint voor weather_lookup uit gedeelde coördinaten (of '' als onbekend).
function geoNote(geo) {
  const g = roundGeo(geo);
  if (!g) return '';
  return `\nGETEILTER STANDORT DES HEIMWERKERS (gerundet): Breitengrad ${g.lat}, Längengrad ${g.lon}. Nutze diese lat/lon bei weather_lookup; frag dann nicht nach Ort oder Postleitzahl.`;
}

// Bouw de system-context (persona + kennis + video-uitnodiging + geo) en kies de
// videokaartjes op basis van de VRAAG. GEDEELD door de non-streaming runChat én
// de streaming route in index.js, zodat beide chatpaden exact dezelfde guardrails,
// kennisinjectie, videokeuze en blok-volgorde gebruiken (geen drift).
function buildChatContext(userText, opts = {}) {
  const system = [{ type: 'text', text: BASE_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }];
  // Relevante kennis altijd vooraf injecteren, zodat het antwoord niet afhangt
  // van of het model zoek_kennis aanroept (de tool blijft als aanvulling beschikbaar).
  // Context uit het iframe-adres (product, pagina, klus, taal; src/context.js).
  const extra = contextZoekterm(opts.context, userText);
  const ctx = searchContext(extra ? `${userText} ${extra}` : userText);
  if (ctx) system.push({ type: 'text', text: ctx });
  const siteNote = contextNote(opts.context);
  if (siteNote) system.push({ type: 'text', text: siteNote });
  // Videokeuze op basis van de VRAAG (backend kiest, model verzint nooit een URL).
  // Als er een video bij past, mag het model in de tekst uitnodigen die te bekijken.
  const videos = relevantVideos(userText, { limit: videoLimit(userText) });
  system.push({ type: 'text', text: videoNote(videos) });
  const note = geoNote(opts.geo);
  if (note) system.push({ type: 'text', text: note });
  return { system, videos };
}

// Tekst-chat met de standaard botpersona en chat-tools.
async function runChat(messages, opts = {}) {
  const geo = opts.geo;
  const { system, videos } = buildChatContext(lastUserText(messages), { geo, context: opts.context });
  const result = await runWithTools(messages, { model: opts.model, onTool: opts.onTool, geo, system });
  return { ...result, videos };
}

module.exports = { runChat, runWithTools, buildChatContext, geoNote, roundGeo, videoInviteNote, videoNote, GEEN_VIDEO_NOTE, videoLimit };
