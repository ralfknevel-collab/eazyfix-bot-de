const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { resolveModel, createClient, REFUSAL_TEXT } = require('../src/model');
const { runWithTools } = require('../src/chat');

// Modelkeuze (20-10-2026, port van eazyfix-bot 4f8d5b0): Claude Opus 5.5 vervangt
// Opus 4.8. Eén bron voor het model en de clientinstellingen (src/model.js), zodat
// chat.js en index.js niet uit elkaar lopen. Deze tests meten wat er ECHT over de
// lijn gaat: een lokale nep-API vangt het verzoek op dat de echte SDK verstuurt.

test('standaardmodel is Claude Opus 5.5; MODEL in de omgeving overschrijft', () => {
  assert.equal(resolveModel({}), 'claude-opus-5-5');
  assert.equal(resolveModel({ MODEL: '' }), 'claude-opus-5-5');
  assert.equal(resolveModel({ MODEL: 'claude-opus-4-8' }), 'claude-opus-4-8');
});

// Nep-Anthropic-API: antwoordt op POST /v1/messages met een vast bericht en
// bewaart het laatste verzoek (headers + body) voor de asserts.
function withFakeApi(reply, fn) {
  const seen = {};
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      seen.headers = req.headers;
      seen.body = JSON.parse(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(reply));
    });
  });
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', async () => {
      const client = createClient({ apiKey: 'test', baseURL: `http://127.0.0.1:${server.address().port}` });
      try { resolve(await fn(client, seen)); }
      catch (e) { reject(e); }
      finally { server.close(); }
    });
  });
}

const OK_REPLY = {
  id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5-5',
  content: [{ type: 'text', text: 'Hallo, wie kann ich helfen?' }],
  stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 },
};

test('tekstchat stuurt Opus 5.5, denkstand laag en het Anthropic-vangnet bij een weigering mee', async () => {
  await withFakeApi(OK_REPLY, async (client, seen) => {
    const r = await runWithTools([{ role: 'user', content: 'hallo' }], { client, system: 'test' });
    assert.equal(r.text, 'Hallo, wie kann ich helfen?');
    assert.equal(seen.body.model, 'claude-opus-5-5');
    assert.deepEqual(seen.body.output_config, { effort: 'low' }, 'tekstchat denkt kort: effort low');
    assert.equal(seen.body.fallbacks, 'default', 'server-side fallback bij een weigering');
    assert.match(String(seen.headers['anthropic-beta'] || ''), /server-side-fallback-2026-07-01/);
    assert.equal(seen.body.thinking, undefined, 'geen thinking-parameter: op Opus 5.5 is adaptief denken standaard');
  });
});

test('weigering door de veiligheidsfilter geeft een nette Duitse zin in du-vorm, geen lege bubbel', async () => {
  const refusal = { ...OK_REPLY, content: [], stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'cyber' } };
  await withFakeApi(refusal, async (client) => {
    const r = await runWithTools([{ role: 'user', content: 'x' }], { client, system: 'test' });
    assert.equal(r.text, REFUSAL_TEXT);
    assert.equal(r.refused, true);
  });
  assert.match(REFUSAL_TEXT, /Holz/i, 'nodigt uit tot een houtvraag');
  assert.match(REFUSAL_TEXT, /EAZYFIX®/, 'merknaam in hoofdletters met ®');
  assert.doesNotMatch(REFUSAL_TEXT, /—|–/, 'geen gedachtestreepje');
  assert.doesNotMatch(REFUSAL_TEXT, /\bSie\b|\bIhnen\b|\bIhre?\b/, 'du-vorm zoals de persona, geen Sie');
});

// Port van eazyfix-bot 176cc6c: fotodiagnose op 'high' (gemeten: xhigh 44 s per foto,
// high 25 s, zelfde diagnoses) en een vangnet tegen markdown in het antwoord.
const { resolvePhotoEffort, stripMarkdown } = require('../src/model');

test('fotodiagnose: standaard high; FOTO_EFFORT overschrijft; onbekende waarde valt terug op high', () => {
  assert.deepEqual(resolvePhotoEffort({}), { effort: 'high' });
  assert.deepEqual(resolvePhotoEffort({ FOTO_EFFORT: 'xhigh' }), { effort: 'xhigh' });
  assert.deepEqual(resolvePhotoEffort({ FOTO_EFFORT: 'turbo' }), { effort: 'high' });
});

test('stripMarkdown: fett, kursiv en opsommingstekens weg, tekst en regels blijven; schone tekst onveranderd', () => {
  const vuil = 'Auf deinem Foto sehe ich **schwere Holzfäule** in der Ecke.\n\n- **Fäule entfernen:** säge sie weg.\n- **Feuchte messen:** unter 18%.\n### Kopf\n1. Fräse mit dem *Fräser* durch.';
  assert.equal(stripMarkdown(vuil), 'Auf deinem Foto sehe ich schwere Holzfäule in der Ecke.\n\nFäule entfernen: säge sie weg.\nFeuchte messen: unter 18%.\nKopf\n1. Fräse mit dem Fräser durch.');
  const schoon = 'Mische 2:1 und lass es 4 Stunden aushärten. Rechne 10 x 8 x 5 cm = 400 ml, also 3 Kartuschen.';
  assert.equal(stripMarkdown(schoon), schoon);
});
