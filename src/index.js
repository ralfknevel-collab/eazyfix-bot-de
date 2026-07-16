require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const { BASE_SYSTEM_PROMPT, IMAGE_ANALYSIS_PROMPT, IMAGE_DIAGNOSE_PROMPT } = require('./persona');
const { validateFeedback, feedbackEnabled, saveFeedback, logChat, uploadChatImages } = require('./feedback');
const { stripTags } = require('./parse');
const { CHAT_TOOLS, runTool } = require('./tools');
const { runChat, runWithTools, buildChatContext } = require('./chat');
const { productsInText } = require('./producten');
const { searchContext } = require('./kennis');
const { parseDiagnose, buildRagQuery, unclearReply, nietHoutReply, buildAnalysisPrompt,
  containsDistressSignal, distressReply, analyseFases } = require('./image-diagnose');
const { startKeepAlive } = require('./keepalive');

const MAX_TOOL_ROUNDS = 4;

const app = express();
const PORT = process.env.PORT || 3001;
const MODEL = process.env.MODEL || 'claude-opus-4-8';

// maxRetries: SDK doet automatisch exponentiële backoff bij tijdelijke fouten
// (429 rate limit, 500/503, en 529 "overloaded"). Bij een drukke Anthropic-server
// proberen we het dus stil een paar keer opnieuw vóór we opgeven.
const anthropic = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 4 });

// Vertaal een Anthropic/SDK-fout naar een korte, vriendelijke NL-melding voor de
// klusser. NOOIT de rauwe API-JSON of err.message tonen (dat lekte voorheen als
// {"type":"error",...} in de chat). Transiente drukte → vraag om zo opnieuw te
// proberen; overige fouten → neutrale melding zonder technische details.
function friendlyError(err) {
  const status = err && err.status;
  if (status === 429) return 'Es ist gerade sehr viel los. Warte eine halbe Minute und versuch es erneut.';
  if (status === 529 || status === 503 || status === 500) {
    return 'Der Assistent ist gerade überlastet. Versuch es in einer Minute noch einmal — deine Frage ist nicht verloren.';
  }
  return 'Da ist gerade etwas schiefgelaufen. Versuch es gleich erneut, oder ruf den Innendienst an unter +31 85 201 201 1.';
}

const VALID_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_IMAGES_PER_MESSAGE = 5;

// Validate one message's content (string or array of text/image blocks).
function validateContent(c) {
  if (typeof c === 'string') return c.length > 0;
  if (!Array.isArray(c) || c.length === 0) return false;
  let imageCount = 0;
  for (const b of c) {
    if (!b || typeof b !== 'object') return false;
    if (b.type === 'text') {
      if (typeof b.text !== 'string') return false;
    } else if (b.type === 'image') {
      imageCount++;
      if (imageCount > MAX_IMAGES_PER_MESSAGE) return false;
      if (typeof b.base64 !== 'string' || !VALID_IMAGE_TYPES.includes(b.mimeType)) return false;
    } else {
      return false;
    }
  }
  return true;
}

// Transform message content to Anthropic API shape.
function toAnthropicContent(c) {
  if (typeof c === 'string') return c;
  return c.map(b => {
    if (b.type === 'text') return { type: 'text', text: b.text };
    return {
      type: 'image',
      source: { type: 'base64', media_type: b.mimeType, data: b.base64 },
    };
  });
}

// Platte tekst uit het laatste user-bericht (string of contentblokken).
function lastUserMessageText(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'user') continue;
    if (typeof m.content === 'string') return m.content;
    if (Array.isArray(m.content)) {
      const texts = m.content.filter(b => b && b.type === 'text').map(b => b.text);
      if (texts.length) return texts.join(' ');
    }
  }
  return '';
}

// Maakt van de meegestuurde gespreksgeschiedenis een veilige, tekst-only lijst
// Anthropic-beurten. Foto-blokken worden weggelaten (te zwaar), elke beurt wordt
// op lengte afgekapt en alleen de laatste paar beurten blijven over.
function sanitizePriorText(messages) {
  if (!Array.isArray(messages)) return [];
  const PER_TURN = 1500; // tekens per beurt
  const MAX_TURNS = 6;
  const out = [];
  for (const m of messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
    let text = '';
    if (typeof m.content === 'string') text = m.content;
    else if (Array.isArray(m.content)) {
      text = m.content.filter(b => b && b.type === 'text').map(b => b.text).join(' ');
    }
    text = (text || '').trim();
    if (!text) continue; // lege of foto-only beurt overslaan
    out.push({ role: m.role, content: text.slice(0, PER_TURN) });
  }
  return out.slice(-MAX_TURNS);
}

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

// Request logging
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Health check — bewust vóór de auth-middleware, zodat je bereikbaarheid
// simpel kunt testen (bijv. in de browser op je telefoon).
app.get('/health', (_, res) => res.json({ ok: true, model: MODEL }));

// Favicon: stilletjes afhandelen vóór de auth-middleware, anders geeft de
// auto-request van browsers/clients een storende 401 in de console.
app.get('/favicon.ico', (_, res) => res.status(204).end());

// Test-chatvenster: statische pagina, bewust vóór de auth-middleware zodat
// de pagina zelf zonder sleutel laadt (de API-calls sturen de sleutel mee).
app.use(express.static('public'));

// Simple auth middleware (alleen actief als APP_SECRET gezet is)
app.use((req, res, next) => {
  const appSecret = process.env.APP_SECRET;
  if (appSecret && req.headers['x-app-key'] !== appSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// POST /api/analyze-image — vision analyse (1 of meerdere foto's)
app.post('/api/analyze-image', async (req, res) => {
  let images = [];
  if (Array.isArray(req.body.images)) {
    images = req.body.images;
  } else if (req.body.base64 && req.body.mimeType) {
    images = [{ base64: req.body.base64, mimeType: req.body.mimeType }];
  }

  if (images.length === 0) {
    return res.status(400).json({ error: 'images-Array (oder base64+mimeType) erforderlich' });
  }
  if (images.length > MAX_IMAGES_PER_MESSAGE) {
    return res.status(400).json({ error: `Max ${MAX_IMAGES_PER_MESSAGE} Fotos pro Anfrage` });
  }
  for (const img of images) {
    if (!img || typeof img.base64 !== 'string' || !VALID_IMAGE_TYPES.includes(img.mimeType)) {
      return res.status(400).json({ error: 'Ungültiges Foto: base64 + unterstützter mimeType nötig (jpeg/png/gif/webp)' });
    }
  }

  // Bewaar de ingestuurde foto('s) in Supabase Storage en log de chat-regel met
  // de publieke URLs (fire-and-forget; nooit blokkerend, draait alleen als
  // Supabase geconfigureerd is). Zo zijn de foto's terug te zien in Supabase.
  const conversationId = req.body.conversationId || null;
  // Optionele bijschrift-tekst: de gebruiker stuurde foto én vraag in één beurt.
  // Zonder dit werd de vraag genegeerd (en gaf de frontend een tweede los antwoord).
  const caption = typeof req.body.caption === 'string' ? req.body.caption.trim().slice(0, 2000) : '';
  function persistPhoto(answer) {
    if (!feedbackEnabled()) return;
    uploadChatImages({ conversation_id: conversationId, images })
      .then((image_urls) => logChat({ conversation_id: conversationId, question: caption ? '[foto] ' + caption : '[foto]', answer, image_urls }))
      .catch((e) => console.error('Foto-log mislukt:', e.message));
  }

  // VEILIGHEIDSGRENS, vóór alle foto-analyse. De regel in IMAGE_ANALYSIS_PROMPT
  // vuurt pas in pass 2, maar bij "geen hout" of een onduidelijke foto keert deze
  // handler al ná pass 1 terug en draait pass 2 nooit. Een noodsignaal in het
  // bijschrift zou dan onbeantwoord blijven. Deze check staat daarom vóór de
  // eerste modelcall en kost geen tokens.
  if (containsDistressSignal(caption)) {
    const reply = distressReply();
    console.log('Foto met noodsignaal in bijschrift: doorverwezen naar Telefonseelsorge, geen analyse.');
    if (feedbackEnabled()) {
      logChat({
        conversation_id: conversationId,
        question: '[foto] [noodsignaal, bijschrift niet gelogd]',
        answer: reply,
        image_urls: [],
      }).catch(() => {});
    }
    return res.json({ content: reply, flow: null, productIds: [], products: [], usage: null });
  }

  // Productfoto (verpakking/koker) i.p.v. houtschade: niet afwijzen met "geen
  // hout", maar de productvraag gewoon beantwoorden met de normale assistent
  // plus kennisbank-context.
  async function runProductAnswer(imageBlocks, caption) {
    const kennisContext = searchContext(caption || 'EAZYFIX Produkt', 3);
    const system = [{ type: 'text', text: BASE_SYSTEM_PROMPT }];
    if (kennisContext) system.push({ type: 'text', text: kennisContext });
    const userText = caption
      ? `Auf dem Foto ist ein EAZYFIX® Produkt (Verpackung, Kartusche oder Etikett), kein Holzschaden. Der Nutzer fragt: "${caption}". Beantworte diese Produktfrage. Kannst du etwas allein von der Verpackung nicht mit Sicherheit sagen (etwa das genaue Haltbarkeitsdatum oder die Chargennummer), verweise darauf, wo das auf der Verpackung steht, und frag es bei Bedarf nach.`
      : 'Auf dem Foto ist ein EAZYFIX® Produkt (Verpackung, Kartusche oder Etikett), kein Holzschaden. Sag kurz, welches Produkt du siehst, und frag, was der Nutzer dazu wissen möchte.';
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      thinking: { type: 'adaptive' },
      system,
      messages: [{ role: 'user', content: [...imageBlocks, { type: 'text', text: userText }] }],
    });
    const textBlock = response.content.find((b) => b.type === 'text');
    return { content: textBlock ? textBlock.text : '', usage: response.usage };
  }

  try {
    const imageBlocks = images.map(img => ({
      type: 'image',
      source: { type: 'base64', media_type: img.mimeType, data: img.base64 },
    }));
    // Tekst-geschiedenis van het lopende gesprek (zonder foto's: te zwaar en pass-1
    // diagnosticeert per foto). Zo gaat pass 2 door op eerder besproken schade i.p.v.
    // elke foto los te behandelen.
    const priorMessages = sanitizePriorText(req.body.messages);

    // Prompt-opbouw: één vs. meerdere foto's, lopend gesprek als aanvulling, en het
    // optionele bijschrift (foto + vraag in één beurt → één antwoord). Puur helper,
    // zodat dit contract getest is (zie test/image-diagnose.test.js).
    const promptText = buildAnalysisPrompt({
      imageCount: images.length,
      hasPrior: priorMessages.length > 0,
      caption,
    });

    // Pass 1: snelle, goedkope, gestructureerde JSON-diagnose. Bepaalt of de
    // foto bruikbaar is en levert gerichte zoektermen voor de kennisbank.
    let diagnose = null;
    try {
      const diagResp = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1024,
        output_config: { effort: 'low' },
        system: IMAGE_DIAGNOSE_PROMPT,
        messages: [{ role: 'user', content: [...imageBlocks, { type: 'text', text: 'Geef de diagnose als JSON.' }] }],
      });
      const diagText = (diagResp.content.find((b) => b.type === 'text') || {}).text || '';
      diagnose = parseDiagnose(diagText);
    } catch (e) {
      console.error('Pass-1 diagnose mislukt, val terug op een-pass:', e.message);
    }

    // Productfoto (koker/verpakking) met een productvraag: niet als "geen hout"
    // afwijzen, maar de vraag beantwoorden. Staat vóór de hout-check, want een
    // productfoto is per definitie geen houtschade.
    if (diagnose && diagnose.isProduct) {
      const out = await runProductAnswer(imageBlocks, caption);
      persistPhoto(out.content);
      return res.json({ content: out.content, flow: null, productIds: [], products: productsInText(out.content), usage: out.usage });
    }

    // Geen hout (steen/metselwerk/beton/metaal/...): buiten scope, geen gok.
    if (diagnose && !diagnose.isHout) {
      const reply = nietHoutReply(diagnose);
      persistPhoto(reply);
      return res.json({ content: reply, flow: null, productIds: [], products: [], usage: null });
    }

    // Foto onduidelijk: vraag om een betere foto in plaats van te gokken.
    if (diagnose && !diagnose.duidelijk) {
      const reply = unclearReply(diagnose);
      persistPhoto(reply);
      return res.json({ content: reply, flow: null, productIds: [], products: [], usage: null });
    }

    // Geldige diagnose: haal gericht kennisbank-context op en geef een hint mee.
    // Mislukte diagnose: lege context, dan mag het model in pass-2 zelf
    // zoek_kennis aanroepen (oude een-pass-gedrag als vangnet).
    let kennisContext = '';
    let hint = '';
    if (diagnose) {
      kennisContext = searchContext(buildRagQuery(diagnose), 3);
      hint = `\n\nVorläufige Diagnose (nutze als Hinweis, prüfe selbst am Foto): Schaden scheint ${diagnose.schadeType || 'unbekannt'}, Schweregrad ${diagnose.ernst}.`;
    }

    // Pass 2: het warme, volledige analyse-antwoord. zoek_kennis blijft als
    // vangnet beschikbaar; de opgehaalde context staat al in de system-prompt.
    const system = [{ type: 'text', text: IMAGE_ANALYSIS_PROMPT }];
    if (kennisContext) system.push({ type: 'text', text: kennisContext });

    const { text: raw, usage } = await runWithTools(
      [...priorMessages, { role: 'user', content: [...imageBlocks, { type: 'text', text: promptText + hint }] }],
      {
        model: MODEL,
        system,
        maxTokens: 8000,
        extra: { thinking: { type: 'adaptive' }, output_config: { effort: 'xhigh' } },
        onTool: (name, input) => console.log(`  tool: ${name}(${JSON.stringify(input)})`),
      }
    );

    // Machine-tags (FLOW / PRODUCTS) strippen en uitlezen. Vangt zowel de nette
    // trailing-regels als de gelekte parenthese-vorm "(flow: … · producten: …)".
    const { text, flow, productIds } = stripTags(raw);

    persistPhoto(text);
    res.json({ content: text, flow, productIds, products: productsInText(text), usage });
  } catch (err) {
    console.error('Image analysis error:', err.message);
    if (err.status === 401) return res.status(502).json({ error: 'Invalid API key' });
    // Anthropic 400 = foto onbruikbaar (te klein, corrupt, niet te decoderen).
    // Niet de server stuk: laat de app om een betere foto vragen.
    if (err.status === 400) {
      return res.status(400).json({ error: 'Foto unbrauchbar — schick ein schärferes Foto bei gutem Tageslicht.' });
    }
    if (err.status === 429) return res.status(429).json({ error: friendlyError(err) });
    res.status(500).json({ error: friendlyError(err) });
  }
});

// POST /api/analyze-image/stream, zelfde analyse als /api/analyze-image, maar als
// SSE. Zendt fase-events (foto/schade/kennisbank/advies) op echte mijlpalen, streamt
// pass 2 woord voor woord (met dezelfde tool-lus als vangnet als de niet-streaming
// handler via runWithTools), en houdt de verbinding open met een heartbeat tijdens
// de stille denk-pauze van pass 2 (anders kapt een tussenliggende proxy een lange
// stille stream af). De oude /api/analyze-image blijft ongewijzigd als fallback.
app.post('/api/analyze-image/stream', async (req, res) => {
  const images = Array.isArray(req.body.images) ? req.body.images : [];
  if (images.length === 0) {
    return res.status(400).json({ error: 'images-Array (oder base64+mimeType) erforderlich' });
  }
  if (images.length > MAX_IMAGES_PER_MESSAGE) {
    return res.status(400).json({ error: `Max ${MAX_IMAGES_PER_MESSAGE} Fotos pro Anfrage` });
  }
  for (const img of images) {
    if (!img || typeof img.base64 !== 'string' || !VALID_IMAGE_TYPES.includes(img.mimeType)) {
      return res.status(400).json({ error: 'Ungültiges Foto: base64 + unterstützter mimeType nötig (jpeg/png/gif/webp)' });
    }
  }
  const conversationId = req.body.conversationId || null;
  const caption = typeof req.body.caption === 'string' ? req.body.caption.trim().slice(0, 2000) : '';
  const priorMessages = sanitizePriorText(req.body.messages);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  // Heartbeat: SSE-commentaarregel elke 10s, houdt de verbinding open tijdens de
  // denk-pauze van pass 2. Een commentaarregel (begint met ':') negeert de client.
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 10000);
  // Stopt de modelstream als de klusser de pagina sluit. BEWUST res.on('close'),
  // niet req.on('close'): dat laatste vuurt ook bij een normale, voltooide
  // request/response-cyclus en zou de stream dan meteen weer afbreken.
  const abort = new AbortController();
  res.on('close', () => { abort.abort(); clearInterval(heartbeat); });

  // Verzamelt het volledige antwoord voor de fire-and-forget foto-log achteraf.
  let volledig = '';
  const logStraks = () => {
    if (!volledig || !feedbackEnabled()) return;
    uploadChatImages({ conversation_id: conversationId, images })
      .then((image_urls) => logChat({ conversation_id: conversationId, question: caption ? '[foto] ' + caption : '[foto]', answer: volledig, image_urls }))
      .catch((e) => console.error('Foto-log mislukt:', e.message));
  };
  // Streamt een kant-en-klaar antwoord als één tekst-event (voor de korte routes).
  const streamTekst = (tekst) => { volledig = tekst; send({ text: tekst }); };

  try {
    const imageBlocks = images.map(img => ({
      type: 'image',
      source: { type: 'base64', media_type: img.mimeType, data: img.base64 },
    }));

    // VEILIGHEIDSGRENS, vóór alle foto-analyse, net als de niet-streaming handler.
    // Geen fase-events; de foto's en het bijschrift worden hier bewust NIET gelogd.
    if (containsDistressSignal(caption)) {
      const reply = distressReply();
      console.log('Foto met noodsignaal in bijschrift: doorverwezen naar Telefonseelsorge, geen analyse.');
      if (feedbackEnabled()) {
        logChat({ conversation_id: conversationId, question: '[foto] [noodsignaal, bijschrift niet gelogd]', answer: reply, image_urls: [] }).catch(() => {});
      }
      send({ text: reply });
      send({ done: true, wenselijkeFotos: [] });
      return res.end();
    }

    // Fase 1: foto bekijken.
    send({ phase: 'foto' });

    // Pass 1: snelle, goedkope, gestructureerde JSON-diagnose. Eén poging, net als
    // de niet-streaming handler: mislukt pass 1, dan loopt pass 2 hieronder door
    // met lege kennis-context en mag het model zelf zoek_kennis aanroepen (oude
    // een-pass-gedrag als vangnet, zie image-diagnose.js analyseFases).
    let diagnose = null;
    try {
      const diagResp = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1024,
        output_config: { effort: 'low' },
        system: IMAGE_DIAGNOSE_PROMPT,
        messages: [{ role: 'user', content: [...imageBlocks, { type: 'text', text: 'Geef de diagnose als JSON.' }] }],
      }, { signal: abort.signal });
      const diagText = (diagResp.content.find((b) => b.type === 'text') || {}).text || '';
      diagnose = parseDiagnose(diagText);
    } catch (e) {
      if (abort.signal.aborted) throw e;
      console.error('Pass-1 diagnose mislukt, val terug op een-pass:', e.message);
    }

    // Fase 2: schade bepaald.
    send({ phase: 'schade' });

    const plan = analyseFases(diagnose);
    if (plan.route === 'unclear') { streamTekst(unclearReply(diagnose)); send({ done: true, wenselijkeFotos: [] }); logStraks(); return res.end(); }
    if (plan.route === 'niethout') { streamTekst(nietHoutReply(diagnose)); send({ done: true, wenselijkeFotos: [] }); logStraks(); return res.end(); }
    if (plan.route === 'product') {
      // Productvraag: gewone assistent plus kennisbank-context, in één antwoord.
      const kennisContext = searchContext(caption || 'EAZYFIX Produkt', 3);
      const system = [{ type: 'text', text: BASE_SYSTEM_PROMPT }];
      if (kennisContext) system.push({ type: 'text', text: kennisContext });
      const userText = caption
        ? `Auf dem Foto ist ein EAZYFIX® Produkt (Verpackung, Kartusche oder Etikett), kein Holzschaden. Der Nutzer fragt: "${caption}". Beantworte diese Produktfrage. Kannst du etwas allein von der Verpackung nicht mit Sicherheit sagen (etwa das genaue Haltbarkeitsdatum oder die Chargennummer), verweise darauf, wo das auf der Verpackung steht, und frag es bei Bedarf nach.`
        : 'Auf dem Foto ist ein EAZYFIX® Produkt (Verpackung, Kartusche oder Etikett), kein Holzschaden. Sag kurz, welches Produkt du siehst, und frag, was der Nutzer dazu wissen möchte.';
      const resp = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 2000,
        thinking: { type: 'adaptive' },
        system,
        messages: [{ role: 'user', content: [...imageBlocks, { type: 'text', text: userText }] }],
      }, { signal: abort.signal });
      const tekst = (resp.content.find((b) => b.type === 'text') || {}).text || '';
      streamTekst(tekst); send({ done: true, wenselijkeFotos: [] }); logStraks(); return res.end();
    }

    // Advies-pad: fase 3, kennisbank vooraf ophalen als hint. Mislukte diagnose:
    // lege context en hint, dan mag het model in pass 2 zelf zoek_kennis aanroepen.
    send({ phase: 'kennisbank' });
    const promptText = buildAnalysisPrompt({ imageCount: images.length, hasPrior: priorMessages.length > 0, caption });
    let kennisContext = '';
    let hint = '';
    if (diagnose) {
      kennisContext = searchContext(buildRagQuery(diagnose), 3);
      hint = `\n\nVorläufige Diagnose (nutze als Hinweis, prüfe selbst am Foto): Schaden scheint ${diagnose.schadeType || 'unbekannt'}, Schweregrad ${diagnose.ernst}.`;
    }

    // Fase 4: advies opstellen, pass 2 als stream met dezelfde tool-lus als de
    // niet-streaming handler (zoek_kennis blijft als vangnet beschikbaar).
    send({ phase: 'advies' });
    const system = [{ type: 'text', text: IMAGE_ANALYSIS_PROMPT }];
    if (kennisContext) system.push({ type: 'text', text: kennisContext });

    let convo = [...priorMessages, { role: 'user', content: [...imageBlocks, { type: 'text', text: promptText + hint }] }];
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const stream = anthropic.messages.stream({
        model: MODEL,
        max_tokens: 8000,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'xhigh' },
        system,
        tools: CHAT_TOOLS,
        messages: convo,
      }, { signal: abort.signal });

      let roundText = '';
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          roundText += event.delta.text;
          volledig += event.delta.text;
          send({ text: event.delta.text });
        }
      }
      const final = await stream.finalMessage();
      if (final.stop_reason !== 'tool_use') break;
      // Tool-ronde: geen aankondigingstekst getoond (de fase-events dekken dat al).
      const toolResults = await Promise.all(
        final.content
          .filter((b) => b.type === 'tool_use')
          .map(async (b) => {
            console.log(`  tool: ${b.name}(${JSON.stringify(b.input)})`);
            return { type: 'tool_result', tool_use_id: b.id, content: await runTool(b.name, b.input, {}) };
          })
      );
      convo = [...convo, { role: 'assistant', content: final.content }, { role: 'user', content: toolResults }];
    }

    // Defensief tegen tag-lek (PRODUCTS:/FLOW:), zelfde aanpak als /api/chat/stream:
    // deze regels horen NOOIT zichtbaar te blijven. Strip ze pas als de volledige
    // tekst binnen is en corrigeer de client met een reset plus de schone tekst.
    const cleaned = stripTags(volledig).text;
    if (cleaned !== volledig) {
      send({ reset: true });
      send({ text: cleaned });
      volledig = cleaned;
    }
    send({ done: true, geanalyseerd: true, wenselijkeFotos: [] });
    logStraks();
    res.end();
  } catch (err) {
    if (!abort.signal.aborted) {
      console.error('Foto-stream-fout:', err.message);
      send({ error: friendlyError(err) });
    }
    res.end();
  } finally {
    clearInterval(heartbeat);
  }
});

// POST /api/chat — non-streaming
app.post('/api/chat', async (req, res) => {
  const { messages, model, geo } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages-Array erforderlich' });
  }
  for (const m of messages) {
    if (!['user', 'assistant'].includes(m.role) || !validateContent(m.content)) {
      return res.status(400).json({ error: 'Ungültiges Nachrichtenformat' });
    }
  }

  try {
    const convo = messages.map(m => ({ role: m.role, content: toAnthropicContent(m.content) }));
    const { text, usage, videos } = await runChat(convo, {
      model,
      geo,
      onTool: (name, input) => console.log(`  tool: ${name}(${JSON.stringify(input)})`),
    });
    res.json({ content: text, products: productsInText(text), videos: videos || [], usage });
  } catch (err) {
    console.error('Anthropic error:', err.message);
    if (err.status === 401) return res.status(502).json({ error: 'Invalid API key' });
    if (err.status === 429) return res.status(429).json({ error: friendlyError(err) });
    res.status(500).json({ error: friendlyError(err) });
  }
});

// POST /api/chat/stream — streaming (SSE)
app.post('/api/chat/stream', async (req, res) => {
  const { messages, model, conversationId, geo } = req.body;

  // Volledige validatie vóór de SSE-headers, zodat ongeldige invoer net als
  // /api/chat een echte HTTP 400 krijgt (en niet een 200 met SSE-fout).
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages-Array erforderlich' });
  }
  for (const m of messages) {
    if (!['user', 'assistant'].includes(m.role) || !validateContent(m.content)) {
      return res.status(400).json({ error: 'Ungültiges Nachrichtenformat' });
    }
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    let convo = messages.map(m => ({ role: m.role, content: toAnthropicContent(m.content) }));
    let fullText = '';

    // Tekst van het laatste user-bericht (voor kennis-injectie en videolinks).
    const userText = lastUserMessageText(messages);

    // System-context + videokeuze via de GEDEELDE builder, zodat de streaming-route
    // exact dezelfde persona, kennisinjectie, videokeuze en geo-hint gebruikt als
    // het non-streaming /api/chat-pad (geen drift in guardrails).
    const { system, videos } = buildChatContext(userText, { geo });

    // Tool-use-lus met streaming: stream tekst-deltas per ronde naar de client.
    // Blijkt een ronde toch een tool-aanroep te zijn, dan was die tekst slechts
    // een aankondiging ("even kijken in de kennisbank...") — die hoort de klusser
    // niet te zien. We sturen dan een `reset` zodat de client de tussen-tekst wist;
    // alleen de tekst van de laatste (niet-tool) ronde blijft staan.
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const stream = anthropic.messages.stream({
        model: model || MODEL,
        max_tokens: 8000,
        system,
        tools: CHAT_TOOLS,
        messages: convo,
      });

      let roundText = '';
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          roundText += event.delta.text;
          res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
        }
      }

      const final = await stream.finalMessage();
      if (final.stop_reason !== 'tool_use') {
        // Echte antwoord-ronde: dit is de tekst die blijft staan.
        fullText = roundText;
        break;
      }
      // Tool-ronde: wis de zojuist getoonde aankondiging bij de client.
      if (roundText) res.write(`data: ${JSON.stringify({ reset: true })}\n\n`);
      // Laat de client weten dat de bot iets opzoekt (toont "momentje...").
      res.write(`data: ${JSON.stringify({ status: 'tool' })}\n\n`);
      const toolResults = await Promise.all(
        final.content
          .filter(b => b.type === 'tool_use')
          .map(async b => {
            console.log(`  tool: ${b.name}(${JSON.stringify(b.input)})`);
            return { type: 'tool_result', tool_use_id: b.id, content: await runTool(b.name, b.input, { geo }) };
          })
      );
      convo = [...convo, { role: 'assistant', content: final.content }, { role: 'user', content: toolResults }];
    }

    // Defensief tegen tag-lek: mocht het model onverhoopt tóch een machine-tag
    // in de zichtbare tekst zetten (PRODUCTS:/FLOW: of de gelekte parenthese-vorm),
    // dan strippen we die uit de volledige tekst en corrigeren we de client met
    // een reset + schone tekst. Triggert alleen als er echt iets te strippen valt.
    const cleaned = stripTags(fullText).text;
    if (cleaned !== fullText) {
      res.write(`data: ${JSON.stringify({ reset: true })}\n\n`);
      res.write(`data: ${JSON.stringify({ text: cleaned })}\n\n`);
      fullText = cleaned;
    }

    // De webapp linkt productnamen inline in de antwoordtekst (linkifyProducts);
    // er is geen los productkaartje meer. Daarom sturen we GEEN products-payload
    // mee in de stream (die werd toch genegeerd). Zie ook /api/chat (non-stream),
    // dat products nog wél teruggeeft voor de eval-harnas.

    // Videokaartje (al op de vraag bepaald, zie boven).
    if (videos.length) res.write(`data: ${JSON.stringify({ videos })}\n\n`);

    if (fullText && feedbackEnabled()) {
      logChat({
        conversation_id: conversationId || null,
        question: userText,
        answer: fullText,
      }).catch(e => console.error('Chatlog mislukt:', e.message));
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('Stream error:', err.message);
    res.write(`data: ${JSON.stringify({ error: friendlyError(err) })}\n\n`);
    res.end();
  }
});

// POST /api/feedback — bewaar een beoordeling (duim op/neer + opmerking)
app.post('/api/feedback', async (req, res) => {
  const result = validateFeedback(req.body);
  if (!result.ok) return res.status(400).json({ error: result.error });
  if (!feedbackEnabled()) {
    return res.status(503).json({ error: 'Feedback deaktiviert (keine Supabase-Konfiguration)' });
  }
  try {
    await saveFeedback(result.value);
    res.json({ ok: true });
  } catch (err) {
    console.error('Feedback opslaan mislukt:', err.message);
    res.status(502).json({ error: 'Feedback konnte nicht gespeichert werden' });
  }
});

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('✗ ANTHROPIC_API_KEY ontbreekt in backend/.env — AI-calls falen. Stop.');
  process.exit(1);
}

const server = app.listen(PORT, () => {
  console.log(`EAZYFIX API draait op http://localhost:${PORT}`);
  console.log(`Model:       ${MODEL}`);
  console.log(`Anthropic key: ${process.env.ANTHROPIC_API_KEY ? '✓ set' : '✗ missing'}`);
  console.log(`App secret:    ${process.env.APP_SECRET ? '✓ set' : '○ disabled'}`);
  console.log(`Telegram:      ${process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID ? '✓ set' : '○ disabled'}`);
  startKeepAlive();
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`✗ Poort ${PORT} al in gebruik (oud proces?). Vrijmaken:`);
    console.error(`    lsof -ti:${PORT} | xargs kill -9`);
  } else {
    console.error('✗ Serverfout:', err.message);
  }
  process.exit(1);
});
