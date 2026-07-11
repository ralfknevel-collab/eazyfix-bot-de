// Herbruikbare chat-afhandeling met tool-use (non-streaming).
// Gebruikt door de /api/chat-endpoint én door de eval-harnas (eval/run.js),
// zodat tests precies dezelfde bot-pijplijn raken als productie.

const Anthropic = require('@anthropic-ai/sdk');
const { BASE_SYSTEM_PROMPT } = require('./persona');
const { CHAT_TOOLS, runTool } = require('./tools');
const { searchContext, relevantVideos } = require('./kennis');

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

const MODEL = process.env.MODEL || 'claude-opus-4-8';
const MAX_TOOL_ROUNDS = 4;

let client;
function anthropic() {
  if (!client) client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

// Algemene tool-use-lus. Lost tool-aanroepen op tot het model klaar is.
// opts: { system, model, tools, maxTokens, extra, onTool }. Geeft
// { text, content, toolCalls, usage } terug.
async function runWithTools(messages, opts = {}) {
  let convo = messages.slice();
  const toolCalls = [];
  let response;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    response = await anthropic().messages.create({
      model: opts.model || MODEL,
      max_tokens: opts.maxTokens || 8000,
      system: opts.system,
      tools: opts.tools || CHAT_TOOLS,
      messages: convo,
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

  const textBlock = response.content.find((b) => b.type === 'text');
  return { text: textBlock ? textBlock.text : '', content: response.content, toolCalls, usage: response.usage };
}

// Instructie voor het model: onder het antwoord verschijnt een videokaartje,
// dus mag het in de tekst kort uitnodigen de video te bekijken (zonder URL).
function videoInviteNote(videos) {
  return `ONDER JE ANTWOORD VERSCHIJNT EEN KLIKBAAR VIDEOKAARTJE met de EAZYFIX-video "${videos[0].title}". `
    + 'Sluit je antwoord af met EEN korte, natuurlijke uitnodiging om die te bekijken, '
    + 'bijvoorbeeld "Bekijk ook even de video hieronder, daar zie je het stap voor stap." '
    + 'Plak ZELF GEEN link, URL of YouTube-adres in je tekst (het kaartje regelt dat). '
    + 'Noem de videotitel niet letterlijk; verwijs gewoon naar "de video hieronder".';
}

// Locatiehint voor weather_lookup uit gedeelde coördinaten (of '' als onbekend).
function geoNote(geo) {
  if (!geo || !Number.isFinite(Number(geo.lat)) || !Number.isFinite(Number(geo.lon))) return '';
  return `\nGEDEELDE LOCATIE VAN DE KLUSSER: breedtegraad ${Number(geo.lat).toFixed(4)}, lengtegraad ${Number(geo.lon).toFixed(4)}. Gebruik deze lat/lon bij weather_lookup; vraag dan niet naar plaats of postcode.`;
}

// Bouw de system-context (persona + kennis + video-uitnodiging + geo) en kies de
// videokaartjes op basis van de VRAAG. GEDEELD door de non-streaming runChat én
// de streaming route in index.js, zodat beide chatpaden exact dezelfde guardrails,
// kennisinjectie, videokeuze en blok-volgorde gebruiken (geen drift).
function buildChatContext(userText, opts = {}) {
  const system = [{ type: 'text', text: BASE_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }];
  // Relevante kennis altijd vooraf injecteren, zodat het antwoord niet afhangt
  // van of het model zoek_kennis aanroept (de tool blijft als aanvulling beschikbaar).
  const ctx = searchContext(userText);
  if (ctx) system.push({ type: 'text', text: ctx });
  // Videokeuze op basis van de VRAAG (backend kiest, model verzint nooit een URL).
  // Als er een video bij past, mag het model in de tekst uitnodigen die te bekijken.
  const videos = relevantVideos(userText);
  if (videos.length) system.push({ type: 'text', text: videoInviteNote(videos) });
  const note = geoNote(opts.geo);
  if (note) system.push({ type: 'text', text: note });
  return { system, videos };
}

// Tekst-chat met de standaard botpersona en chat-tools.
async function runChat(messages, opts = {}) {
  const geo = opts.geo;
  const { system, videos } = buildChatContext(lastUserText(messages), { geo });
  const result = await runWithTools(messages, { model: opts.model, onTool: opts.onTool, geo, system });
  return { ...result, videos };
}

module.exports = { runChat, runWithTools, buildChatContext, geoNote, videoInviteNote };
