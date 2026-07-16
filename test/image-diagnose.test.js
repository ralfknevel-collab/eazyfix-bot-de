const { test } = require('node:test');
const assert = require('node:assert');
const { parseDiagnose, buildRagQuery, unclearReply, nietHoutReply, buildAnalysisPrompt, analyseFases } = require('../src/image-diagnose');

// Regressie: gebruiker stuurde foto + vraag in één beurt en kreeg 2 antwoorden
// (feedback rij 6, DE). De vraag hoort als bijschrift IN de foto-analyse, zodat
// er één antwoord komt. Deze tests borgen dat de prompt het bijschrift meeneemt.
test('buildAnalysisPrompt: één foto, geen gesprek, geen bijschrift', () => {
  const t = buildAnalysisPrompt({ imageCount: 1, hasPrior: false, caption: '' });
  assert.match(t, /Analysiere dieses Foto/);
  assert.doesNotMatch(t, /läuft bereits/);
  assert.doesNotMatch(t, /schreibt dazu/);
});

test('buildAnalysisPrompt: bijschrift wordt letterlijk meegenomen', () => {
  const t = buildAnalysisPrompt({ imageCount: 1, caption: 'Ist das Holzfäule?' });
  assert.match(t, /Der Nutzer schreibt dazu: "Ist das Holzfäule\?"/);
  assert.match(t, /konkret darauf ein/);
});

test('buildAnalysisPrompt: leeg/whitespace bijschrift voegt niets toe', () => {
  const t = buildAnalysisPrompt({ imageCount: 1, caption: '   ' });
  assert.doesNotMatch(t, /schreibt dazu/);
});

test('buildAnalysisPrompt: meerdere foto\'s + lopend gesprek + bijschrift', () => {
  const t = buildAnalysisPrompt({ imageCount: 3, hasPrior: true, caption: 'Wie tief muss ich fräsen?' });
  assert.match(t, /diese 3 Fotos/);
  assert.match(t, /läuft bereits/);
  assert.match(t, /Wie tief muss ich fräsen\?/);
});

test('buildAnalysisPrompt: defaults (geen argument) = één foto zonder extra\'s', () => {
  const t = buildAnalysisPrompt();
  assert.match(t, /Analysiere dieses Foto/);
  assert.doesNotMatch(t, /läuft bereits/);
  assert.doesNotMatch(t, /schreibt dazu/);
});

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

// analyseFases bepaalt de fase-stappen en route voor de streaming-endpoint.
// Zie de uitgebreide toelichting in image-diagnose.js: anders dan de Repair-Care-
// variant is een mislukte pass-1 (diagnose null) hier GEEN "unclear"-route, maar
// gaat door naar 'advies' (het model mag zelf zoek_kennis als vangnet aanroepen).
test('analyseFases: productfoto geeft route product zonder kennisbank/advies-fase', () => {
  const p = analyseFases({ isProduct: true, isHout: true, duidelijk: true });
  assert.strictEqual(p.route, 'product');
  assert.deepStrictEqual(p.fases, ['foto', 'schade']);
});

test('analyseFases: geen hout geeft route niethout', () => {
  const p = analyseFases({ isProduct: false, isHout: false, duidelijk: true });
  assert.strictEqual(p.route, 'niethout');
  assert.deepStrictEqual(p.fases, ['foto', 'schade']);
});

test('analyseFases: onduidelijke foto geeft route unclear', () => {
  const p = analyseFases({ isProduct: false, isHout: true, duidelijk: false });
  assert.strictEqual(p.route, 'unclear');
  assert.deepStrictEqual(p.fases, ['foto', 'schade']);
});

test('analyseFases: duidelijke houtfoto geeft route advies met alle 4 fases', () => {
  const p = analyseFases({ isProduct: false, isHout: true, duidelijk: true });
  assert.strictEqual(p.route, 'advies');
  assert.deepStrictEqual(p.fases, ['foto', 'schade', 'kennisbank', 'advies']);
});

test('analyseFases: mislukte diagnose (null) gaat door naar advies, geen unclear', () => {
  const p = analyseFases(null);
  assert.strictEqual(p.route, 'advies');
  assert.deepStrictEqual(p.fases, ['foto', 'schade', 'kennisbank', 'advies']);
});

test('analyseFases: product staat vóór niethout/unclear in de volgorde van checks', () => {
  // is_hout false EN is_product true: product wint (net als de niet-streaming handler).
  const p = analyseFases({ isProduct: true, isHout: false, duidelijk: false });
  assert.strictEqual(p.route, 'product');
});
