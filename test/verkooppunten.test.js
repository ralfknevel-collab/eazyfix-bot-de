const { test } = require('node:test');
const assert = require('node:assert');
const { findVerkooppunten, findWithMatch, formatStore, STORES, VERKOOPPUNT_TOOL, runTool } = require('../src/verkooppunten');

// DE-data (bijgewerkt 2026-07-21 na navraag bij de binnendienst): van de eerdere
// ~34 adressen is momenteel alleen HolzLand MAHL (Hünxe-Drevenack) een ACTIEF fysiek
// verkooppunt. De ~25 Hornbach-filialen zijn ruim een jaar geleden gestopt; de
// overige adressen staan nog op prospect. EAZYFIX is voor Duitsland vooral online
// (webshop, Amazon, Hornbach online). De tool dient dus vooral om, als iemand toevallig
// bij Hünxe woont, dat ene filiaal te noemen, en anders eerlijk naar online te sturen.

test('dataset is geladen en niet leeg', () => {
  assert.ok(Array.isArray(STORES) && STORES.length >= 1);
  for (const s of STORES) assert.ok(s.name);
  // Het enige actieve filiaal heeft een plaats.
  assert.ok(STORES.some((s) => s.city));
});

test('plaatsnaam Hünxe vindt HolzLand MAHL', () => {
  const r = findVerkooppunten('Hünxe');
  assert.ok(r.some((s) => /mahl/i.test(s.name)), 'HolzLand MAHL moet erbij zitten');
});

test('deel-plaatsnaam matcht (Drevenack vindt Hünxe - Drevenack)', () => {
  const r = findVerkooppunten('Drevenack', 3);
  assert.ok(r.length >= 1);
  assert.ok(r.every((s) => /drevenack/i.test(s.city || '')));
});

test('onbekende plaats geeft lege lijst', () => {
  assert.deepEqual(findVerkooppunten('Atlantis'), []);
});

test('lege query geeft lege lijst', () => {
  assert.deepEqual(findVerkooppunten(''), []);
  assert.deepEqual(findVerkooppunten(null), []);
});

test('limit wordt gerespecteerd', () => {
  assert.ok(findVerkooppunten('Hünxe', 1).length <= 1);
});

test('formatStore geeft compacte regel met naam en plaats', () => {
  const line = formatStore({ name: 'HolzLand MAHL', street: null, zip: null, city: 'Hünxe', phone: null, url: 'https://www.eazy-fix.de/verkooppunten/x/' });
  assert.match(line, /HolzLand MAHL/);
  assert.match(line, /Hünxe/);
});

test('tool-spec heeft juiste naam en verplicht plaats-veld', () => {
  assert.equal(VERKOOPPUNT_TOOL.name, 'find_verkooppunt');
  assert.deepEqual(VERKOOPPUNT_TOOL.input_schema.required, ['plaats']);
});

test('runTool find_verkooppunt geeft HolzLand MAHL bij Hünxe', () => {
  const out = runTool('find_verkooppunt', { plaats: 'Hünxe' });
  assert.match(out, /MAHL/);
});

test('runTool geeft nette DE-tekst als niets gevonden, met binnendienst-verwijzing', () => {
  const out = runTool('find_verkooppunt', { plaats: 'Atlantis' });
  assert.match(out, /Keine EAZYFIX-Verkaufsstelle/);
  assert.match(out, /eazy-fix\.de/);
  assert.match(out, /03222 1097923/);
});

test('plaatsmatch labelt "in <plaats>" zonder overclaim (geen "nächstgelegene")', () => {
  const stad = runTool('find_verkooppunt', { plaats: 'Hünxe' });
  assert.match(stad, /Verkaufsstellen in Hünxe/i);
  assert.doesNotMatch(stad, /nächstgelegene/i);
});

test('onbekende tool geeft foutmelding', () => {
  assert.match(runTool('onzin', {}), /Onbekende tool/);
});

// Regressie uit de analyse van de live-chat (docs/chatanalyse-DE-2026-07.md):
// een Duitse klant noemt normaal zijn postcode, maar het actieve verkooppunt (en de
// meeste oude adressen) staat in de brondata zonder bruikbare postcode-dekking per
// regio. De oude regex ging bovendien uit van de Nederlandse 4-cijferige vorm. Zonder
// opvang kreeg de klant dus "niets gevonden", ook als er een filiaal in zijn stad staat.
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
  const out = runTool('find_verkooppunt', { plaats: 'Hünxe' });
  assert.match(out, /Lagerbestand/);
  assert.match(out, /anzurufen/);
});

test('niets gevonden stuurt niet naar een verre verkooppunt maar naar de webshop', () => {
  const out = runTool('find_verkooppunt', { plaats: 'Atlantis' });
  assert.match(out, /Webshop/);
  assert.match(out, /nicht zu einer weit entfernten Verkaufsstelle/);
});

// Correctie 2026-07-21: de 25 Hornbach-filialen zijn gestopt en staan niet meer in de
// data; de bot mag klanten dus niet naar een Hornbach-filiaal in hun stad sturen.
test('gestopte Hornbach-filialen zitten niet meer in de dataset', () => {
  assert.equal(findVerkooppunten('Essen').length, 0);
  assert.equal(findVerkooppunten('Leipzig').length, 0);
  assert.ok(!STORES.some((s) => /hornbach/i.test(s.name)));
});

// Niets-gevonden en ask_city sturen naar de online-kanalen (Amazon/Hornbach online),
// niet naar de niet meer bestaande verkooppunten-kaart op de Duitse site.
test('fallback verwijst naar online-kanalen, niet naar een dode kaart', () => {
  const geen = runTool('find_verkooppunt', { plaats: 'Atlantis' });
  assert.match(geen, /Amazon|HORNBACH online/);
  assert.doesNotMatch(geen, /verkaufsstellen-karte|\/verkaufsstellen/i);
  const plz = runTool('find_verkooppunt', { plaats: '12345' });
  assert.match(plz, /Amazon|HORNBACH online/);
});
