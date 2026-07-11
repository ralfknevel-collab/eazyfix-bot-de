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
