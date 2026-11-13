const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const express = require('express');
const cors = require('cors');
const {
  DEFAULT_ORIGINS, parseAllowedOrigins, originAllowed, corsOptions,
  API_LIMIT, IMAGE_LIMIT, API_LIMIT_MESSAGE, IMAGE_LIMIT_MESSAGE, makeLimiters,
} = require('../src/abuse-guard');

// Port van eazyfix-bot (cf9a663, daar weer een port van repair-care-bot 9dab9ba en
// f6a7cfd) naar de Duitse EAZYFIX-bot, 20-10-2026. Standaard-allowlist: de eigen
// Render-host en de Duitse site. De native app stuurt geen Origin en blijft werken.

// --- herkomstcontrole -------------------------------------------------------

test('parseAllowedOrigins: leeg -> standaardlijst (Render-host, eazy-fix.de), lijst -> getrimd en gesplitst', () => {
  assert.deepEqual(parseAllowedOrigins(undefined), DEFAULT_ORIGINS);
  assert.deepEqual(parseAllowedOrigins(''), DEFAULT_ORIGINS);
  assert.deepEqual(parseAllowedOrigins(' https://a.example , https://b.example,, '), ['https://a.example', 'https://b.example']);
  assert.deepEqual(DEFAULT_ORIGINS, [
    'https://eazyfix-bot-de.onrender.com',
    'https://www.eazy-fix.nl',
    'https://eazy-fix.nl',
    'https://www.eazy-fix.de',
    'https://eazy-fix.de',
    'https://eazyfix.jkc-dev.nl',
  ]);
});

test('originAllowed: geen origin, eigen hosts en localhost mogen; vreemde en lookalike-hosts niet', () => {
  const allowed = DEFAULT_ORIGINS;
  assert.equal(originAllowed(undefined, allowed), true, 'curl/native app zonder Origin');
  assert.equal(originAllowed('', allowed), true);
  assert.equal(originAllowed('https://eazyfix-bot-de.onrender.com', allowed), true);
  assert.equal(originAllowed('https://www.eazy-fix.de', allowed), true);
  assert.equal(originAllowed('http://localhost:3001', allowed), true);
  assert.equal(originAllowed('http://127.0.0.1:8080', allowed), true);
  assert.equal(originAllowed('https://evil.example', allowed), false);
  assert.equal(originAllowed('https://eazyfix-bot-de.onrender.com.evil.example', allowed), false, 'lookalike');
  assert.equal(originAllowed('http://www.eazy-fix.de', allowed), false, 'ander schema telt als andere origin');
  assert.equal(originAllowed('https://localhost.evil.example', allowed), false);
});

test('corsOptions: callback geeft true/false door aan het cors-pakket', async () => {
  const opts = corsOptions(['https://site.example']);
  const ask = (origin) => new Promise((resolve) => opts.origin(origin, (_err, ok) => resolve(ok)));
  assert.equal(await ask('https://site.example'), true);
  assert.equal(await ask('https://ander.example'), false);
  assert.equal(await ask(undefined), true);
});

// --- limieten ---------------------------------------------------------------

test('limieten: 20 per minuut op de API, 5 per minuut op de foto-analyse, Duitse melding in du-vorm', () => {
  assert.equal(API_LIMIT.limit, 20);
  assert.equal(API_LIMIT.windowMs, 60 * 1000);
  assert.equal(IMAGE_LIMIT.limit, 5);
  assert.equal(IMAGE_LIMIT.windowMs, 60 * 1000);
  for (const m of [API_LIMIT_MESSAGE, IMAGE_LIMIT_MESSAGE]) {
    assert.match(m, /Minute/);
    assert.doesNotMatch(m, /\bSie\b|\bIhnen\b/, 'du-vorm zoals de persona, geen Sie');
    assert.doesNotMatch(m, /—|–/, 'geen gedachtestreepje');
  }
  const { apiLimiter, imageLimiter } = makeLimiters();
  assert.equal(typeof apiLimiter, 'function');
  assert.equal(typeof imageLimiter, 'function');
});

// --- gedrag op een echte express-app -----------------------------------------

function request(port, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method: 'GET', headers }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

function withApp(build, fn) {
  const app = express();
  build(app);
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', async () => {
      try { resolve(await fn(server.address().port)); }
      catch (e) { reject(e); }
      finally { server.close(); }
    });
  });
}

test('na 20 API-aanvragen binnen een minuut volgt 429 met de Duitse melding als JSON', async () => {
  await withApp((app) => {
    const { apiLimiter } = makeLimiters();
    app.use('/api/', apiLimiter);
    app.get('/api/check', (_req, res) => res.json({ ok: true }));
    app.get('/health', (_req, res) => res.json({ ok: true }));
  }, async (port) => {
    for (let i = 1; i <= 20; i++) {
      const r = await request(port, '/api/check');
      assert.equal(r.status, 200, `aanvraag ${i} moet nog door`);
    }
    const r21 = await request(port, '/api/check');
    assert.equal(r21.status, 429);
    assert.equal(JSON.parse(r21.body).error, API_LIMIT_MESSAGE);
    assert.ok(r21.headers['ratelimit-policy'] || r21.headers['ratelimit'] || r21.headers['ratelimit-limit'], 'standaard RateLimit-headers aanwezig');
    const h = await request(port, '/health');
    assert.equal(h.status, 200, '/health valt buiten de API-limiet');
  });
});

test('foto-analyse: strengere limiet van 5 per minuut, eigen melding, ook op de streamroute', async () => {
  await withApp((app) => {
    const { apiLimiter, imageLimiter } = makeLimiters();
    app.use('/api/', apiLimiter);
    app.use('/api/analyze-image', imageLimiter);
    app.get('/api/analyze-image', (_req, res) => res.json({ ok: true }));
    app.get('/api/analyze-image/stream', (_req, res) => res.json({ ok: true }));
  }, async (port) => {
    for (let i = 1; i <= 5; i++) {
      assert.equal((await request(port, i % 2 ? '/api/analyze-image' : '/api/analyze-image/stream')).status, 200, `foto ${i}`);
    }
    const r6 = await request(port, '/api/analyze-image/stream');
    assert.equal(r6.status, 429, 'streamroute deelt dezelfde foto-emmer');
    assert.equal(JSON.parse(r6.body).error, IMAGE_LIMIT_MESSAGE);
  });
});

test('CORS: eigen origin krijgt Access-Control-Allow-Origin, vreemde origin niet; zonder Origin gewoon antwoord', async () => {
  await withApp((app) => {
    app.use(cors(corsOptions(DEFAULT_ORIGINS)));
    app.get('/api/check', (_req, res) => res.json({ ok: true }));
  }, async (port) => {
    const eigen = await request(port, '/api/check', { Origin: 'https://www.eazy-fix.de' });
    assert.equal(eigen.status, 200);
    assert.equal(eigen.headers['access-control-allow-origin'], 'https://www.eazy-fix.de');
    const vreemd = await request(port, '/api/check', { Origin: 'https://evil.example' });
    assert.equal(vreemd.headers['access-control-allow-origin'], undefined, 'geen CORS-header -> browser blokkeert');
    const zonder = await request(port, '/api/check');
    assert.equal(zonder.status, 200);
    assert.equal(JSON.parse(zonder.body).ok, true);
  });
});

// --- proxy-keten op Render ----------------------------------------------------
// Gemeten op 12-10-2026 (RC-bot) via een tijdelijke /api/whoami: X-Forwarded-For =
// "<bezoeker>, <Cloudflare-edge>", socket = Render-proxy (10.x). Met trust proxy 1 was
// req.ip het wisselende Cloudflare-IP en kreeg elke aanvraag een verse emmer.

test('trust proxy 2: limiet telt per bezoeker, ook als het Cloudflare-IP per aanvraag wisselt', async () => {
  await withApp((app) => {
    app.set('trust proxy', 2);
    const { apiLimiter } = makeLimiters();
    app.use('/api/', apiLimiter);
    app.get('/api/check', (req, res) => res.json({ ip: req.ip }));
  }, async (port) => {
    for (let i = 1; i <= 20; i++) {
      const r = await request(port, '/api/check', { 'X-Forwarded-For': `198.51.100.7, 172.71.${i}.1` });
      assert.equal(r.status, 200, `aanvraag ${i}`);
      assert.equal(JSON.parse(r.body).ip, '198.51.100.7', 'req.ip is de bezoeker, niet de edge');
    }
    const r21 = await request(port, '/api/check', { 'X-Forwarded-For': '198.51.100.7, 172.71.21.1' });
    assert.equal(r21.status, 429, 'zelfde bezoeker achter wisselende edge-IPs loopt tegen de limiet');
    const ander = await request(port, '/api/check', { 'X-Forwarded-For': '198.51.100.8, 172.71.22.1' });
    assert.equal(ander.status, 200, 'andere bezoeker heeft een eigen emmer');
  });
});

test('trust proxy 2: een door de bezoeker zelf meegestuurde X-Forwarded-For telt niet als zijn IP', async () => {
  await withApp((app) => {
    app.set('trust proxy', 2);
    app.get('/api/check', (req, res) => res.json({ ip: req.ip }));
  }, async (port) => {
    const r = await request(port, '/api/check', { 'X-Forwarded-For': '9.9.9.9, 198.51.100.7, 172.71.1.1' });
    assert.equal(JSON.parse(r.body).ip, '198.51.100.7');
  });
});

// --- berichtlengte en dagplafonds (port eazyfix-bot a41ea98, veiligheidscheck 20-10-2026)
// Per-minuutlimieten begrenzen geen dagvolume: één script kon de hele dag 5 foto's per
// minuut sturen. Daarom: plafond per bezoeker per dag en voor de hele bot per dag, met
// Duitse melding in de du-vorm, en een alarm bij 80% van het botplafond.
const {
  MAX_MESSAGE_CHARS, MESSAGE_TOO_LONG, messageTooLong,
  DAILY_LIMITS, DAILY_IP_MESSAGE, DAILY_IP_PHOTO, DAILY_GLOBAL, makeDailyCaps,
} = require('../src/abuse-guard');

test('berichtlengte: maximaal 4000 tekens per beurt, ook in contentblokken; Duitse melding', () => {
  assert.equal(MAX_MESSAGE_CHARS, 4000);
  assert.equal(messageTooLong([{ role: 'user', content: 'hallo' }]), false);
  assert.equal(messageTooLong([{ role: 'user', content: 'x'.repeat(4000) }]), false);
  assert.equal(messageTooLong([{ role: 'user', content: 'x'.repeat(4001) }]), true);
  assert.equal(messageTooLong([{ role: 'user', content: [{ type: 'text', text: 'x'.repeat(5000) }] }]), true);
  assert.equal(messageTooLong([{ role: 'user', content: 'x'.repeat(9000) }, { role: 'assistant', content: 'ok' }, { role: 'user', content: 'kurz' }]), true, 'ook oudere beurten tellen');
  assert.equal(messageTooLong([]), false);
  assert.match(MESSAGE_TOO_LONG, /4000/);
  assert.match(MESSAGE_TOO_LONG, /Deine Nachricht/);
  assert.doesNotMatch(MESSAGE_TOO_LONG, /—/);
});

test('dagplafonds: standaardwaarden en Duitse meldingen in du-vorm met de Duitse Innendienst', () => {
  assert.deepEqual(DAILY_LIMITS, { perIpMessages: 60, perIpPhotos: 15, globalMessages: 400, globalPhotos: 60, perIpLeads: 5, globalLeads: 200, perIpFeedback: 60, globalFeedback: 400 });
  for (const m of [DAILY_IP_MESSAGE, DAILY_IP_PHOTO, DAILY_GLOBAL]) {
    assert.doesNotMatch(m, /—/);
    assert.doesNotMatch(m, /\bSie\b|\bIhnen\b|\bIhr\b/, 'du-vorm, geen Sie');
    assert.doesNotMatch(m, /\+31/, 'geen Nederlands nummer');
    assert.doesNotMatch(m, /\beazyfix\b/, 'merknaam in hoofdletters met ®');
  }
  assert.match(DAILY_IP_MESSAGE, /heute/i);
  assert.match(DAILY_IP_MESSAGE, /03222 1097923/);
  assert.match(DAILY_GLOBAL, /morgen/i);
  assert.match(DAILY_GLOBAL, /03222 1097923/);
});

test('dagplafond per bezoeker: na 60 berichten 429 met dagmelding; andere bezoeker blijft door; foto\'s tellen apart', async () => {
  const caps = makeDailyCaps({ now: () => Date.parse('2026-10-21T10:00:00Z') });
  await withApp((app) => {
    app.set('trust proxy', 2);
    app.use('/api/chat', caps.messageGuard);
    app.use('/api/analyze-image', caps.photoGuard);
    app.get('/api/chat/stream', (_req, res) => res.json({ ok: true }));
    app.get('/api/analyze-image/stream', (_req, res) => res.json({ ok: true }));
  }, async (port) => {
    const a = { 'X-Forwarded-For': '198.51.100.7, 172.71.1.1' };
    for (let i = 1; i <= 60; i++) assert.equal((await request(port, '/api/chat/stream', a)).status, 200, `bericht ${i}`);
    const r61 = await request(port, '/api/chat/stream', a);
    assert.equal(r61.status, 429);
    assert.equal(JSON.parse(r61.body).error, DAILY_IP_MESSAGE);
    assert.equal((await request(port, '/api/analyze-image/stream', a)).status, 200, 'foto-plafond staat los van berichten');
    const b = { 'X-Forwarded-For': '198.51.100.8, 172.71.1.1' };
    assert.equal((await request(port, '/api/chat/stream', b)).status, 200, 'andere bezoeker heeft eigen dagteller');
    for (let i = 2; i <= 15; i++) assert.equal((await request(port, '/api/analyze-image/stream', a)).status, 200, `foto ${i}`);
    const f16 = await request(port, '/api/analyze-image/stream', a);
    assert.equal(f16.status, 429);
    assert.equal(JSON.parse(f16.body).error, DAILY_IP_PHOTO);
  });
});

test('dagplafond voor de hele bot: alarm bij 80%, 429 met drukte-melding daarboven, nieuwe dag begint op nul', async () => {
  let clock = Date.parse('2026-10-21T10:00:00Z');
  const alerts = [];
  const caps = makeDailyCaps({ now: () => clock, limits: { globalPhotos: 10, perIpPhotos: 100 }, onAlert: (a) => alerts.push(a) });
  await withApp((app) => {
    app.set('trust proxy', 2);
    app.use('/api/analyze-image', caps.photoGuard);
    app.get('/api/analyze-image', (_req, res) => res.json({ ok: true }));
  }, async (port) => {
    for (let i = 1; i <= 10; i++) {
      const r = await request(port, '/api/analyze-image', { 'X-Forwarded-For': `198.51.100.${i}, 172.71.1.1` });
      assert.equal(r.status, 200, `foto ${i} (verschillende bezoekers)`);
    }
    assert.equal(alerts.length, 1, 'één alarm bij 80%');
    assert.equal(alerts[0].kind, 'photos');
    assert.equal(alerts[0].count, 8);
    const r11 = await request(port, '/api/analyze-image', { 'X-Forwarded-For': '198.51.100.99, 172.71.1.1' });
    assert.equal(r11.status, 429);
    assert.equal(JSON.parse(r11.body).error, DAILY_GLOBAL);
    assert.deepEqual(caps.status().vandaag, { berichten: 0, fotos: 10, formulier: 0, beoordelingen: 0 });
    clock = Date.parse('2026-10-22T00:00:01Z'); // nieuwe dag
    const next = await request(port, '/api/analyze-image', { 'X-Forwarded-For': '198.51.100.99, 172.71.1.1' });
    assert.equal(next.status, 200, 'teller staat op nul op de nieuwe dag');
    assert.equal(caps.status().dag, '2026-10-22');
  });
});

// --- toegangsbewijs voor de chatpagina (port eazyfix-bot b934327) ------------------
// De sleutel in de chatpagina is openbaar. Een tijdelijk toegangsbewijs (HMAC van
// tijdstip en bezoekersadres, 1 uur geldig) dat de pagina bij het laden krijgt, maakt
// rechtstreeks aanroepen vanaf een script lastiger. Afdwingen alleen met
// WEB_TOKEN_VERPLICHT=1, zodat de native app eerst zijn eigen sleutel kan krijgen.
const { makeWebTokens, chatPage } = require('../src/abuse-guard');

test('toegangsbewijs: geldig voor hetzelfde adres binnen een uur, ongeldig voor ander adres, na een uur of bij geknoei', () => {
  let clock = Date.parse('2026-10-21T10:00:00Z');
  const tokens = makeWebTokens({ secret: 'test-geheim', now: () => clock });
  const t = tokens.issue('198.51.100.7');
  assert.match(t, /^\d+\.[A-Za-z0-9_-]+$/, 'tijdstip.handtekening');
  assert.equal(tokens.verify(t, '198.51.100.7'), true);
  assert.equal(tokens.verify(t, '198.51.100.8'), false, 'ander adres');
  assert.equal(tokens.verify(t.slice(0, -2) + 'xx', '198.51.100.7'), false, 'geknoei');
  assert.equal(tokens.verify('', '198.51.100.7'), false);
  assert.equal(tokens.verify(undefined, '198.51.100.7'), false);
  clock += 59 * 60 * 1000;
  assert.equal(tokens.verify(t, '198.51.100.7'), true, 'na 59 minuten nog geldig');
  clock += 2 * 60 * 1000;
  assert.equal(tokens.verify(t, '198.51.100.7'), false, 'na een uur verlopen');
  const ander = makeWebTokens({ secret: 'ander-geheim', now: () => clock });
  assert.equal(ander.verify(tokens.issue('198.51.100.7'), '198.51.100.7'), false, 'ander geheim');
});

test('toegangsbewijs: zonder geheim in de omgeving een willekeurig geheim per proces', () => {
  const a = makeWebTokens({});
  const b = makeWebTokens({});
  const t = a.issue('1.2.3.4');
  assert.equal(a.verify(t, '1.2.3.4'), true);
  assert.equal(b.verify(t, '1.2.3.4'), false);
});

test('chatpagina: de server vult __WEB_TOKEN__ in met een geldig bewijs voor de bezoeker, zonder cache', async () => {
  const tokens = makeWebTokens({ secret: 'test-geheim' });
  const pub = require('node:path').join(__dirname, '..', 'public');
  await withApp((app) => {
    app.set('trust proxy', 2);
    app.get('/', chatPage(pub, tokens));
  }, async (port) => {
    const r = await request(port, '/', { 'X-Forwarded-For': '198.51.100.7, 172.71.1.1' });
    assert.equal(r.status, 200);
    assert.equal(r.headers['cache-control'], 'no-store');
    const m = /const WEB_TOKEN = '([^']+)'/.exec(r.body);
    assert.ok(m, 'WEB_TOKEN staat in de pagina');
    assert.notEqual(m[1], '__WEB_TOKEN__', 'placeholder is vervangen');
    assert.equal(tokens.verify(m[1], '198.51.100.7'), true, 'bewijs hoort bij het bezoekersadres');
  });
});

// --- Review 10-11-2026: vier beveiligingspunten (port eazyfix-bot 7526fea) -----------------------------------
const {
  limitConversation, newChatImages, ipKey, CHAT_LIMITS,
  catchAsyncRoutes, errorHandler, BAD_REQUEST, SERVER_ERROR,
} = require('../src/abuse-guard');

function post(port, pad, body, headers = {}) {
  return fetch(`http://127.0.0.1:${port}${pad}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, body: await r.text() }));
}

// Punt 1: {"messages":[null]} liet het proces stoppen (TypeError in een async route,
// Express 4 vangt die niet op). Na de herstart stonden alle dagtellers op nul.
test('review p1: fout in een async route geeft een nette 500 en de server blijft draaien', async () => {
  const gelogd = [];
  await withApp((app) => {
    catchAsyncRoutes(app);
    app.use(express.json());
    app.post('/api/chat', async (req, res) => { res.json({ rol: req.body.messages[0].role }); });
    app.get('/api/leeft', (_req, res) => res.json({ ok: true }));
    app.use(errorHandler((m) => gelogd.push(m)));
  }, async (port) => {
    const r = await post(port, '/api/chat', { messages: [null] });
    assert.equal(r.status, 500);
    assert.equal(JSON.parse(r.body).error, SERVER_ERROR);
    assert.doesNotMatch(r.body, /TypeError|at .*\.js/);
    assert.equal(gelogd.length, 1);
    assert.equal((await request(port, '/api/leeft')).status, 200, 'server draait nog');
    const kapot = await post(port, '/api/chat', '{"messages":[');
    assert.equal(kapot.status, 400);
    assert.equal(JSON.parse(kapot.body).error, BAD_REQUEST);
  });
});

test('review p1+p2: chatroutes controleren elk bericht op null en nemen geen model uit de aanvraag over', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'src', 'index.js'), 'utf8');
  assert.equal(src.split("if (!m || typeof m !== 'object' || !['user', 'assistant'].includes(m.role)").length - 1, 2);
  assert.match(src, /catchAsyncRoutes\(express\(\)\)/);
  assert.match(src, /process\.on\('unhandledRejection'/);
  assert.match(src, /app\.use\(errorHandler\(\)\);\s+const server = app\.listen/);
  assert.doesNotMatch(src, /req\.body\.model|model: model|\bmodel,\s*$/m);
  assert.doesNotMatch(src, /const \{[^}]*\bmodel\b[^}]*\} = req\.body/);
});

// Punt 3: 4000 tekens gold per beurt; het aantal beurten en foto's was onbegrensd.
test('review p3: gesprek wordt ingekort tot de laatste beurten, tekens en foto\'s', () => {
  const lang = [];
  for (let i = 0; i < 100; i++) lang.push({ role: i % 2 ? 'assistant' : 'user', content: `beurt ${i}` });
  lang.push({ role: 'user', content: 'laatste vraag' });
  const kort = limitConversation(lang);
  assert.ok(kort.length <= CHAT_LIMITS.maxMessages);
  assert.equal(kort[0].role, 'user');
  assert.equal(kort[kort.length - 1].content, 'laatste vraag');

  const dik = [];
  for (let i = 0; i < 40; i++) dik.push({ role: i % 2 ? 'assistant' : 'user', content: 'x'.repeat(4000) });
  const totaal = limitConversation(dik).reduce((n, m) => n + m.content.length, 0);
  assert.ok(totaal <= CHAT_LIMITS.maxChars, `totaal ${totaal}`);

  const img = { type: 'image', base64: 'AAAA', mimeType: 'image/jpeg' };
  const fotos = [];
  for (let i = 0; i < 6; i++) {
    fotos.push({ role: 'user', content: [img, img, img, img, img] });
    fotos.push({ role: 'assistant', content: 'ok' });
  }
  fotos.push({ role: 'user', content: [img, { type: 'text', text: 'en deze?' }] });
  const uit = limitConversation(fotos);
  const aantal = uit.reduce((n, m) => n + (Array.isArray(m.content) ? m.content.filter((b) => b.type === 'image').length : 0), 0);
  assert.equal(aantal, CHAT_LIMITS.maxImages);
  assert.deepEqual(uit[uit.length - 1].content, fotos[fotos.length - 1].content, 'nieuwste foto blijft staan');
  assert.ok(uit.every((m) => typeof m.content === 'string' ? m.content.length > 0 : m.content.length > 0), 'geen lege beurten');
  assert.equal(newChatImages(fotos), 1);
  assert.equal(newChatImages(lang), 0);
  assert.equal(limitConversation([{ role: 'user', content: 'hoi' }]).length, 1, 'kort gesprek blijft ongemoeid');
});

test('review p3: foto\'s in het chatkanaal tellen mee voor het fotoplafond', () => {
  const caps = makeDailyCaps({ now: () => Date.parse('2026-11-10T10:00:00Z'), limits: { perIpPhotos: 2, globalPhotos: 3 } });
  const a = { ip: '198.51.100.7' };
  assert.equal(caps.countChatPhotos(a), null);
  assert.equal(caps.countChatPhotos(a), null);
  assert.equal(caps.countChatPhotos(a), DAILY_IP_PHOTO);
  assert.equal(caps.countChatPhotos({ ip: '198.51.100.8' }), null);
  assert.equal(caps.countChatPhotos({ ip: '198.51.100.9' }), DAILY_GLOBAL);
  assert.equal(caps.status().vandaag.fotos, 3);
});

// Punt 4: het dagplafond telde ook aanvragen die de server zelf afwees. Negen adressen
// met elk 60 onzin-aanvragen zetten de bot voor iedereen op pauze.
test('review p4: door de server afgewezen aanvragen (400/401) tellen niet mee voor het dagplafond', async () => {
  const caps = makeDailyCaps({ now: () => Date.parse('2026-11-10T10:00:00Z'), limits: { perIpMessages: 3, globalMessages: 5 } });
  await withApp((app) => {
    app.set('trust proxy', 2);
    app.use(express.json());
    app.use('/api/chat', caps.messageGuard);
    app.post('/api/chat', (req, res) => {
      if (req.body.soort === 'ongeldig') return res.status(400).json({ error: 'Ungültiges Nachrichtenformat' });
      if (req.body.soort === 'geen-toegang') return res.status(401).json({ error: 'Unauthorized' });
      if (req.body.soort === 'model-400') { res.locals.modelGebruikt = true; return res.status(400).json({ error: 'Foto onbruikbaar' }); }
      res.json({ ok: true });
    });
  }, async (port) => {
    const a = { 'X-Forwarded-For': '198.51.100.7, 172.71.1.1' };
    for (let i = 0; i < 20; i++) assert.equal((await post(port, '/api/chat', { soort: i % 2 ? 'ongeldig' : 'geen-toegang' }, a)).status, i % 2 ? 400 : 401);
    assert.equal(caps.status().vandaag.berichten, 0, 'afgewezen aanvragen tellen niet');
    assert.equal((await post(port, '/api/chat', { soort: 'goed' }, a)).status, 200);
    assert.equal((await post(port, '/api/chat', { soort: 'model-400' }, a)).status, 400);
    assert.equal(caps.status().vandaag.berichten, 2, 'geldige aanvraag en modelfout tellen wel');
    assert.equal((await post(port, '/api/chat', { soort: 'goed' }, a)).status, 200);
    assert.equal((await post(port, '/api/chat', { soort: 'goed' }, a)).status, 429, 'plafond per bezoeker werkt nog');
  });
});

test('review p4: IPv6 telt per blok (/64), IPv4 per adres', () => {
  assert.equal(ipKey('198.51.100.7'), '198.51.100.7');
  assert.equal(ipKey('::ffff:198.51.100.7'), '198.51.100.7');
  assert.equal(ipKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd'), ipKey('2001:0db8:0001:0002::1'));
  assert.notEqual(ipKey('2001:db8:1:2::1'), ipKey('2001:db8:1:3::1'));
  assert.equal(ipKey('2001:db8::1'), '2001:db8:0:0::/64');
  assert.equal(ipKey(undefined), 'onbekend');
  const caps = makeDailyCaps({ now: () => Date.parse('2026-11-10T10:00:00Z'), limits: { perIpPhotos: 1 } });
  assert.equal(caps.countChatPhotos({ ip: '2001:db8:1:2::1' }), null);
  assert.equal(caps.countChatPhotos({ ip: '2001:db8:1:2:ffff::9' }), DAILY_IP_PHOTO, 'ander adres uit hetzelfde blok deelt de teller');
});

// Port eazyfix-bot 00afcf6 (review 10-11-2026): beoordelingen hadden geen dagplafond.
test('review: beoordelingen hebben een eigen dagplafond, ook als noodstop', async () => {
  const { DAILY_IP_FEEDBACK, dailyLimitsFromEnv } = require('../src/abuse-guard');
  assert.doesNotMatch(DAILY_IP_FEEDBACK, /—|\bSie\b/);
  const lim = dailyLimitsFromEnv({ DAG_BEOORDELINGEN_PER_BEZOEKER: '2' });
  assert.equal(lim.perIpFeedback, 2);
  assert.equal(dailyLimitsFromEnv({ DAG_BEOORDELINGEN_TOTAAL: '1' }).globalFeedback, 1);
  const caps = makeDailyCaps({ now: () => Date.parse('2026-11-10T10:00:00Z'), limits: lim });
  await withApp((app) => {
    app.set('trust proxy', 2);
    app.use(express.json());
    app.use('/api/feedback', caps.feedbackGuard);
    app.post('/api/feedback', (req, res) => (req.body.rating ? res.json({ ok: true }) : res.status(400).json({ error: 'rating' })));
  }, async (port) => {
    const a = { 'X-Forwarded-For': '198.51.100.7, 172.71.1.1' }, b = { 'X-Forwarded-For': '198.51.100.8, 172.71.1.1' };
    assert.equal((await post(port, '/api/feedback', {}, a)).status, 400, 'ongeldige beoordeling telt niet');
    assert.equal((await post(port, '/api/feedback', { rating: 'up' }, a)).status, 200);
    assert.equal((await post(port, '/api/feedback', { rating: 'up' }, a)).status, 200);
    const f3 = await post(port, '/api/feedback', { rating: 'up' }, a);
    assert.equal(f3.status, 429);
    assert.equal(JSON.parse(f3.body).error, DAILY_IP_FEEDBACK);
    assert.equal((await post(port, '/api/feedback', { rating: 'up' }, b)).status, 200);
    assert.deepEqual(caps.status().vandaag, { berichten: 0, fotos: 0, formulier: 0, beoordelingen: 3 });
  });
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'src', 'index.js'), 'utf8');
  assert.match(src, /app\.use\('\/api\/feedback', dailyCaps\.feedbackGuard\);/);
});

// Port eazyfix-bot 6bf3328 (review 10-11-2026): statuspagina en afbreken.
test('review: statuspagina toont openbaar alleen ok; details alleen met de juiste sleutel', async () => {
  const { healthRoute } = require('../src/abuse-guard');
  const details = () => ({ model: 'x', vandaag: { berichten: 3 } });
  await withApp((app) => {
    app.get('/health', healthRoute(details, { HEALTH_KEY: 'geheim-123' }));
    app.get('/health-zonder', healthRoute(details, {}));
  }, async (port) => {
    assert.deepEqual(JSON.parse((await request(port, '/health')).body), { ok: true });
    assert.deepEqual(JSON.parse((await request(port, '/health', { 'x-health-key': 'fout' })).body), { ok: true });
    assert.deepEqual(JSON.parse((await request(port, '/health', { 'x-health-key': 'geheim-123' })).body), { ok: true, model: 'x', vandaag: { berichten: 3 } });
    assert.deepEqual(JSON.parse((await request(port, '/health-zonder', { 'x-health-key': '' })).body), { ok: true }, 'geen sleutel ingesteld: niemand ziet details');
    assert.deepEqual(JSON.parse((await request(port, '/health-zonder', { 'x-health-key': 'undefined' })).body), { ok: true });
  });
});

test('review: chatstroom stopt de modelaanvraag als de bezoeker weg is', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'src', 'index.js'), 'utf8');
  assert.match(src, /res\.on\('close', \(\) => \{ if \(!res\.writableEnded\) abort\.abort\(\); \}\);/);
  assert.match(src, /\.\.\.REQUEST_DEFAULTS,\n      \}, \{ signal: abort\.signal \}\);/);
  assert.match(src, /app\.get\('\/health', healthRoute\(/);
});

// --- iframe in de Duitse site (eazy-fix.nl/de, JKC), port eazyfix-bot ------------
const path = require('node:path');
const { frameAncestorsHeader, embedRoute, frameGuard } = require('../src/abuse-guard');

test('frameAncestorsHeader: eigen origins plus localhost mogen de chat inlijsten, in CSP-vorm', () => {
  const h = frameAncestorsHeader(['https://www.eazy-fix.nl', 'https://eazyfix.jkc-dev.nl']);
  assert.equal(h, "frame-ancestors 'self' https://www.eazy-fix.nl https://eazyfix.jkc-dev.nl http://localhost:* http://127.0.0.1:*");
});

test('/embed levert de chatpagina met frame-ancestors-header', async () => {
  const pub = path.join(__dirname, '..', 'public');
  await withApp((app) => {
    app.get('/embed', embedRoute(['https://www.eazy-fix.nl'], pub));
  }, async (port) => {
    const r = await request(port, '/embed');
    assert.equal(r.status, 200);
    assert.match(r.headers['content-type'] || '', /text\/html/);
    assert.equal(r.headers['content-security-policy'], "frame-ancestors 'self' https://www.eazy-fix.nl http://localhost:* http://127.0.0.1:*");
    assert.match(r.body, /id="log"/);
  });
});

test('statische pagina\'s zijn alleen door de eigen sites in te lijsten; frameGuard vóór static', async () => {
  await withApp((app) => {
    app.use(frameGuard(['https://www.eazy-fix.nl']));
    app.get('/pagina.html', (_req, res) => res.send('<p>x</p>'));
    app.get('/logo.png', (_req, res) => res.send('x'));
  }, async (port) => {
    assert.match((await request(port, '/pagina.html')).headers['content-security-policy'], /^frame-ancestors 'self' https:\/\/www\.eazy-fix\.nl /);
    assert.equal((await request(port, '/logo.png')).headers['content-security-policy'], undefined);
  });
  const src = require('node:fs').readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8');
  assert.match(src, /app\.use\(frameGuard\(allowedOrigins\)\);[^\n]*\napp\.use\(express\.static\('public', \{ setHeaders: staticCache \}\)\);/);
  assert.match(src, /app\.get\('\/embed', embedRoute\(allowedOrigins, PUBLIC_DIR, webTokens\)\);/);
});

// Uitgavenlimiet bij Anthropic (status 400 met melding over limiet/tegoed) is geen kapotte
// foto: eigen melding in plaats van "stuur een scherpere foto" (11-11-2026).
test('limietfout van Anthropic wordt herkend en krijgt een eigen melding', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'src', 'index.js'), 'utf8');
  const fn = src.match(/function isLimietFout\(err\) \{[\s\S]*?\n\}/)[0];
  const isLimietFout = new Function(fn + ' return isLimietFout;')();
  assert.equal(isLimietFout({ status: 400, message: 'You have reached your specified API usage limits.' }), true);
  assert.equal(isLimietFout({ status: 400, message: 'Your credit balance is too low to access the Anthropic API.' }), true);
  assert.equal(isLimietFout({ status: 400, message: 'Could not process image' }), false);
  assert.equal(isLimietFout({ status: 429, message: 'usage limit' }), false);
  assert.match(src, /if \(isLimietFout\(err\)\) return res\.status\(503\)\.json\(\{ error: LIMIET_MELDING \}\);/);
  assert.match(src, /if \(isLimietFout\(err\)\) return LIMIET_MELDING;/);
});
