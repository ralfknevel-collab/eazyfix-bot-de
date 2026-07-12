require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const { IMAGE_ANALYSIS_PROMPT, IMAGE_DIAGNOSE_PROMPT } = require('./persona');
const { validateFeedback, feedbackEnabled, saveFeedback, logChat, uploadChatImages } = require('./feedback');
const { stripTags } = require('./parse');
const { CHAT_TOOLS, runTool } = require('./tools');
const { runChat, runWithTools, buildChatContext } = require('./chat');
const { productsInText } = require('./producten');
const { searchContext } = require('./kennis');
const { parseDiagnose, buildRagQuery, unclearReply, nietHoutReply } = require('./image-diagnose');
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
  function persistPhoto(answer) {
    if (!feedbackEnabled()) return;
    uploadChatImages({ conversation_id: conversationId, images })
      .then((image_urls) => logChat({ conversation_id: conversationId, question: '[foto]', answer, image_urls }))
      .catch((e) => console.error('Foto-log mislukt:', e.message));
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

    let promptText = images.length > 1
      ? `Analysiere diese ${images.length} Fotos der beschädigten Stelle (verschiedene Winkel/Details desselben Schadens).`
      : 'Analysiere dieses Foto der beschädigten Stelle.';
    // Loopt er al een gesprek? Behandel de foto dan als aanvulling op de eerder
    // besproken schade in plaats van als losstaand geval.
    if (priorMessages.length > 0) {
      promptText += ' Dieses Gespräch läuft bereits; dieses Foto ergänzt den zuvor besprochenen Schaden. Mach damit weiter und behandle es nicht als eigenständigen neuen Fall.';
    }

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
