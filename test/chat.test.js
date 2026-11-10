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

// Port van eazyfix-bot / repair-care-bot 5a9d74c (RC-feedback #164/#165): de
// video-uitnodiging is een letterlijke DE-voorbeeldzin die het model ook onder een
// Engels antwoord zou plakken. (Nog geen Duitse videobron, dus functie direct getest.)
test('video-uitnodiging vraagt om de zin in de taal van het antwoord, met Engels voorbeeld', () => {
  const { videoInviteNote } = require('../src/chat');
  const note = videoInviteNote([{ title: 'Holzfäule reparieren' }]);
  assert.match(note, /in der Sprache deiner Antwort/);
  assert.match(note, /Have a look at the video below/);
});

// Port eazyfix-bot 5530fbf (review 10-11-2026): de locatie ging op vier decimalen (ongeveer 10 meter) naar het
// model en de weerdienst en stond in het logboek. Nu afgerond op ongeveer een kilometer.
test('locatie: afgerond op twee decimalen, onmogelijke waarden vervallen', () => {
  const { roundGeo } = require('../src/chat');
  assert.deepEqual(roundGeo({ lat: 51.688312, lon: 5.303961 }), { lat: 51.69, lon: 5.3 });
  assert.deepEqual(roundGeo({ lat: '51.688312', lon: '5.303961' }), { lat: 51.69, lon: 5.3 });
  for (const fout of [null, undefined, 'x', {}, { lat: null, lon: 5 }, { lat: 'x', lon: 5 }, { lat: 91, lon: 5 }, { lat: 52, lon: 181 }, { lat: '', lon: '' }]) {
    assert.equal(roundGeo(fout), null);
  }
  const note = geoNote({ lat: 51.688312, lon: 5.303961 });
  assert.match(note, /Breitengrad 51\.69, Längengrad 5\.3\./);
  assert.doesNotMatch(note, /51\.688|5\.3039/);
});

test('locatie: weerdienst krijgt afgeronde coördinaten en het logboek geen locatie', async () => {
  const fs = require('node:fs'), path = require('node:path');
  const weather = fs.readFileSync(path.join(__dirname, '..', 'src', 'weather.js'), 'utf8');
  assert.doesNotMatch(weather, /postcode=|lat=|lon=|plaats=/);
  assert.match(weather, /inp\.lat = Math\.round\(Number\(inp\.lat\) \* 100\) \/ 100;/);
  const index = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8');
  assert.doesNotMatch(index, /console\.log\(`  tool: \$\{(b\.)?name\}\(\$\{JSON\.stringify\((b\.)?input\)\}\)`\)[,;]/);
  assert.equal(index.split('const geo = roundGeo(req.body.geo);').length - 1, 2);
  assert.doesNotMatch(index, /const \{[^}]*\bgeo\b[^}]*\} = req\.body/);
});

test('locatie: de chatpagina vraagt niet meer om de locatie bij het openen', () => {
  const html = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.equal(html.split('getCurrentPosition(').length - 1, 1, 'één plek, binnen vraagLocatieBijWeervraag');
  assert.match(html, /function vraagLocatieBijWeervraag\(text\) \{\s+if \(geo \|\| geoGevraagd \|\| !navigator\.geolocation \|\| !WEER_RE\.test\(text\)\) return Promise\.resolve\(\);/);
  assert.match(html, /await vraagLocatieBijWeervraag\(text\);\s+const resp = await apiFetch\('\/api\/chat\/stream'/);
});
