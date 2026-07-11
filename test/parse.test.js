const { test } = require('node:test');
const assert = require('node:assert');
const { stripTags } = require('../src/parse');

test('nette trailing PRODUCTS/FLOW worden gestript en gelezen', () => {
  const raw = 'Wat ik zie: matig.\n\nStappenplan:\n- frees\n\nPRODUCTS: 1,5\nFLOW: houtrot';
  const r = stripTags(raw);
  assert.equal(r.flow, 'houtrot');
  assert.deepEqual(r.productIds, ['1', '5']);
  assert.ok(!/PRODUCTS|FLOW/i.test(r.text), 'tags mogen niet in tekst staan');
  assert.ok(r.text.endsWith('- frees'));
});

test('gelekte parenthese-tag (lowercase, NL, middot) wordt gestript en gelezen', () => {
  const raw = 'Wat ik zie: ernstig.\n\nStappenplan:\n- frees\n\n(flow: houtrot · producten: 1, 5)';
  const r = stripTags(raw);
  assert.equal(r.flow, 'houtrot');
  assert.deepEqual(r.productIds, ['1', '5']);
  assert.ok(!r.text.includes('('), 'parenthese-tag mag niet in tekst staan');
  assert.ok(!/flow|producten/i.test(r.text));
});

test('parenthese-tag midden in tekst wordt ook verwijderd', () => {
  const raw = 'Begin (flow: klein · producten: 2) einde';
  const r = stripTags(raw);
  assert.equal(r.flow, 'klein');
  assert.deepEqual(r.productIds, ['2']);
  assert.ok(!/flow/i.test(r.text));
});

test('geen tags: tekst onveranderd, flow null, products leeg', () => {
  const r = stripTags('Gewoon antwoord zonder tags.');
  assert.equal(r.text, 'Gewoon antwoord zonder tags.');
  assert.equal(r.flow, null);
  assert.deepEqual(r.productIds, []);
});

test('ongeldige flow-waarde wordt genegeerd', () => {
  const r = stripTags('tekst\n\nFLOW: onzin');
  assert.equal(r.flow, null);
});

test('max 3 product-ids; niet-numeriek wordt weggefilterd', () => {
  const r = stripTags('x\n\nPRODUCTS: 1, 5, 8, 17, abc');
  assert.deepEqual(r.productIds, ['1', '5', '8']);
});

test('niet-string invoer geeft veilige lege uitkomst', () => {
  const r = stripTags(null);
  assert.equal(r.text, '');
  assert.equal(r.flow, null);
  assert.deepEqual(r.productIds, []);
});
