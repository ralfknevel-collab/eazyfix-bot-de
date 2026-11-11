const { test } = require('node:test');
const assert = require('node:assert');
const { validateLead, makePhotoGate, leadLimitsFromEnv, nieuwToken, LEAD_DEFAULTS } = require('../src/lead');

// Wens van Nina (Eazyfix), 27-10-2026: 3 foto's gratis, daarna naam + e-mail voor 5 extra.

function fakeRes() {
  return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
}
async function call(gate, { ip = '1.1.1.1', origin = 'https://eazyfix.jkc-dev.nl', token } = {}) {
  const headers = {};
  if (origin) headers.origin = origin;
  if (token) headers['x-lead-token'] = token;
  const res = fakeRes();
  let door = false;
  await gate.middleware({ ip, headers }, res, () => { door = true; });
  return { door, res };
}

test('standaard: 3 gratis, 5 extra', () => {
  assert.deepEqual(LEAD_DEFAULTS, { gratis: 3, extra: 5 });
  assert.deepEqual(leadLimitsFromEnv({}), { gratis: 3, extra: 5 });
  assert.deepEqual(leadLimitsFromEnv({ FOTO_GRATIS: '2', FOTO_EXTRA: '10' }), { gratis: 2, extra: 10 });
  assert.deepEqual(leadLimitsFromEnv({ FOTO_GRATIS: 'x', FOTO_EXTRA: '-1' }), { gratis: 3, extra: 5 });
});

test('validateLead: naam, geldig e-mailadres en toestemming verplicht; nieuwsbrief optioneel', () => {
  assert.equal(validateLead({ email: 'a@b.nl', akkoord: true }).ok, false);
  assert.equal(validateLead({ naam: 'Piet', email: 'geen-mail', akkoord: true }).ok, false);
  assert.equal(validateLead({ naam: 'Piet', email: 'a@b.nl' }).ok, false);
  assert.equal(validateLead({ naam: 'Piet', email: 'a@b.nl', akkoord: 'true' }).ok, false);
  const v = validateLead({ naam: ' Piet ', email: ' Piet@Voorbeeld.NL ', akkoord: true, conversationId: 'c-1' });
  assert.equal(v.ok, true);
  assert.deepEqual(v.row, { naam: 'Piet', email: 'piet@voorbeeld.nl', akkoord_verwerking: true, nieuwsbrief: false, conversation_id: 'c-1' });
  assert.equal(validateLead({ naam: 'P', email: 'a@b.nl', akkoord: true, nieuwsbrief: true }).row.nieuwsbrief, true);
});

test('poort: 3 gratis foto\'s, de vierde vraagt om gegevens', async () => {
  const gate = makePhotoGate();
  for (let i = 0; i < 3; i++) assert.equal((await call(gate)).door, true);
  const r = await call(gate);
  assert.equal(r.door, false);
  assert.equal(r.res.statusCode, 403);
  assert.equal(r.res.body.leadRequired, true);
  assert.match(r.res.body.error, /5 weitere Fotos/);
});

test('poort: met token nog 5 extra, daarna de dagmelding', async () => {
  const gate = makePhotoGate();
  for (let i = 0; i < 3; i++) await call(gate);
  const token = nieuwToken();
  gate.register(token);
  for (let i = 0; i < 5; i++) assert.equal((await call(gate, { token })).door, true, `extra foto ${i + 1}`);
  const r = await call(gate, { token });
  assert.equal(r.door, false);
  assert.equal(r.res.statusCode, 429);
  assert.equal(r.res.body.leadRequired, undefined);
});

test('poort: onbekend of verzonnen token telt als geen token', async () => {
  const gate = makePhotoGate({ lookupToken: async () => false });
  for (let i = 0; i < 3; i++) await call(gate, { token: 'l-verzonnen' });
  assert.equal((await call(gate, { token: 'l-verzonnen' })).res.statusCode, 403);
});

test('poort: token na herstart teruggevonden via lookup', async () => {
  const token = nieuwToken();
  const gate = makePhotoGate({ lookupToken: async (t) => t === token });
  for (let i = 0; i < 3; i++) await call(gate, { token });
  assert.equal((await call(gate, { token })).door, true);
});

test('poort: native app (geen Origin) heeft geen grens', async () => {
  const gate = makePhotoGate();
  for (let i = 0; i < 10; i++) assert.equal((await call(gate, { origin: null })).door, true);
});

test('poort: telling per bezoekersadres en per dag', async () => {
  let t = Date.parse('2026-10-27T10:00:00Z');
  const gate = makePhotoGate({ now: () => t });
  for (let i = 0; i < 3; i++) await call(gate, { ip: 'a' });
  assert.equal((await call(gate, { ip: 'a' })).res.statusCode, 403);
  assert.equal((await call(gate, { ip: 'b' })).door, true);
  t = Date.parse('2026-10-28T10:00:00Z');
  assert.equal((await call(gate, { ip: 'a' })).door, true);
});

// Review 10-11-2026: 50 door Mailchimp afgewezen adressen hielden de wachtrij vast,
// omdat steeds de oudste 50 niet-doorgezette rijen werden opgehaald.
test('Mailchimp-wachtrij: na drie afwijzingen wordt een adres overgeslagen; een storing telt niet', async () => {
  const { syncPending, MAX_AFWIJZINGEN } = require('../src/lead');
  assert.equal(MAX_AFWIJZINGEN, 3);
  const oudFetch = global.fetch, oudUrl = process.env.SUPABASE_URL, oudKey = process.env.SUPABASE_SERVICE_KEY, oudErr = console.error;
  process.env.SUPABASE_URL = 'https://voorbeeld.supabase.co'; process.env.SUPABASE_SERVICE_KEY = 'test';
  const opgevraagd = [], gelogd = [];
  console.error = (...a) => gelogd.push(a.join(' '));
  const rijen = [{ id: 1, naam: 'Nep', email: 'nep@voorbeeld.invalid', nieuwsbrief: false }, { id: 2, naam: 'Storing', email: 'storing@voorbeeld.nl', nieuwsbrief: false }, { id: 3, naam: 'Echt', email: 'echt@voorbeeld.nl', nieuwsbrief: true }];
  global.fetch = async (url, opts = {}) => {
    if (opts.method === 'PATCH') return { ok: true };
    opgevraagd.push(decodeURIComponent(String(url)));
    const weg = /id=not\.in\.\(([^)]*)\)/.exec(decodeURIComponent(String(url)));
    const skip = weg ? weg[1].split(',').map(Number) : [];
    return { ok: true, json: async () => rijen.filter((r) => !skip.includes(r.id)) };
  };
  const sync = async (row) => {
    if (row.id === 1) { const e = new Error('Mailchimp 400: nep@voorbeeld.invalid looks fake or invalid'); e.status = 400; throw e; }
    if (row.id === 2) { const e = new Error('Mailchimp 503: storing'); e.status = 503; throw e; }
  };
  try {
    const teller = new Map();
    for (let i = 0; i < 3; i++) assert.deepEqual(await syncPending(sync, teller), { open: 3, gelukt: 1, overgeslagen: 0 });
    assert.equal(teller.get(1), 3);
    assert.equal(teller.has(2), false, 'storing telt niet als afwijzing');
    const vierde = await syncPending(sync, teller);
    assert.deepEqual(vierde, { open: 2, gelukt: 1, overgeslagen: 1 });
    assert.match(opgevraagd[3], /&id=not\.in\.\(1\)$/);
    assert.doesNotMatch(opgevraagd[0], /not\.in/);
    assert.ok(gelogd.length >= 6);
    assert.ok(gelogd.every((r) => !/@|looks fake/.test(r)), 'geen e-mailadres of Mailchimp-melding in het logboek');
    assert.ok(gelogd.some((r) => /lead 1 afgewezen \(status 400, 3 van 3\): wordt voortaan overgeslagen/.test(r)));
  } finally {
    global.fetch = oudFetch; console.error = oudErr;
    if (oudUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oudUrl;
    if (oudKey === undefined) delete process.env.SUPABASE_SERVICE_KEY; else process.env.SUPABASE_SERVICE_KEY = oudKey;
  }
});

// Melding Nina 11-11-2026: per analyse mag je drie foto's sturen, en de teller telde
// analyses. Daardoor kon je 9 foto's gratis laten bekijken. Nu telt hij foto's.
test('fotopoort: telt foto\'s, niet analyses', async () => {
  const gate = makePhotoGate({ limits: { gratis: 3, extra: 5 }, now: () => Date.parse('2026-11-11T10:00:00Z'), lookupToken: async (t) => t === 'l-ok' });
  const roep = (req) => new Promise((resolve) => {
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; resolve({ door: false, res: this }); } };
    gate.middleware({ headers: { origin: 'https://www.eazy-fix.nl', ...(req.token ? { 'x-lead-token': req.token } : {}) }, ip: req.ip, body: { images: Array(req.n).fill({}) } }, res, () => resolve({ door: true, res }));
  });
  assert.equal((await roep({ ip: 'a', n: 2 })).door, true);
  const te = await roep({ ip: 'a', n: 2 });
  assert.equal(te.door, false, 'twee nieuwe foto\'s passen niet meer in de laatste gratis foto');
  assert.equal(te.res.statusCode, 403);
  assert.equal(te.res.body.leadRequired, true);
  assert.equal((await roep({ ip: 'a', n: 1 })).door, true, 'de derde gratis foto mag wel');
  assert.equal((await roep({ ip: 'a', n: 1 })).res.statusCode, 403, 'daarna formulier');
  assert.equal((await roep({ ip: 'a', n: 3, token: 'l-ok' })).door, true, '3 van de 5 extra');
  assert.equal((await roep({ ip: 'a', n: 3, token: 'l-ok' })).res.statusCode, 429, 'meer dan 5 extra');
  assert.equal((await roep({ ip: 'a', n: 2, token: 'l-ok' })).door, true, 'precies 5 extra');
  assert.equal((await roep({ ip: 'b', n: 3 })).door, true, 'andere bezoeker: 3 gratis in één keer');
});
