const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// De faseLabel-logica leeft in de widget. We draaien de ECHTE functie uit
// index.html, zodat de test niet een kopie test die kan wegdrijven van de
// werkelijkheid. Eazyfix-DE is een single-foto widget (geen bepaalSet/multi-foto-
// bookkeeping zoals in repair-care-bot-de), dus alleen faseLabel wordt getest.
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

test('faseLabel uit index.html vertaalt de fase-codes naar Duitse labels', () => {
  const m = html.match(/function faseLabel\(phase\)\s*\{[\s\S]*?\n    \}/);
  assert.ok(m, 'faseLabel niet gevonden in index.html');
  // eslint-disable-next-line no-new-func
  const faseLabel = new Function(m[0] + '\n return faseLabel;')();
  assert.strictEqual(faseLabel('foto'), 'Foto ansehen');
  assert.strictEqual(faseLabel('schade'), 'Schaden bestimmen');
  assert.strictEqual(faseLabel('kennisbank'), 'Wissensdatenbank abfragen');
  assert.strictEqual(faseLabel('advies'), 'Rat formulieren');
  assert.strictEqual(faseLabel('onbekend'), '');
});
