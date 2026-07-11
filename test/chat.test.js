const { test } = require('node:test');
const assert = require('node:assert');
const { buildChatContext, geoNote } = require('../src/chat');
const { BASE_SYSTEM_PROMPT } = require('../src/persona');

// buildChatContext is de GEDEELDE bron voor zowel /api/chat (runChat) als
// /api/chat/stream. Deze tests leggen het contract vast zodat de twee chatpaden
// niet uit elkaar lopen (Codex-bevinding #1: pariteit stream vs non-stream).

test('persona staat altijd als eerste systeemblok en wordt gecachet', () => {
  const { system } = buildChatContext('hoe repareer ik houtrot', {});
  assert.equal(system[0].text, BASE_SYSTEM_PROMPT);
  assert.deepEqual(system[0].cache_control, { type: 'ephemeral' });
});

test('geo-hint wordt toegevoegd bij geldige coördinaten en weggelaten zonder', () => {
  const metGeo = buildChatContext('kan ik vandaag buiten klussen', { geo: { lat: 52.09, lon: 5.12 } });
  const laatste = metGeo.system[metGeo.system.length - 1].text;
  assert.match(laatste, /GEDEELDE LOCATIE/);
  assert.match(laatste, /weather_lookup/);

  const zonderGeo = buildChatContext('kan ik vandaag buiten klussen', {});
  assert.ok(!zonderGeo.system.some((b) => /GEDEELDE LOCATIE/.test(b.text)));
});

test('geoNote geeft lege string bij ontbrekende of ongeldige coördinaten', () => {
  assert.equal(geoNote(undefined), '');
  assert.equal(geoNote({}), '');
  assert.equal(geoNote({ lat: 'x', lon: 5 }), '');
  assert.match(geoNote({ lat: 52, lon: 5 }), /breedtegraad 52/);
});

test('video-intentie levert videokaartje + uitnodigingsblok, geo blijft laatste', () => {
  const { system, videos } = buildChatContext('hoe repareer ik houtrot in mijn kozijn', { geo: { lat: 52, lon: 5 } });
  assert.ok(videos.length >= 1, 'verwacht een passende video');
  assert.ok(system.some((b) => /VIDEOKAARTJE/.test(b.text)), 'verwacht een video-uitnodigingsblok');
  // Geo-hint hoort als laatste blok te staan, ook als er een videoblok bij komt.
  assert.match(system[system.length - 1].text, /GEDEELDE LOCATIE/);
});

test('koop-/prijsvraag levert geen videokaartje', () => {
  const { videos, system } = buildChatContext('wat kost de houtrotvuller', {});
  assert.deepEqual(videos, []);
  assert.ok(!system.some((b) => /VIDEOKAARTJE/.test(b.text)));
});
