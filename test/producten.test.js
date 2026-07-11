const { test } = require('node:test');
const assert = require('node:assert');
const { productsInText } = require('../src/producten');

test('één product zonder voorbehandeling → één tegel (Houtplamuur)', () => {
  const r = productsInText('Voor die krasjes in gezond hout gebruik je EAZYFIX® Premium Houtplamuur.');
  assert.equal(r.length, 1);
  assert.match(r[0].name, /plamuur/i);
});

test('één keer Houtrotvuller → tegel + companion Houtversterker', () => {
  const r = productsInText('Vul de plek met EAZYFIX® Premium Houtrotvuller (2:1).');
  assert.equal(r.length, 2);
  assert.match(r[0].name, /Houtrotvuller/i);
  assert.match(r[0].url, /^https:\/\/www\.eazy-fix\.nl\/product\/premium-houtrotvuller\/$/);
  assert.match(r[1].name, /houtversterker/i);
});

test('meerdere producten genoemd → tegel van het eerst genoemde product', () => {
  const text = 'Je kunt Premium Houtrotvuller gebruiken, of voor cosmetische schade Premium Houtplamuur, en eventueel de houtrotfrees.';
  const r = productsInText(text);
  // Eerst genoemd = Houtrotvuller (+ companion Houtversterker omdat die voorbehandeling vereist).
  assert.equal(r[0].name, 'EAZYFIX® Premium Houtrotvuller');
  assert.equal(r.length, 2);
});

test('alleen Houtversterker genoemd → geen tegel (companion telt niet als advies)', () => {
  assert.deepEqual(productsInText('De Houtversterker verstevigt het hout.'), []);
});

test('geen productnaam → lege lijst', () => {
  assert.deepEqual(productsInText('Hoe gaat het met je?'), []);
});

test('leeg/ongeldig → lege lijst', () => {
  assert.deepEqual(productsInText(''), []);
  assert.deepEqual(productsInText(null), []);
});
