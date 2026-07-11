const { test } = require('node:test');
const assert = require('node:assert');
const { buildChatContext, geoNote } = require('../src/chat');
const { BASE_SYSTEM_PROMPT } = require('../src/persona');

// buildChatContext is de GEDEELDE bron voor zowel /api/chat (runChat) als
// /api/chat/stream. Deze tests leggen het contract vast zodat de twee chatpaden
// niet uit elkaar lopen. Teksten zijn Duits (DE-bot).

test('persona staat altijd als eerste systeemblok en wordt gecachet', () => {
  const { system } = buildChatContext('wie repariere ich Holzfäule', {});
  assert.equal(system[0].text, BASE_SYSTEM_PROMPT);
  assert.deepEqual(system[0].cache_control, { type: 'ephemeral' });
});

test('geo-hint wordt toegevoegd bij geldige coördinaten en weggelaten zonder', () => {
  const metGeo = buildChatContext('kann ich heute draußen arbeiten', { geo: { lat: 52.09, lon: 5.12 } });
  const laatste = metGeo.system[metGeo.system.length - 1].text;
  assert.match(laatste, /GETEILTER STANDORT/);
  assert.match(laatste, /weather_lookup/);

  const zonderGeo = buildChatContext('kann ich heute draußen arbeiten', {});
  assert.ok(!zonderGeo.system.some((b) => /GETEILTER STANDORT/.test(b.text)));
});

test('geoNote geeft lege string bij ontbrekende of ongeldige coördinaten', () => {
  assert.equal(geoNote(undefined), '');
  assert.equal(geoNote({}), '');
  assert.equal(geoNote({ lat: 'x', lon: 5 }), '');
  assert.match(geoNote({ lat: 52, lon: 5 }), /Breitengrad 52/);
});

test('geen Duitse videobron: video-intentie levert geen videokaart, geo blijft laatste', () => {
  const { system, videos } = buildChatContext('wie repariere ich Holzfäule im Fensterrahmen', { geo: { lat: 52, lon: 5 } });
  // Er is (nog) geen Duitse videobron, dus geen videokaart en geen video-blok.
  assert.deepEqual(videos, []);
  assert.ok(!system.some((b) => /VIDEOKARTE/.test(b.text)));
  // Geo-hint hoort als laatste blok te staan.
  assert.match(system[system.length - 1].text, /GETEILTER STANDORT/);
});

test('koop-/prijsvraag levert geen videokaart', () => {
  const { videos, system } = buildChatContext('was kostet die Holzspachtelmasse', {});
  assert.deepEqual(videos, []);
  assert.ok(!system.some((b) => /VIDEOKARTE/.test(b.text)));
});
