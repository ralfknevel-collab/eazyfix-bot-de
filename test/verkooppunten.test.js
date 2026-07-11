const { test } = require('node:test');
const assert = require('node:assert');
const { findVerkooppunten, formatStore, STORES, VERKOOPPUNT_TOOL, runTool } = require('../src/verkooppunten');

test('dataset is geladen en niet leeg', () => {
  assert.ok(Array.isArray(STORES) && STORES.length > 100);
  for (const s of STORES.slice(0, 5)) assert.ok(s.name && s.city);
});

test('plaatsnaam IJsselstein vindt Bijvoet', () => {
  const r = findVerkooppunten('IJsselstein');
  assert.ok(r.some((s) => /bijvoet/i.test(s.name)), 'Bijvoet moet erbij zitten');
});

test('postcode 3401 valt in dezelfde regio als IJsselstein', () => {
  const r = findVerkooppunten('3401 MS');
  assert.ok(r.length > 0);
  assert.ok(r.every((s) => s.zip.slice(0, 2) === '34'));
});

test('onbekende plaats geeft lege lijst', () => {
  assert.deepEqual(findVerkooppunten('Atlantis'), []);
});

test('lege query geeft lege lijst', () => {
  assert.deepEqual(findVerkooppunten(''), []);
  assert.deepEqual(findVerkooppunten(null), []);
});

test('limit wordt gerespecteerd', () => {
  assert.ok(findVerkooppunten('Amsterdam', 2).length <= 2);
});

test('formatStore geeft compacte regel met naam en plaats', () => {
  const line = formatStore({ name: 'Test BV', street: 'Weg 1', zip: '1234AB', city: 'TESTSTAD', phone: '+3110', url: 'x.nl' });
  assert.match(line, /Test BV/);
  assert.match(line, /TESTSTAD/);
});

test('tool-spec heeft juiste naam en verplicht plaats-veld', () => {
  assert.equal(VERKOOPPUNT_TOOL.name, 'find_verkooppunt');
  assert.deepEqual(VERKOOPPUNT_TOOL.input_schema.required, ['plaats']);
});

test('runTool find_verkooppunt geeft Bijvoet-tekst bij IJsselstein', () => {
  const out = runTool('find_verkooppunt', { plaats: 'IJsselstein' });
  assert.match(out, /Bijvoet/);
});

test('runTool geeft nette tekst als niets gevonden, met binnendienst-verwijzing', () => {
  const out = runTool('find_verkooppunt', { plaats: 'Atlantis' });
  assert.match(out, /Geen EAZYFIX-verkooppunt/);
  assert.match(out, /eazy-fix\.nl/);
  assert.match(out, /\+31 \(0\)85 201 201 1/);
});

test('plaatsmatch labelt "in <plaats>", postcode-match labelt "in de regio" (geen overclaim)', () => {
  const stad = runTool('find_verkooppunt', { plaats: 'IJsselstein' });
  assert.match(stad, /verkooppunten in IJsselstein/i);
  assert.doesNotMatch(stad, /dichtstbijzijnde/i);

  const regio = runTool('find_verkooppunt', { plaats: '3401 MS' });
  assert.match(regio, /in de regio/i);
  assert.doesNotMatch(regio, /dichtstbijzijnde/i);
});

test('onbekende tool geeft foutmelding', () => {
  assert.match(runTool('onzin', {}), /Onbekende tool/);
});
