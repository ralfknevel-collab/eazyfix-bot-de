const { test } = require('node:test');
const assert = require('node:assert');
const { productsInText } = require('../src/producten');

test('één product zonder voorbehandeling → één tegel (Holz Feinspachtel)', () => {
  const r = productsInText('Für die Kratzer in gesundem Holz nimmst du EAZYFIX® Premium Holz Feinspachtel.');
  assert.equal(r.length, 1);
  assert.match(r[0].name, /feinspachtel/i);
});

test('één keer Holzspachtelmasse → tegel + companion Holzimprägnierung', () => {
  const r = productsInText('Fülle die Stelle mit der EAZYFIX® Premium Holzspachtelmasse (2:1).');
  assert.equal(r.length, 2);
  assert.match(r[0].name, /Holzspachtelmasse/i);
  assert.match(r[0].url, /eazy-fix\.de\/.*premium-holzspachtelmasse\/$/);
  assert.match(r[1].name, /impr(ä|ae)gnierung/i);
});

test('meerdere producten genoemd → tegel van het eerst genoemde product', () => {
  const text = 'Du kannst die Premium Holzspachtelmasse verwenden, oder für kosmetische Schäden Premium Holz Feinspachtel, und eventuell den Holzfäule Fräser.';
  const r = productsInText(text);
  // Eerst genoemd = Holzspachtelmasse (+ companion Holzimprägnierung omdat die voorbehandeling vereist).
  assert.match(r[0].name, /Holzspachtelmasse/i);
  assert.equal(r.length, 2);
});

test('alleen Holzimprägnierung genoemd → geen tegel (companion telt niet als advies)', () => {
  assert.deepEqual(productsInText('Die EAZYFIX® Holzimprägnierung verfestigt das Holz.'), []);
});

test('geen productnaam → lege lijst', () => {
  assert.deepEqual(productsInText('Wie geht es dir?'), []);
});

test('leeg/ongeldig → lege lijst', () => {
  assert.deepEqual(productsInText(''), []);
  assert.deepEqual(productsInText(null), []);
});

// Port van eazyfix-bot (fotovergelijking 20-10-2026): het AFGERADEN product kreeg het
// kaartje als de productnaam in een ontkenning stond. Een ontkenning direct vóór de
// productnaam telt niet als advies.
test('ontkenning direct vóór de productnaam telt niet; het geadviseerde product krijgt het kaartje', () => {
  const r = productsInText('Nimm hier keinen EAZYFIX® Premium Holz Feinspachtel, sondern EAZYFIX® Premium Holzspachtelmasse.');
  assert.equal(r.length, 2);
  assert.match(r[0].name, /Holzspachtelmasse/);
  assert.match(r[1].name, /Holzimprägnierung/);
  const r2 = productsInText('Bei Fäule hilft kein Feinspachtel. Fräse das weiche Holz mit dem EAZYFIX® Holzfäule-Fräser weg.');
  assert.equal(r2.length, 1);
  assert.match(r2[0].name, /Fräser/);
  const ok = productsInText('Für die Risse im gesunden Holz passt EAZYFIX® Premium Holz Feinspachtel.');
  assert.equal(ok.length, 1);
  assert.match(ok[0].name, /Feinspachtel/);
});
