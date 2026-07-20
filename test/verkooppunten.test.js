const { test } = require('node:test');
const assert = require('node:assert');
const { findVerkooppunten, findWithMatch, formatStore, STORES, VERKOOPPUNT_TOOL, runTool } = require('../src/verkooppunten');

// DE-data: ~34 verkooppunten uit de eazy-fix.de-sitemap. Hornbach-filialen dragen
// een stad; losse vakhandel-bedrijven hebben city=null (de DE-pagina's bevatten
// geen adres). Slechts een handvol heeft een postcode, dus een postcode-zoekactie
// vindt de Hornbach-filialen per definitie niet: daarvoor is kind 'ask_city'.

test('dataset is geladen en niet leeg', () => {
  assert.ok(Array.isArray(STORES) && STORES.length > 20);
  for (const s of STORES.slice(0, 5)) assert.ok(s.name);
  // Een flink deel heeft een stad (de Hornbach-filialen).
  assert.ok(STORES.filter((s) => s.city).length >= 15);
});

test('plaatsnaam Essen vindt een Hornbach-filiaal', () => {
  const r = findVerkooppunten('Essen');
  assert.ok(r.some((s) => /hornbach/i.test(s.name)), 'Hornbach Essen moet erbij zitten');
});

test('deel-plaatsnaam matcht (Leipzig vindt Leipzig en Leipzig-Alte Messe)', () => {
  const r = findVerkooppunten('Leipzig', 3);
  assert.ok(r.length >= 1);
  assert.ok(r.every((s) => /leipzig/i.test(s.city || '')));
});

test('onbekende plaats geeft lege lijst', () => {
  assert.deepEqual(findVerkooppunten('Atlantis'), []);
});

test('lege query geeft lege lijst', () => {
  assert.deepEqual(findVerkooppunten(''), []);
  assert.deepEqual(findVerkooppunten(null), []);
});

test('limit wordt gerespecteerd', () => {
  assert.ok(findVerkooppunten('Leipzig', 1).length <= 1);
});

test('formatStore geeft compacte regel met naam en plaats', () => {
  const line = formatStore({ name: 'Hornbach Test', street: null, zip: null, city: 'ESSEN', phone: null, url: 'https://www.eazy-fix.de/verkooppunten/x/' });
  assert.match(line, /Hornbach Test/);
  assert.match(line, /ESSEN/);
});

test('tool-spec heeft juiste naam en verplicht plaats-veld', () => {
  assert.equal(VERKOOPPUNT_TOOL.name, 'find_verkooppunt');
  assert.deepEqual(VERKOOPPUNT_TOOL.input_schema.required, ['plaats']);
});

test('runTool find_verkooppunt geeft Hornbach-tekst bij Essen', () => {
  const out = runTool('find_verkooppunt', { plaats: 'Essen' });
  assert.match(out, /Hornbach/);
});

test('runTool geeft nette DE-tekst als niets gevonden, met binnendienst-verwijzing', () => {
  const out = runTool('find_verkooppunt', { plaats: 'Atlantis' });
  assert.match(out, /Keine EAZYFIX-Verkaufsstelle/);
  assert.match(out, /eazy-fix\.de/);
  assert.match(out, /\+31 85 201 201 1/);
});

test('plaatsmatch labelt "in <plaats>" zonder overclaim (geen "nächstgelegene")', () => {
  const stad = runTool('find_verkooppunt', { plaats: 'Essen' });
  assert.match(stad, /Verkaufsstellen in Essen/i);
  assert.doesNotMatch(stad, /nächstgelegene/i);
});

test('onbekende tool geeft foutmelding', () => {
  assert.match(runTool('onzin', {}), /Onbekende tool/);
});

// Regressie uit de analyse van de live-chat (docs/chatanalyse-DE-2026-07.md):
// een Duitse klant noemt normaal zijn postcode, maar 25 van de 29 verkooppunten
// met plaats hebben geen postcode in de brondata. De oude regex ging bovendien
// uit van de Nederlandse 4-cijferige vorm. Zonder opvang kreeg de klant dus
// "niets gevonden", ook als er een filiaal in zijn eigen stad staat.
test('Duitse postcode zonder treffer vraagt om de plaatsnaam in plaats van niets te vinden', () => {
  const { stores, kind } = findWithMatch('85049');
  assert.equal(kind, 'ask_city');
  assert.deepEqual(stores, []);
  const out = runTool('find_verkooppunt', { plaats: '85049' });
  assert.match(out, /Ortsnamen/);
  assert.match(out, /eazy-fix\.de/);
  assert.doesNotMatch(out, /Keine EAZYFIX-Verkaufsstelle gefunden/);
});

test('postcode van een verkooppunt mét postcode vindt de regio (5-cijferig, DE-vorm)', () => {
  const zipStores = STORES.filter((s) => s.zip);
  assert.ok(zipStores.length > 0, 'testdata moet minstens één postcode bevatten');
  const { stores, kind } = findWithMatch(zipStores[0].zip);
  assert.equal(kind, 'region');
  assert.ok(stores.length >= 1);
});

test('gevonden verkooppunt krijgt altijd de voorraad-disclaimer mee', () => {
  const out = runTool('find_verkooppunt', { plaats: 'Essen' });
  assert.match(out, /Lagerbestand/);
  assert.match(out, /anzurufen/);
});

test('niets gevonden stuurt niet naar een verre verkooppunt maar naar de webshop', () => {
  const out = runTool('find_verkooppunt', { plaats: 'Atlantis' });
  assert.match(out, /Webshop/);
  assert.match(out, /nicht zu einer weit entfernten Verkaufsstelle/);
});
