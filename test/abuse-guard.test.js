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
    'https://www.eazy-fix.de',
    'https://eazy-fix.de',
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
  assert.deepEqual(DAILY_LIMITS, { perIpMessages: 60, perIpPhotos: 15, globalMessages: 400, globalPhotos: 60 });
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
    assert.deepEqual(caps.status().vandaag, { berichten: 0, fotos: 10 });
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
