const { test } = require('node:test');
const assert = require('node:assert');
const { parseDiagnose, buildRagQuery, unclearReply, nietHoutReply } = require('../src/image-diagnose');

test('parseDiagnose leest is_hout false en materiaal', () => {
  const d = parseDiagnose('{"duidelijk": true, "is_hout": false, "materiaal": "baksteen/metselwerk", "reden_onduidelijk": "", "schade_type": "anders", "ernst": "matig", "zoektermen": []}');
  assert.strictEqual(d.isHout, false);
  assert.strictEqual(d.materiaal, 'baksteen/metselwerk');
});

test('parseDiagnose laat isHout standaard true als veld ontbreekt', () => {
  const d = parseDiagnose('{"duidelijk": true, "reden_onduidelijk": "", "schade_type": "houtrot", "ernst": "matig", "zoektermen": []}');
  assert.strictEqual(d.isHout, true);
});

test('nietHoutReply benoemt Holzreparatur en het materiaal, geen em-streepje', () => {
  const r = nietHoutReply({ materiaal: 'Ziegel/Mauerwerk' });
  assert.match(r, /Holzreparatur/i);
  assert.match(r, /Ziegel\/Mauerwerk/);
  assert.doesNotMatch(r, /—|–/);
});

test('nietHoutReply werkt zonder materiaal', () => {
  const r = nietHoutReply({ materiaal: '' });
  assert.match(r, /Holzreparatur/i);
});

test('parseDiagnose leest kaal JSON', () => {
  const d = parseDiagnose('{"duidelijk": true, "reden_onduidelijk": "", "schade_type": "houtrot", "ernst": "ernstig", "zoektermen": ["a", "b"]}');
  assert.strictEqual(d.duidelijk, true);
  assert.strictEqual(d.schadeType, 'houtrot');
  assert.strictEqual(d.ernst, 'ernstig');
  assert.deepStrictEqual(d.zoektermen, ['a', 'b']);
});

test('parseDiagnose pelt omringende tekst en markdown weg', () => {
  const d = parseDiagnose('Hier is het:\n```json\n{"duidelijk": false, "reden_onduidelijk": "te donker", "schade_type": "anders", "ernst": "matig", "zoektermen": []}\n```\nklaar');
  assert.strictEqual(d.duidelijk, false);
  assert.strictEqual(d.redenOnduidelijk, 'te donker');
});

test('parseDiagnose geeft null bij onparseerbare of vormloze input', () => {
  assert.strictEqual(parseDiagnose('geen json hier'), null);
  assert.strictEqual(parseDiagnose('{"foo": 1}'), null);
  assert.strictEqual(parseDiagnose(''), null);
  assert.strictEqual(parseDiagnose(null), null);
});

test('parseDiagnose normaliseert ongeldige ernst naar matig en niet-array zoektermen naar leeg', () => {
  const d = parseDiagnose('{"duidelijk": true, "schade_type": "cosmetisch", "ernst": "kapot", "zoektermen": "nope"}');
  assert.strictEqual(d.ernst, 'matig');
  assert.deepStrictEqual(d.zoektermen, []);
  assert.strictEqual(d.redenOnduidelijk, '');
});

test('buildRagQuery combineert zoektermen en schade_type', () => {
  const q = buildRagQuery({ schadeType: 'houtrot', zoektermen: ['kozijn zacht hout', 'houtrotvuller'] });
  assert.match(q, /houtrot/);
  assert.match(q, /kozijn zacht hout/);
  assert.match(q, /houtrotvuller/);
});

test('buildRagQuery werkt met lege zoektermen', () => {
  const q = buildRagQuery({ schadeType: 'cosmetisch', zoektermen: [] });
  assert.strictEqual(q.trim(), 'cosmetisch');
});

test('unclearReply vraagt om betere foto en noemt de reden', () => {
  const r = unclearReply({ redenOnduidelijk: 'te donker, maak een close-up' });
  assert.match(r, /foto/i);
  assert.match(r, /te donker, maak een close-up/);
  assert.doesNotMatch(r, /—|–/);
});

test('unclearReply werkt zonder reden', () => {
  const r = unclearReply({ redenOnduidelijk: '' });
  assert.match(r, /foto/i);
  assert.doesNotMatch(r, /—|–/);
});
